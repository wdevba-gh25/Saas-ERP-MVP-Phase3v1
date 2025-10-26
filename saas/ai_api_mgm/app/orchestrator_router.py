from __future__ import annotations
import os
import asyncio
import uuid
from fastapi import APIRouter, HTTPException
from typing import Optional

from .task_registry import TaskEntry, registry
from .provider import run_ai_mode
from .pdf import render_pdf
from . import retriever

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
GEN_DIR = os.path.join(BASE_DIR, "generated")
os.makedirs(GEN_DIR, exist_ok=True)

router = APIRouter(prefix="/orchestrate", tags=["orchestrate"])
print("[BOOT] Cancellation simulation is", "ENABLED" if True else "DISABLED")


async def _job_runner(task_id: str, mode: str, req: dict):
    try:
        # --- Build the exact context expected by prompts ---
        ctx = {}
        org_id = req.get("organizationId")
        project_id = req.get("projectId")

        if mode in ("recommend", "recommend_with_chart"):
            if org_id:
                ctx = retriever.fetch_org_top_products_with_pref(
                    organization_id=org_id,
                    from_date=req.get("fromDate"),
                    to_date=req.get("toDate"),
                    top_n=req.get("topN") or 10,
                )
            elif project_id:
                ctx = retriever.fetch_project_context(project_id)
            else:
                raise HTTPException(status_code=400, detail="Missing organizationId or projectId for recommend")
        elif mode in ("summarize", "extract"):
            if not project_id:
                raise HTTPException(status_code=400, detail="Missing projectId for summarize/extract")
            ctx = retriever.fetch_project_context(project_id)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported mode: {mode}")

        # Run the AI inference pipeline with real context
        result = await run_ai_mode(mode, ctx)

        # --- Generate PDF in the same place the app serves (/files/*) ---
        filename = f"recommend_report_{task_id}.pdf"
        pdf_path = os.path.join(GEN_DIR, filename)

        # PATCH: allow both dict and plain text (non-JSON) results
        if isinstance(result, str):
            summary_text = result.strip()
            title_text = "AI Report"
            recommendations = []
            chart_data = None
        elif isinstance(result, dict):
            summary_text = result.get("summary", str(result))
            title_text = result.get("title", "AI Report")
            recommendations = result.get("recommendations", [])
            chart_data = result.get("chart")
        else:
            summary_text = str(result)
            title_text = "AI Report"
            recommendations = []
            chart_data = None

        render_pdf(
            path=pdf_path,
            title=title_text,
            summary=summary_text,
            recommendations=recommendations,
        )

        # The main app mounts GEN_DIR at /files
        pdf_url = f"/files/{filename}"

        await registry.set_state(
            task_id,
            "completed",
            result={
                "title": title_text,
                "summary": summary_text,
                "recommendations": recommendations,
                "pdfUrl": pdf_url,
                "chart": chart_data,
            },
        )

    except asyncio.CancelledError:
        # Don't mark cancelled here — we'll do that after cleanup finishes
        await registry.set_state(task_id, "cancelling")

        raise
    except Exception as e:
        await registry.set_state(task_id, "failed", error=str(e))

@router.post("/run")
async def run(payload: dict):
    mode = payload.get("mode") or "recommend_with_chart"
    project_id = payload.get("projectId")
    org_id = payload.get("organizationId")

    # optional: reject if a previous task is still cleaning up
    # if await registry.has_active_cancellation(None):
    #     raise HTTPException(status_code=409, detail="Cleanup in progress. Try again later.")

    # ✅ FIX: define job_id before using it
    job_id = str(uuid.uuid4())

    # Assemble request object for run_ai_mode
    request_payload = {
        "organizationId": org_id,
        "projectId": project_id,
        "visualize": payload.get("visualize", False),
    }

    task = asyncio.create_task(_job_runner(job_id, mode, request_payload))
    entry = TaskEntry(task_id=job_id, task=task)
    await registry.register(entry)

    # TEST SIMULATION: warn user immediately after job starts
    simulate_delay = True
    if simulate_delay:
        print("⚠️ SIMULATION MODE ENABLED: cancellation delay simulation active.")
        print("👉 OK, Click on CANCEL NOW TO START THE AI PDF REPORT CANCELLATION SIMULATION")
    
    return {"taskId": job_id, "state": "running"}

@router.get("/status/{task_id}")
async def status(task_id: str):
    entry = await registry.get(task_id)
    if not entry:
        raise HTTPException(status_code=404, detail="job not found")

    return {
        "taskId": entry.task_id,
        "state": entry.state,
        "result": entry.result if entry.state == "completed" else None,
        "error": entry.error,
    }


@router.post("/cancel/{task_id}")
async def cancel(task_id: str):
    entry = await registry.get(task_id)
    if not entry:
        raise HTTPException(status_code=404, detail="job not found")

    # Idempotent if already terminal
    if entry.state in ("cancelled", "failed", "completed"):
        return {"status": entry.state}

    print("[DEBUG CANCEL] Cancel request received for task:", task_id)

    # Optional simulation path
    simulate_delay = True  # hardcoded for simulation during testing
    if simulate_delay:
        print("⚠️ SIMULATION MODE ENABLED: cancellation delay simulation active.")
        print("👉 OK, Click on CANCEL NOW TO START THE AI PDF REPORT CANCELLATION SIMULATION")

    cancelled = await registry.cancel(task_id)

    if not cancelled:
        raise HTTPException(status_code=409, detail="Unable to cancel this job")

    try:
        await entry.task
    except asyncio.CancelledError:
        pass

    if simulate_delay:
        # Simulate a long-running cleanup (20s total)
        for i in range(4):
            print(f"[DEBUG CANCEL] Simulating cleanup step {i+1}/4 ...")
            await asyncio.sleep(5)

        # Run zombie check at the end
        try:
            import subprocess
            print("[DEBUG CANCEL] Running zombie check...")
            py_tasks = subprocess.check_output("tasklist | findstr python", shell=True, text=True)
            mistral_tasks = subprocess.check_output("tasklist | findstr mistral", shell=True, text=True)
            print("[DEBUG CANCEL] Python tasks:\n", py_tasks or "(none)")
            print("[DEBUG CANCEL] Mistral tasks:\n", mistral_tasks or "(none)")
        except subprocess.CalledProcessError:
            # findstr returns exit code 1 if no match is found — this is OK
            print("[DEBUG CANCEL] No lingering Python or Mistral tasks found.")

        print("CANCELLATION COMPLETED CLEANLY, SIMULATION ENDED")

        # Only now mark the task as cancelled
        await registry.set_state(task_id, "cancelled")

    # Wait for actual task cancellation to bubble up
    try:
        await entry.task
    except asyncio.CancelledError:
        print("[DEBUG CANCEL] asyncio.CancelledError caught — task cancelled.")
        pass    

    final_entry = await registry.get(task_id) 
    return {
        "status": final_entry.state,
        "simulated": simulate_delay,
        "message": "Cancellation simulation completed" if simulate_delay else "Cancellation completed"
    }