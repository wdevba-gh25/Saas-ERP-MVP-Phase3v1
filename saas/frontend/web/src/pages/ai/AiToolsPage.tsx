import { useEffect, useMemo, useState } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { aiSummarize, aiExtract, aiRecommend, aiRunTask, aiCancelTask, aiGetTaskStatus } from "../../api/ai.api";
import { useAuthStore } from "../../store/auth.store";
import { inferIntent } from "../../components/ai/DecisionGateway";
import DynamicChart from "../../components/Charts";
import { motion } from "framer-motion";
import { useAiOrchestration } from "../../store/aiOrchestration.store";

const PLACEHOLDER_PROMPT =
  "Give me the sales projection and recommend providers for next season.";

export default function AiToolsPage() {
  const { user } = useAuthStore();

  //----------->>
  const {
    isProcessing,
    isCancelling,
    beginProcessing,
    beginCancelling,
    finishCleanup,
    banner,
    setBanner,
  } = useAiOrchestration();

  const [prompt, setPrompt] = useState(PLACEHOLDER_PROMPT);
  const [lockPrompt, setLockPrompt] = useState(false);
  const [busy, setBusy] = useState<"idle" | "summ" | "extr" | "reco">("idle");
  const [summary, setSummary] = useState<string>("");
  const [bullets, setBullets] = useState<string[]>([]);
  const [report, setReport] = useState<null | {
    title: string;
    summary: string;
    recommendations: string[];
    pdfUrl: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{
    type: "bar" | "line";
    labels: string[];
    values: number[];
  } | null>(null);

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // NEW delayed cancel visibility
  const [showCancel, setShowCancel] = useState(false); 

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const cancelReport = async () => {
    if (!currentTaskId) return;
    if (!window.confirm("Are you sure you want to cancel? This action cannot be undone.")) {
      console.log("[DEBUG CANCEL] User aborted cancel confirmation");
      return;
    }
    console.log("[DEBUG CANCEL] requesting cancel for taskId:", currentTaskId);
    beginCancelling();
    try {
      const res = await aiCancelTask(currentTaskId);
      console.log("[DEBUG CANCEL] /orchestrate/cancel response:", res);
      console.log("[DEBUG CANCEL] calling finishCleanup() after cancel request");
    } catch (e) {
      console.warn("Cancel endpoint error:", e);
    } finally {
//----------------
      // 15s grace period: if still cancelling after 15s, remove overlay and show banner
      window.setTimeout(() => {
        if (isCancelling) {
          console.log("[DEBUG CANCEL] still cancelling after 15s -> showing cleanup banner");
          finishCleanup(); // remove overlay without marking job done
          setBanner({
            kind: "cleanup_running",
            text:
              "Cleanup is still running in the background. Please wait a few more seconds before generating a new report.",
          });
        }
      }, 15000);
    }  
  };

  const doSummarize = async () => {
    console.log("[DEBUG SUMM] starting summarize flow");
    setError(null); 
    setBusy("summ");
    // Clear previous UI states for a fresh render
    setSummary("");
    setBullets([]);
    setReport(null);
    setChartData(null);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      beginProcessing();
      const projectId = user?.activeProjectId;
      if (!projectId) throw new Error("No active project selected");
      const result = await aiSummarize(projectId, { signal: controller.signal }); 
      console.log("[DEBUG SUMM] API result:", result);

      if (!result || typeof result.summary !== "string") {
        throw new Error("Unexpected API response format");
      }
      setSummary(result.summary);

      // If backend also returned a PDF, reuse the report block for consistency
      if ((result as any).pdfUrl) {
        setReport({
          title: result.title ?? "Summary Report",
          summary: result.summary,
          recommendations: result.recommendations ?? [],
          pdfUrl: result.pdfUrl,
        });
      }
    } catch (e: any) {
      if (e.name === "AbortError") {        
        console.warn("Report generation aborted by user.");        
        return;
      }
      console.error("[DEBUG SUMM] error:", e);
      //----------->>>
      const msg = e?.response?.status
        ? `❌ API ${e.config?.url || "/ai/summarize"} failed with ${e.response.status}: ${e.response.statusText}\n${e?.message}`
        : e?.message || "Summarize failed";
      setError(msg);
      
    } finally { setBusy("idle"); }
  };

  const doExtract = async () => {
    console.log("[DEBUG EXTRACT] starting extract flow");
    setError(null); 
    setBusy("extr");
    setSummary("");
    setBullets([]);
    setReport(null);
    setChartData(null);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      beginProcessing();
      const projectId = user?.activeProjectId;
      if (!projectId) throw new Error("No active project selected");
      const { items } = await aiExtract(projectId, { signal: controller.signal });
      console.log("[DEBUG EXTRACT] items:", items);
      setBullets(items);
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.warn("Extraction aborted by user.");
        return;
      }
      //---------->>
            const msg = e?.response?.status
        ? `❌ API ${e.config?.url || "/ai/extract"} failed with ${e.response.status}: ${e.response.statusText}\n${e?.message}`
        : e?.message || "Extract failed";
      setError(msg);
      console.error("[DEBUG EXTRACT] error:", e);

    } finally { setBusy("idle"); }
  };

  const pollUntilDone = async (taskId: string) => {
    // simple 2s polling; you can switch to SSE later
//-------->>>
    console.log("[DEBUG POLL] begin for task:", taskId);
    const t0 = Date.now();
    for (;;) {
      let st: any;
      try {
        st = await aiGetTaskStatus(taskId);
      } catch (err) {
        console.error("[DEBUG POLL] status fetch failed:", err);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      console.log("[DEBUG POLL] Full status payload:", st); //NEW
      console.log("[DEBUG POLL] Raw state value:", st.state); //NEW
    // EXTRA DEBUG: show state transitions clearly
    if (st.state === "cancelling") {
      console.debug("[DEBUG POLL] Task is still cancelling... cleanup in progress (backend delay sim).");
      setBusy("reco");
      setBanner({
        kind: "info",
        text: "Your AI PDF Report is still being cancelled… please wait while cleanup completes (about 20 s total).",
      });
    }
      
      if (st.state?.toLowerCase?.() === "completed") {
        // Expect result to be the same JSON our PDF/chart renderer already consumes
        console.log("[DEBUG POLL] Task completed:", st.result); // 🔥 ADD THIS
        console.log("[DEBUG POLL] duration ms:", Date.now() - t0);

        const data = st.result;
        setReport({
          title: data?.title ?? "Summary Report",
          summary: data?.summary ?? "",
          recommendations: data?.recommendations ?? [],
          pdfUrl: data?.pdfUrl ?? "",
        });
        if (data?.chart) {
          // normalize chart.values in case backend returns nested arrays
          const normalizedValues = Array.isArray(data.chart.values?.[0])
            ? data.chart.values.flat()
            : data.chart.values;

        const shaped = {      
            ...data.chart,
            values: normalizedValues    
        };
        console.log("[DEBUG POLL] shaped chart:", {
            type: shaped?.type,
            labelsLen: shaped?.labels?.length,
            valuesLen: shaped?.values?.length,
            labels: shaped?.labels,
            valuesPreview: Array.isArray(shaped?.values) ? shaped.values.slice(0, 6) : shaped?.values
          });
          setChartData(shaped);
        } // FIX: close `if (data?.chart) {`

        setLockPrompt(true);
        setBusy("idle");
        console.log("[DEBUG UI] finishCleanup() after completed");
        finishCleanup(); // CLOSE overlay after task is done
        return;
      }
      if (st.state === "cancelled" || st.state === "failed") {
        console.log("[DEBUG POLL] Task stopped with state:", st.state); // ADD THIS
        setBusy("idle");

        console.log("[DEBUG UI] finishCleanup() after", st.state);
        finishCleanup(); // Close overlay but DO NOT immediately hide the banner

        // Show cleanup banner for ~20s even after overlay disappears
        console.debug("[DEBUG UI] Task cancelled — switching to cleanup banner state.");
        setBanner({
          kind: "cleanup_running",
          text:
            "Cleanup is still running in the background. Please wait ~20 seconds before generating a new report.",
        });

        // Auto-clear the banner after backend finishes (~20s)
        window.setTimeout(() => {
          console.debug("[DEBUG UI] Cleanup grace period elapsed — clearing banner and enabling new tasks.");
          finishCleanup();
          setBanner({ kind: "none" });
        }, 20000);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  const doRecommend = async (visualize?: boolean) => {
    console.log("[DEBUG RUN] starting recommend flow; visualize:", !!visualize);
    setError(null);
    setBusy("reco");
    setShowCancel(false); // reset cancel state
    // enable cancel after 5 seconds to avoid accidental clicks
    setTimeout(() => {
      console.log("[DEBUG CANCEL] showCancel -> true (5s elapsed)");
      setShowCancel(true);
    }, 5000);

    try {
      beginProcessing();
      console.log("[DEBUG UI] beginProcessing() called (overlay on)");
      const projectId = user?.activeProjectId;
      if (!projectId) throw new Error("No active project selected");
      const run = await aiRunTask({
        mode: "recommend_with_chart",
        visualize: !!visualize,
        organizationId: user?.organizationId,
        projectId // context builder may use it too later        
      });
      console.log("[DEBUG RUN] Received task:", run); // 
      setCurrentTaskId(run.taskId);
      console.log("[DEBUG RUN] currentTaskId set:", run.taskId);
      await pollUntilDone(run.taskId);
    } catch (e: any) {
      const msg = e?.response?.status
        ? `❌ /orchestrate/run failed with ${e.response.status}: ${e.response.statusText}\n${e?.message}`
        : e?.message || "Failed to start orchestrated recommend";
      setError(msg);
      console.error("[DEBUG RUN] error:", e);
    } finally {
      setBusy("idle");
    }
  };

  const handleAskAI = async () => {
    setError(null);
    // ✅ Instead of blocking Ask AI entirely, repurpose it to show a warning if cleanup is ongoing
    if (banner.kind === "cleanup_running" || banner.kind === "info") {
      window.alert(
        "🧹 Cancellation is still in progress.\nPlease wait about 20 seconds before generating a new AI PDF report."
      );
      return;
    }
    // Use new inferIntent result (intent + visualize)
    const { intent, visualize } = inferIntent(prompt);

    // Clear previous render state before executing
    setSummary("");
    setBullets([]);
    setReport(null);
    setChartData(null);

    if (intent === "summarize") {
      // (optional) move summarize to orchestrated later; keep as-is for demo
      await doSummarize();

    } else if (intent === "extract") {
      // (optional) move extract to orchestrated later; keep as-is for demo
      await doExtract();

    } else {
      // Pass visualize flag through to backend
      await doRecommend(visualize);
    }
  };

  // When the page is opened while system is cancelling, show the gears modal immediately.
  useEffect(() => {
    if (isCancelling) {
      // No-op; modal is controlled by isCancelling below
    }
  }, [isCancelling]);

  const showAskAi = useMemo(() => {
    // Hide Ask AI completely if a cancellation is in progress
    return !isCancelling;
  }, [isCancelling]);

//-------->>>>
// ---- UI state watchers (overlay & banner) ----
  useEffect(() => {
    console.log("[DEBUG UI] overlay flags changed -> isProcessing:", isProcessing, "isCancelling:", isCancelling, "busy:", busy);
  }, [isProcessing, isCancelling, busy]);

  useEffect(() => {
    console.log("[DEBUG UI] banner changed:", banner);
  }, [banner]);

  useEffect(() => { return () => console.log("[DEBUG UI] unmount AiToolsPage"); }, []);

return (
    <PageLayout title="AI Tools">
      {/* Top banner under the menu */}
      {banner.kind !== "none" && (
        <div className="w-full bg-slate-800/80 border-b border-slate-700 text-slate-100">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-start gap-3">
            <span className="text-sm">
              {banner.text}
            </span>
            <button
              className="ml-auto text-slate-300 hover:text-white"
              onClick={() => setBanner({ kind: "none" })}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className={`grid gap-6 max-w-3xl mx-auto ${isProcessing ? "pointer-events-none grayscale" : ""}`}>
        <div className="text-xs text-slate-400">
          Active ProjectId: {user?.activeProjectId ?? "null"}
        </div>
        <label className="block">
          <div className="mb-2 text-sm text-slate-300">Prompt</div>

        </label>
        <textarea
            className={`w-full min-h-[130px] rounded-xl p-3 outline-none transition-colors ${
              lockPrompt || busy !== "idle" || isProcessing
                ? "bg-slate-600 text-slate-300 cursor-not-allowed"
                : "bg-slate-900/70 text-white"
            }`}
            placeholder={PLACEHOLDER_PROMPT}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            readOnly={lockPrompt || busy !== "idle" || isProcessing}
            disabled={lockPrompt || busy !== "idle" || isProcessing}
          />
        <label className="flex items-center gap-2 text-slate-300">
          <input
            type="checkbox"
            checked={lockPrompt}
            onChange={(e) => setLockPrompt(e.target.checked)}
            disabled={busy !== "idle" || isProcessing}
          />
          <span>Take this suggestion</span>
          {showAskAi && (
            <button
              onClick={handleAskAI}
              disabled={busy !== "idle" || isProcessing}
              className="ml-auto btn-primary"
            >
              Ask AI
            </button>
          )}

        </label>

        {error && (
          <div className="text-red-400 text-sm italic">
            {error}
          </div>
        )}
        {busy !== "idle" && (
          <div className="text-center">
            <button
              onClick={() => {
                if (confirm("Cancel report generation?")) {
                  cancelReport();
                }
              }}
              className="mt-6 px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow"
            >
              Cancel Report
            </button>
          </div>
        )}

        {summary && (
          <div className="rounded-xl p-4 bg-slate-800/40">
            <div className="font-semibold mb-2">Summary</div>
            <pre className="whitespace-pre-wrap text-slate-200">{summary}</pre>
          </div>
        )}

        {bullets.length > 0 && (
          <div className="rounded-xl p-4 bg-slate-800/40">
            <div className="font-semibold mb-2">Key points</div>
            <ul className="list-disc pl-5">
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}

        {report && (
          <div className="rounded-xl p-4 bg-slate-800/40">
            <div className="font-semibold mb-2">{report.title}</div>
            <p className="mb-4">{report.summary}</p>
            <div className="mb-3 font-semibold">Recommendations</div>
            {Array.isArray(report.recommendations) && report.recommendations.length > 0 ? (
              <ul className="list-disc pl-5 mb-4">
                {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              <p className="text-slate-400 text-sm mb-4">
                No specific recommendations were generated for this report.
              </p>
            )}
            <a
              className="btn-primary inline-block"
              href={`${import.meta.env.VITE_AI_REPORTS ?? ""}${report.pdfUrl || ""}`}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          </div>
        )}
        {chartData &&
          Array.isArray(chartData.labels) &&
          Array.isArray(chartData.values) &&
          chartData.labels.length > 0 &&
          chartData.values.length > 0 && (
            <div className="rounded-xl p-4 bg-slate-800/40">
              <div className="font-semibold mb-2">Visual Insights</div>
              <DynamicChart data={chartData} />
            </div>
          )}
      </div>

      {/* Overlay animations for processing/cancelling */}
      {isProcessing && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 text-slate-100 rounded-2xl shadow-xl p-8 w-[560px] max-w-[90vw] text-center"
          >
            <div className="mx-auto mb-6 flex items-center justify-center">
              {/* Framer Motion pulse for AI robotic head */}
              <motion.div
                className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 shadow-lg"
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </div>
            <div className="text-lg font-semibold">
              {`Hey ${user?.displayName || "there"}, I’ll take it from here.`}
            </div>
            <div className="text-sm text-slate-300 mt-1">
              {`Maybe grab a coffee while I crunch this report…`}
            </div>
            
            {/* Cancel button appears only after 5s */}
            {showCancel && (
              <div className="mt-6">
                <button
                  onClick={cancelReport}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow"
                >
                  Cancel Report
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {isCancelling && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 text-slate-100 rounded-2xl shadow-xl p-8 w-[560px] max-w-[90vw] text-center"
          >
            {/* Sand clock + gears metaphor */}
            <div className="mx-auto mb-4 flex items-center justify-center gap-3">
              {/* Sand clock (simple CSS animation stand-in) */}
              <div className="w-6 h-6 rounded-sm border-2 border-slate-400 animate-pulse" />
              {/* Gears animation */}
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-slate-500 animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-slate-400 animate-[spin_4s_linear_infinite_reverse]" />
              </div>
            </div>
            <div className="text-lg font-semibold">
              {`You got it ${user?.displayName || "there"}, give me a moment while I'm canceling your report…`}
            </div>
            <div className="text-sm text-slate-300 mt-1">
              Stopping inference and cleaning up infrastructure resources.
            </div>
          </motion.div>
        </div>
      )}
    </PageLayout>
  );
 }

