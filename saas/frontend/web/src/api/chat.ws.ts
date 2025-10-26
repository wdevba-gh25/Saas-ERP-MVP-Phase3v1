// src/api/chat.ws.ts
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

export function createChatSocket(): Socket {
  const url = import.meta.env.VITE_CHATBOT_WS ?? "ws://localhost:3010";
  console.log("[chat.ws] Connecting to:", url);

  const socket: Socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    withCredentials: true,
    // path: "/socket.io", // (optional, default)
  });

  // helpful diagnostics
  socket.on("connect", () =>
    console.log("[chat.ws] ✅ connected:", socket.id)
  );
  socket.on("connect_error", (err: any) =>
    console.error("[chat.ws] ❌ connect_error:", err?.message ?? err)
  );
  socket.on("disconnect", (reason) =>
    console.warn("[chat.ws] ⚠️ disconnected:", reason)
  );

  return socket;
}