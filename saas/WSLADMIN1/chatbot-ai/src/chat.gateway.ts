import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { GuardedQuestion } from './dto/events';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { UseGuards } from '@nestjs/common';
import { ScopeGuard } from './guards/scope.guard';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' },
})
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;
  constructor(private readonly chat: ChatService) {}

  async afterInit() {
    const url = process.env.REDIS_URL;
    if (url) {
      const pub = createClient({ url });
      const sub = pub.duplicate();
      await pub.connect();
      await sub.connect();
      this.server.adapter(createAdapter(pub, sub));
      // eslint-disable-next-line no-console
      console.log('[chatbot-ai] Redis adapter enabled');
    }

    this.server.on('connection', (socket) => {
      console.log('[Gateway] 🚀 Client connected:', socket.id);
      socket.onAny((event, data) => console.log('[Gateway] 📩 Event received:', event, data));
    });
  }

  @SubscribeMessage('chat:ask')
  //@UseGuards(ScopeGuard)
  async onAsk(@MessageBody() body: GuardedQuestion, @ConnectedSocket() client: Socket) {
    try {
      console.log("[Gateway] chat:ask triggered — entering handler");
      console.log("[Gateway] Full request body:", JSON.stringify(body, null, 2));

      const verdict = this.chat.isInErpScope(body?.question || '');
      console.log("[Gateway] ERP scope verdict:", verdict);

      if (!verdict.ok) {
        console.warn("[Gateway] Out of ERP scope. Sending warning message to client.");
        client.emit('chat:chunk', { text: 'Your request seems out of context, please check your sources and try again' });
        client.emit('chat:done');
        return;
      }

      console.log("[Gateway] Scope is valid. Fetching project context...");

      const ctx = await this.chat.fetchProjectContext(body.projectId);

      console.log("[Gateway] Context successfully retrieved. Length:", JSON.stringify(ctx).length);
      console.log("[Gateway] Calling askGrounded() with question:", body.question);
      const answer = await this.chat.askGrounded(
        body.projectId,
        body.question,
        ctx
      );
      console.log("[Gateway] askGrounded() returned answer. Length:", answer?.length || 0);

      for (const chunk of this.chat.chunk(answer, 36)) {
        console.log("[Gateway] Emitting chunk:", chunk);
        client.emit('chat:chunk', { text: chunk });
        await new Promise(r => setTimeout(r, 20));
      }

      console.log("[Gateway] All chunks sent. Emitting chat:done");
      client.emit('chat:done');

      // Save transcript if Prisma is configured
      console.log("[Gateway] Attempting to save transcript...");
      await this.chat.saveTranscript({
        projectId: body.projectId,
        userId: body.userId || 'demo-user',
        question: body.question,
        answer,
      });
      console.log("[Gateway] Transcript save attempted (errors ignored in MVP mode)");

    } catch (e: any) {
      console.error("[Gateway] ERROR in chat:ask handler:", e?.message);
      console.error("[Gateway] Full error stack:", e?.stack);
      client.emit('chat:error', { message: e?.message || 'Chat failed' });
    }
  }
}
