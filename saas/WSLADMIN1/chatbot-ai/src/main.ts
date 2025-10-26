import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 👇 Force Socket.IO to use the native adapter and bind correctly
  app.useWebSocketAdapter(new IoAdapter(app));

  // 👇 Also enable CORS globally (helps with WebSocket upgrades)
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://wsl.localhost:5173'
    ],
    credentials: true,
  });

  await app.listen(3010, '0.0.0.0');
  console.log('[chatbot-ai] ✅ WebSocket server running at: http://localhost:3010');
  console.log('[chatbot-ai] ✅ CORS origins allowed:', [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://wsl.localhost:5173'
  ]);
}

bootstrap();