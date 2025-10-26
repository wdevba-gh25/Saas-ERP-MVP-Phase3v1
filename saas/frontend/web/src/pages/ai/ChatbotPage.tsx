import { useEffect, useRef, useState } from "react";
import { createChatSocket } from "../../api/chat.ws";
import { useAuthStore } from "../../store/auth.store";
export default function ChatbotPage() {
  const { user } = useAuthStore();
  const [q, setQ] = useState("");
  const [stream, setStream] = useState("");
  const [buffer, setBuffer] = useState("");          // accumulates raw chunks
  const [gotSummary, setGotSummary] = useState(false); // show summary once
  const sockRef = useRef<ReturnType<typeof createChatSocket> | null>(null);
  useEffect(() => {
    const s = createChatSocket(); 
    
    s.on("chat:chunk", (m: { text: string }) => {
      const chunk = m?.text ?? "";
      setBuffer(prev => {
        const next = prev + chunk;

        // Extract first occurrence of: "summary": "..."
        // Relaxed JSON: allow spaces/newlines, stop at next quote.
        if (!gotSummary) {
          console.log("[chatbot] Partial buffer so far:", next.slice(0, 400));
          // More resilient match: tolerate delayed quotes, multiline, or EOF
          const re = /"summary"\s*:\s*"([\s\S]*?)"\s*(,|\}|$)/m;
          const match = re.exec(next);
          if (match && match[1]) {
            const raw = match[1];
            const unescaped = raw
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, "\"")
              .replace(/\r/g, "")
              .trim();
            console.log("[chatbot] Extracted summary:", unescaped);
            setStream(unescaped);
            setGotSummary(true);
          }
        }
        return next;
      });
    });
    s.on("chat:done", () => {
      // If no summary found by end of stream, show single graceful fallback
      setStream(curr => {
        // Final rescue attempt before fallback
        if (!gotSummary && (!curr.trim() || curr.includes("technical difficulties"))) {
          const finalMatch = buffer.match(/"summary"\s*:\s*"([\s\S]*?)"\s*(,|\}|$)/m);
          if (finalMatch && finalMatch[1]) {
            const recovered = finalMatch[1]
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, "\"")
              .replace(/\r/g, "")
              .trim();
            console.log("[chatbot] Late summary rescue:", recovered);
            return recovered;
          }
          return "We're experiencing technical difficulties, due to high traffic time, please try again in 20 minutes.";
        }
        return curr;
        
      });
    });
    s.on("chat:error", (e: { message?: string }) => alert(e?.message || "Chat error"));
    sockRef.current = s;
    return () => {
      s.disconnect();
    };
  // keep latest gotSummary in closure without changing behavior elsewhere
  // Run once on mount, cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ask = () => {
    // Reset UI state for a new question
    setStream("");
    setBuffer("");
    setGotSummary(false);
    console.log("[chatbot] Emitting chat:ask", {
      projectId: user?.activeProjectId,
      userId: user?.userId,
      question: q,
    });
    sockRef.current?.emit("chat:ask", {
      projectId: user?.activeProjectId || "demo-project",
      userId: user?.userId || "demo-user",
      question: q || "Test question",
    });
  };






  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Chatbot AI (ERP-scoped)</h1>
      <textarea
        className="w-full p-3 rounded bg-slate-900 text-white border-2 border-slate-600 focus:border-blue-500 focus:outline-none transition"
        placeholder="Type your ERP question here..."
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <button className="btn-primary" onClick={ask}>
        Ask
      </button>
      <pre className="whitespace-pre-wrap bg-slate-800/50 p-3 rounded">{stream}</pre>
    </div>
  );
}