import os, uuid, asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware



from fastapi.staticfiles import StaticFiles
from . import schemas

from .provider import summarize_via_provider, generic_completion, run_ai_mode
from .chatbot_llm import recommend_chatbotai

from . import retriever
from .pdf import render_pdf
from .schemas import AiProjectRequest
from .schemas import ChatbotAskRequest

from .schemas import RecommendRequest
from .schemas import SummarizeRequest, ExtractRequest
from .schemas import RecommendResponse, ExtractResponse, SummarizeResponse
from .schemas import AiProjectRequest
from .llm_prompts import (
    RECOMMEND_SYSTEM,
    RECOMMEND_SYSTEM_WITH_CHART,
    SUMMARIZE_SYSTEM,
    EXTRACT_SYSTEM,
)
from . import schemas as schemas_mod
from .task_registry import registry, TaskEntry


FALLBACK_BANNER = "The AI service is currently unavailable. Please try again later."
PORT = int(os.getenv("PORT", "8009"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# app = FastAPI(title="ERP-AI Gateway", version="0.1.0")

app = FastAPI(title="AI API Management", version="0.1.0")

# serve generated PDFs under /files/*
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
GEN_DIR = os.path.join(BASE_DIR, "generated")
os.makedirs(GEN_DIR, exist_ok=True)
app.mount("/files", StaticFiles(directory=GEN_DIR), name="files")

# CORS (Vite default port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /orchestrate/* routes are provided by orchestrator_router in this build.
# To prevent double-registration and ambiguous behavior, keep only one set.

# ---- Business: fixed prompt (Operator text is ignored on purpose) ----
FIXED_NEXT_SEASON_PROMPT = (
    "You are a retail apparel analyst. Generate a concise report for NEXT SEASON focused on "
    "Jeans and Leggings sales. Include seasonality trends, a monthly projection table, risk notes, "
    "and the top 3 providers to consider, with one-sentence justification each. End with 3 action items."
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------- NEW: expose project context (no PDF, no AI) ----------
@app.get("/ai/context/project/{project_id}")
async def ai_project_context(project_id: str):
    """
    Returns the exact JSON context the chatbot needs (header, providers, providerProducts, inventory, sales, salesMonthly).
    No AI call here; pure SQL Server retrieval via retriever.
    """
    ctx = retriever.fetch_project_context(project_id)
    return ctx


# ---------- NEW: Chatbot (ERP-scoped) endpoint ----------
@app.post("/ai/recommend_chatbotai")
async def ai_recommend_chatbotai(req: ChatbotAskRequest):
    """
    ERP-scoped chatbot endpoint that returns a compact chat JSON:
    {
      "answer": "string",
      "used": {
        "products": [], "providers": [],
        "inventoryIds": [], "providerProductIds": [], "saleIds": []
      },
      "stockAlerts": [ ... ]   # optional
    }
    """
    ctx = retriever.fetch_project_context(req.projectId)
    result = await recommend_chatbotai(ctx, req.question)
    return result



# ---------- Orchestration helpers ----------
async def _run_recommend(ctx: dict, visualize: bool) -> dict:
    mode = "recommend_with_chart" if visualize else "recommend"
    return await run_ai_mode(mode, ctx)


async def _run_summarize(ctx: dict) -> dict:
    return await run_ai_mode("summarize", ctx)


async def _run_extract(ctx: dict) -> dict:
    return await run_ai_mode("extract", ctx)


async def _build_context_for_project(project_id: str) -> dict:
    return retriever.fetch_project_context(project_id)


async def _build_context_for_org(req: RecommendRequest) -> dict:
    # Defensive: some payloads might omit topN entirely.
    top_n = getattr(req, "topN", None)
    if top_n is None:
        top_n = 10

    return retriever.fetch_org_top_products_with_pref(
        organization_id=req.organizationId,
        from_date=req.fromDate,
        to_date=req.toDate,
        top_n=top_n,
    )


# ---------- NEW: Orchestrated endpoints (run, status, cancel) ----------
@app.post("/orchestrate/run")
async def orchestrate_run(payload: dict):
    """
    Starts a cancellable AI task and returns a task_id immediately.
    payload = {
      "mode": "recommend" | "summarize" | "extract",
      "visualize": bool,
      "projectId": "...",        # for /ai/* project flows
      "organizationId": "...",   # for org recommend
      "fromDate": "...", "toDate": "...", "topN": 10
    }
    """
    user_id = None  # Plug your auth here if needed
    mode = (payload.get("mode") or "").strip()
    visualize = bool(payload.get("visualize", False))

    print("[DEBUG orchestrate_run] Incoming payload:", payload)
    print("[DEBUG orchestrate_run] Parsed mode =", mode, "| visualize =", visualize)


    if await registry.has_active_cancellation(user_id):
        raise HTTPException(
            status_code=409, detail="Previous cancellation still in progress."
        )

    task_id = uuid.uuid4().hex

    async def _runner():
        try:
            print("[DEBUG orchestrate_run._runner] Running task for mode =", mode)

            if mode == "summarize":
                ctx = await _build_context_for_project(payload["projectId"])
                result = await _run_summarize(ctx)
            elif mode == "extract":
                ctx = await _build_context_for_project(payload["projectId"])
                result = await _run_extract(ctx)
            elif mode == "recommend":
                # org-level recommend (your existing /recommend logic)
                req = RecommendRequest(
                    **{
                        "organizationId": payload.get("organizationId"),
                        "fromDate": payload.get("fromDate"),
                        "toDate": payload.get("toDate"),
                        "topN": payload.get("topN"),
                        # Defensive: default to 10 if not provided
                        "topN": payload.get("topN", 10),
                    }
                )
                print("[DEBUG orchestrate_run._runner] Built RecommendRequest:", req)
                ctx = await _build_context_for_org(req)
                print("[DEBUG orchestrate_run._runner] Context fetched, keys:", list(ctx.keys()))
                result = await _run_recommend(ctx, visualize)
            elif mode == "recommend_with_chart":
                req = RecommendRequest(
                    **{
                        "organizationId": payload.get("organizationId"),
                        "fromDate": payload.get("fromDate"),
                        "toDate": payload.get("toDate"),
                        "topN": payload.get("topN", 10),
                    }
                )
                print("[DEBUG orchestrate_run._runner] Built RecommendRequest (with chart):", req)
                ctx = await _build_context_for_org(req)
                print("[DEBUG orchestrate_run._runner] Context fetched, keys:", list(ctx.keys()))
               
                # Try enriching chart directly in orchestrator response (same as /ai/recommend)
                result = await _run_recommend(ctx, visualize=True)

                monthly = ctx.get("salesMonthly") or ctx.get("monthly") or []
                if monthly and isinstance(monthly, list):
                    month_labels = []
                    month_values = []
                    for row in monthly:
                        ym = row.get("yearMonth")
                        revenue = row.get("totalRevenue")
                        if ym and revenue is not None:
                            month_labels.append(ym)
                            month_values.append(revenue)

                    if len(month_labels) >= 2:
                        result["chart"] = {
                            "type": "bar",
                            "labels": month_labels,
                            "values": month_values,
                        }

                # Always generate a PDF to keep orchestrated flow consistent
                import json as _json
                summary_text = _json.dumps(result, ensure_ascii=False, indent=2)
                file_id = uuid.uuid4().hex[:8]
                filename = f"recommend_report_{file_id}.pdf"
                path = os.path.join(GEN_DIR, filename)
                render_pdf(
                    path,
                    "Recommendation Report",
                    summary_text,
                    result.get("recommendations", []),
                )
                result["pdfUrl"] = f"/files/{filename}"
            else:
                print("[DEBUG orchestrate_run._runner] Unsupported mode triggered:", mode)
                raise ValueError("Unsupported mode")
            await registry.set_state(task_id, "completed", result=result)
            print("[DEBUG] Task marked as completed in registry")
        except asyncio.CancelledError:
            import traceback
            print("[ERROR] Task crashed in orchestrator:", str(e))
            traceback.print_exc()
            # Even if something blew up, mark task failed so frontend stops spinning
            await registry.set_state(task_id, "failed", error=str(e))




            raise
        except Exception as e:
            import traceback
            print("[ERROR] Orchestration task failed:", str(e))
            traceback.print_exc()            
            await registry.set_state(task_id, "failed", error=str(e))
            raise

    te = TaskEntry(task_id=task_id, user_id=user_id, state="running")
    await registry.register(te)
    te.task = asyncio.create_task(_runner())
    return {"taskId": task_id, "state": "running"}


@app.get("/orchestrate/status/{task_id}")
async def orchestrate_status(task_id: str):
    te = await registry.get(task_id)
    if not te:
        raise HTTPException(status_code=404, detail="Task not found")
    # For demo: return final payload once completed
    body = {"taskId": task_id, "state": te.state}
    if te.state == "completed":
        body["result"] = te.result
    if te.state == "failed":
        body["error"] = te.error
    return body


@app.post("/orchestrate/cancel/{task_id}")
async def orchestrate_cancel(task_id: str):
    te = await registry.get(task_id)
    if not te:
        raise HTTPException(status_code=404, detail="Task not found")
    ok = await registry.cancel(task_id)
    if not ok:
        raise HTTPException(status_code=409, detail="Task not cancellable")
    # Give task a short window to finish its own cleanup
    try:
        if te.task:
            await asyncio.wait_for(te.task, timeout=5.0)
    except asyncio.TimeoutError:
        # Background task is being torn down; we still declare "cleanup running"
        return {"status": "cancelling"}
    except asyncio.CancelledError:
        pass
    return {"status": "cancelled", "cleanup": "ok"}


@app.post("/summarize", response_model=schemas.SummarizeResponse)
async def summarize(req: schemas.SummarizeRequest):
    summary = await summarize_via_provider(req.text)
    return schemas.SummarizeResponse(summary=summary)


@app.post("/extract", response_model=schemas.ExtractResponse)
async def extract(req: schemas.ExtractRequest):
    prompt = "Extract 3-7 bullet points (plain lines, no numbering):\n\n" + req.text
    txt = await generic_completion(prompt)
    # keep it simple for demo: split lines
    items = [line.strip("-• ").strip() for line in txt.splitlines() if line.strip()]
    return schemas.ExtractResponse(items=items[:7])


@app.post("/recommend", response_model=schemas.RecommendResponse)
async def recommend(req: schemas.RecommendRequest):

    # Ignore operatorPrompt by design (demo constraint)
    summary = await generic_completion(FIXED_NEXT_SEASON_PROMPT)
    degraded = summary.strip() == FALLBACK_BANNER or summary.startswith(
        "The AI service is currently unavailable"
    )

    # naive tops for demo if degraded
    top3 = (
        [
            "Use last season safety stock",
            "Delay PO confirmation",
            "Monitor weekly sell-through",
        ]
        if degraded
        else [ln for ln in (l.strip() for l in summary.splitlines()) if ln][:3]
    )

    # Make a PDF and serve it
    file_id = uuid.uuid4().hex[:8]
    filename = f"next_season_report_{file_id}.pdf"
    path = os.path.join(GEN_DIR, filename)
    render_pdf(path, "Next Season Report — Jeans & Leggings", summary, top3)

    pdf_url = f"/files/{filename}"
    return schemas.RecommendResponse(
        title="Next Season Report — Jeans & Leggings",
        summary=summary,
        recommendations=top3,
        pdfUrl=pdf_url,
    )


@app.post("/recommend/rag", response_model=schemas.RecommendResponse)
async def recommend_rag(req: schemas.RAGRecommendRequest):
    """
    RAG path:
      1) Pull tenant-scoped data from SQL Server
      2) Compose grounded prompt
      3) Call local LLM (Mistral 7B)
      4) Return same shape as /recommend, including PDF
    """
    # 1) Retrieve context
    ctx = retriever.fetch_org_top_products_with_pref(
        organization_id=req.organizationId,
        from_date=req.fromDate,
        to_date=req.toDate,
        top_n=req.topN or 10,
    )
    ctx_text = retriever.context_as_bullets(ctx)

    # 2) Compose grounded prompt (no hidden tools, pure text RAG)
    prompt = (
        "You are an ERP inventory and merchandising analyst.\n"
        "Based only on the CONTEXT below (do not invent data), produce a concise executive summary "
        "and 3–5 actionable recommendations for the next season. Keep each recommendation to one line.\n\n"
        f"CONTEXT:\n{ctx_text}\n\n"
        "Output format:\n"
        "- First, 1–2 paragraph summary.\n"
        "- Then a short list of bullet recommendations.\n"
    )

    # 3) Call local LLM
    summary = await generic_completion(prompt)
    degraded = summary.strip() == FALLBACK_BANNER or summary.startswith(
        "The AI service is currently unavailable"
    )

    # 4) Make recommendations list (fallback if needed)
    lines = [ln.strip() for ln in summary.splitlines() if ln.strip()]
    # heuristically take last 3–5 bullet-like lines
    bullets = [
        l.lstrip("-• ").strip() for l in lines if l.lstrip().startswith(("-", "•"))
    ]
    top3 = (
        bullets[:5]
        if bullets
        else (
            [
                "Use last season safety stock",
                "Delay PO confirmation",
                "Monitor weekly sell-through",
            ]
            if degraded
            else []
        )
    )

    # 5) PDF
    file_id = uuid.uuid4().hex[:8]
    filename = f"next_season_report_{file_id}.pdf"
    path = os.path.join(GEN_DIR, filename)
    render_pdf(path, "Next Season Report — Grounded (RAG)", summary, top3)

    return schemas.RecommendResponse(
        title="Next Season Report — Grounded (RAG)",
        summary=summary,
        recommendations=top3,
        pdfUrl=f"/files/{filename}",
    )


# -----------------------------
# NEW: Project-scoped AI endpoints (strict JSON outputs)
# -----------------------------
@app.post("/ai/recommend")
async def ai_recommend(req: AiProjectRequest):
    """
    Returns JSON shaped per RECOMMEND_SYSTEM. No PDF generation here.
    """
    # ---->
    # NEW: Pass visualize flag forward into run_ai_mode or use it to choose prompt
    intent_mode = (
        "recommend_with_chart" if getattr(req, "visualize", False) else "recommend"
    )

    # Always fetch context regardless of visualize flag
    ctx = retriever.fetch_project_context(req.projectId)

    print("[DEBUG] Starting run_ai_mode...")
    # Enable chatbot-safe JSON parsing for this endpoint only
    result = await run_ai_mode(intent_mode, ctx, chatbot_mode=True)
    print("[DEBUG] run_ai_mode finished.")

    # --- New: Try to generate chart data from monthly aggregates ---
    monthly = ctx.get("salesMonthly") or ctx.get("monthly") or []
    chart = None
    if monthly and isinstance(monthly, list):
        # Group totalRevenue by month (aggregate if multiple products exist)
        from collections import defaultdict
        month_map = defaultdict(float)
        for row in monthly:
            ym = row.get("yearMonth")
            revenue = row.get("totalRevenue", 0)
            if ym:
                month_map[ym] += revenue

        month_labels = sorted(month_map.keys())
        month_values = [month_map[m] for m in month_labels]

        # Only include chart if we have enough data points
        if len(month_labels) >= 2:
            chart = {
                "type": "bar",
                "labels": month_labels,
                "values": month_values,
            }

    # --- Merge chart into response if visualization is requested ---
    if getattr(req, "visualize", False) and chart:
        result["chart"] = chart

    # ✅ Always generate a PDF summary from the result
    import json as _json

    summary_text = _json.dumps(result, ensure_ascii=False, indent=2)
    file_id = uuid.uuid4().hex[:8]
    filename = f"recommend_report_{file_id}.pdf"
    path = os.path.join(GEN_DIR, filename)
    render_pdf(
        path, "Recommendation Report", summary_text, result.get("recommendations", [])
    )
    result["pdfUrl"] = f"/files/{filename}"

    return result


@app.post("/ai/summarize")
async def ai_summarize(req: AiProjectRequest):
    """
    CPU-friendly 'sectional' summarization:
      - Call the model 3x with small, focused contexts
      - Merge results and fill 'project' from SQL header to avoid NOT_AVAILABLE
    """
    ctx = retriever.fetch_project_context(req.projectId)

    # -------- Section contexts (keep tiny) --------
    header_ctx = {
        "header": ctx.get("header") or {},
        # salesMonthly is enough for coverage/top products/volume trend
        "salesMonthly": (ctx.get("salesMonthly") or [])[:12],
    }
    inventory_ctx = {
        "inventory": (ctx.get("inventory") or [])[:20],
    }
    providers_ctx = {
        "providerProducts": (ctx.get("providerProducts") or [])[:20],
    }

    # -------- Run three small LLM calls --------
    # Each call uses SUMMARIZE_SYSTEM but we only keep the fields relevant to that section.
    base = await run_ai_mode(
        "summarize", header_ctx
    )  # project, periodCoverage, topProductsByRevenue, volumeTrend
    inv = await run_ai_mode("summarize", inventory_ctx)  # inventoryStatus
    pref = await run_ai_mode("summarize", providers_ctx)  # preferredSuppliers

    # -------- Safe assembly --------
    def _safe(d, k, default):
        return (
            d.get(k)
            if isinstance(d, dict)
            and isinstance(d.get(k), (list, dict, str, int, float))
            else default
        )

    project_from_header = {
        "id": (ctx.get("header", {}).get("project", {}) or {}).get("id")
        or "NOT_AVAILABLE",
        "name": (ctx.get("header", {}).get("project", {}) or {}).get("name")
        or "NOT_AVAILABLE",
        "organization": (ctx.get("header", {}).get("organization", {}) or {}).get(
            "name"
        )
        or "NOT_AVAILABLE",
        "status": (ctx.get("header", {}).get("project", {}) or {}).get("status")
        or "NOT_AVAILABLE",
    }

    final_json = {
        "project": project_from_header,  # force-fill from DB header to prevent NOT_AVAILABLE
        "periodCoverage": _safe(
            base,
            "periodCoverage",
            {
                "firstSaleMonth": "NOT_AVAILABLE",
                "lastSaleMonth": "NOT_AVAILABLE",
                "distinctProducts": 0,
            },
        ),
        "topProductsByRevenue": _safe(base, "topProductsByRevenue", []),
        "volumeTrend": _safe(base, "volumeTrend", []),
        "inventoryStatus": _safe(inv, "inventoryStatus", []),
        "preferredSuppliers": _safe(pref, "preferredSuppliers", []),
    }

    # -------- Render PDF using the full JSON as the "summary" text body --------
    # Keep behavior consistent with existing /recommend PDF shape.
    import json as _json

    summary = _json.dumps(final_json, ensure_ascii=False)

    file_id = uuid.uuid4().hex[:8]
    filename = f"summarize_report_{file_id}.pdf"
    path = os.path.join(GEN_DIR, filename)
    render_pdf(path, "Summary Report", summary, [])  # no recs for summarize

    return {
        "title": "Summary Report",
        "summary": summary,
        "recommendations": [],
        "pdfUrl": f"/files/{filename}",
    }


@app.post("/ai/extract")
async def ai_extract(req: AiProjectRequest):
    """
    Returns JSON shaped per EXTRACT_SYSTEM.
    """
    ctx = retriever.fetch_project_context(req.projectId)
    return await run_ai_mode("extract", ctx)
