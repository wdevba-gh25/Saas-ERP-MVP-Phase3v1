import axios from 'axios';
import { PythonAiClient } from './http/python-ai.client';
import { PrismaClient } from '@prisma/client';

export class ChatService {
  private readonly ai = new PythonAiClient();
  private readonly LLM_URL = process.env.LOCAL_LLM_URL || 'http://localhost:8001/v1/completions';
  private prisma: PrismaClient | null = null;

  constructor() {
    // Initialize Prisma only if DATABASE_URL is present
    if (process.env.DATABASE_URL) {
      this.prisma = new PrismaClient();
    }
  }

  isInErpScope(q: string) {
    const s = q.toLowerCase();
    const ok = /inventory|stock|provider|supplier|purchase|order|fulfillment|quality|delivery|lead time|sales|revenue|cost|risk|po\b/.test(s);
    return { ok };
  }

async fetchProjectContext(projectId: string) {

  console.log("[ChatService]  fetchProjectContext() called with:", projectId);
  const url = `${process.env.AI_BASE || 'http://localhost:8009'}/ai/context/project/${projectId}`;
  console.log("[ChatService] Calling ERP-GATEWAY URL:", url);
  console.log("[ChatService] Attempting GET to:", url);
  try {
    const res = await axios.get(url, { timeout: 30000 });
    console.log("[ChatService] ERP-GATEWAY reachable. Context size:", JSON.stringify(res.data).length);
    console.log("[ChatService] Context received:", JSON.stringify(res.data, null, 2));
    return res.data;
  } catch (err: any) {
    console.error("[ChatService] ERP-GATEWAY unreachable:", err.code, err.message);
    console.error("[ChatService] Failed to fetch context:", err?.message);
    console.error("[ChatService] Full error:", err.toJSON?.() || err);
    console.error("[ChatService] Full error:", JSON.stringify(err?.response?.data || err, null, 2));
    throw err;
  }
}

  buildChatPrompt(question: string, ctx: any) {
    const ctxStr = JSON.stringify(ctx).slice(0, 1800);
    return `
SYSTEM INSTRUCTIONS:
You are an ERP business assistant restricted to the organization's SQL Server context.
- Answer ONLY if question is ERP-related.
- If out of scope, reply exactly: "Your request seems out of context, please check your sources and try again"
- Never invent data; reply JSON: {"answer":"...","used":{"products":[],"providers":[]}}.
- Reply with **exactly one valid JSON object** and nothing else.
- Do NOT include explanations, markdown, or prose.
- Ensure all keys are quoted, all commas are valid, and all brackets/quotes are closed.

CONTEXT_START
${ctxStr}
CONTEXT_END

TASK: chat
User: ${question}

Reply with ONLY the JSON.`;
  }

async askGrounded(projectId: string, question: string, ctx: any): Promise<string> {
  console.log("[ChatService] askGrounded() invoked");
  console.log("[ChatService] Incoming question:", question);
  console.log("[ChatService] Context received:", JSON.stringify(ctx, null, 2));


  //---------------------------------
    // Leave buildChatPrompt() in place (unchanged) but do not use it here.
    // We reuse the same provider pipeline the PDF feature uses, without touching it:
    // call the JSON-only endpoint that wraps run_ai_mode(...).
    let baseUrl = process.env.AI_BASE || "http://host.docker.internal:8009";

    // Try to detect if host.docker.internal is reachable from WSL/Linux.
    // If not, fall back to the default WSL bridge (e.g., 172.27.96.1).
    try {
      console.log("[ChatService] Checking if host.docker.internal is reachable...");
      await axios.get(`${baseUrl}/healthz`, { timeout: 2000 });
      console.log("[ChatService] host.docker.internal is reachable.");
    } catch (e) {
      console.warn("[ChatService] host.docker.internal is NOT reachable. Falling back to 172.27.96.1");
      baseUrl = "http://172.27.96.1:8009";
    }

    const url = `${baseUrl}/ai/recommend`;
    console.log("[ChatService] Target ERP-GATEWAY endpoint (provider JSON):", url);
 
  //---------------------------

  // Always fall back to provided projectId/orgId to prevent 422 errors
    // NOTE: /ai/recommend expects AiProjectRequest (projectId [+ visualize]).
    const payload = {
      projectId: ctx?.header?.project?.id || ctx?.projectId || projectId,
      visualize: false
    };

  console.log("[ChatService] Payload being sent to provider JSON endpoint:");
  console.log(JSON.stringify(payload, null, 2));


  try {
    const startTime = Date.now();
    console.log("[ChatService] Sending POST request...");
    const response = await axios.post(url, payload, { timeout: 600000 });
 
    const duration = Date.now() - startTime;
    console.log(`[ChatService] Response received in ${duration}ms`);

    console.log("[ChatService] Full response data:", JSON.stringify(response.data, null, 2));

      // Provider returns strict JSON (summary / recommendations / chart?).
      // For chat, return JSON-first; the UI (or gateway) can render or post-process.
      const txt = response.data?.summary
        ? response.data.summary
        : JSON.stringify(response.data);

    console.log("[ChatService] Final parsed text:", txt);

    return typeof txt === "string" ? txt : String(txt);
  } catch (err: any) {
    console.error("[ChatService] ERROR during orchestrator request!");
    console.error("[ChatService] Error message:", err?.message);
    console.error("[ChatService] Error stack:", err?.stack);
    console.error("[ChatService] Full error object:", JSON.stringify(err?.response?.data || err, null, 2));

    return `Chat provider failed: ${err?.message || "Unknown error"} — Check ERP-GATEWAY connectivity.`;
  }
}

  *chunk(s: string, n: number) {
    for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n);
  }

  async saveTranscript({ projectId, userId, question, answer }: { projectId: string; userId: string; question: string; answer: string; }) {
    if (!this.prisma) return;
    try {
      await this.prisma.conversation.create({
        data: { projectId, userId, question, answer },
      });
    } catch {
      // Swallow errors in MVP mode
    }
  }
}
