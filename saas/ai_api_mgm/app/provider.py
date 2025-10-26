import os
import httpx
import asyncio
from dotenv import load_dotenv
import json
import re

load_dotenv()

# AI_PROVIDER_BASE = os.getenv("AI_PROVIDER_BASE", "http://localhost:8008")

LOCAL_LLM_URL = os.getenv(
    "LOCAL_LLM_URL"
)  # e.g. http://192.168.1.7:8001/v1/completions
FALLBACK_TEXT = "The AI service is currently unavailable. Please try again later."

async def _call_local_completions(prompt: str) -> str:
    print("[DEBUG] Entered _call_local_completions")
    print("[DEBUG] LOCAL_LLM_URL =", LOCAL_LLM_URL)


    # Slightly larger budget to avoid mid-JSON cutoffs on CPU
    payload = {"prompt": prompt, "max_tokens": 800}


    async with httpx.AsyncClient(timeout=360.0) as client:
        try:
            r = await client.post(LOCAL_LLM_URL, json=payload)
            r.raise_for_status()
            js = r.json()
        except httpx.HTTPStatusError as e:
            body = e.response.text if e.response is not None else "<no body>"

            fallback_payload = {"prompt": prompt, "n_predict": 512}

            try:
                r2 = await client.post(LOCAL_LLM_URL, json=fallback_payload)
                r2.raise_for_status()
                js = r2.json()
            except httpx.HTTPStatusError as e2:
                body2 = e2.response.text if e2.response is not None else "<no body>"
                return f"SERVER_400:{body}\nFALLBACK_400:{body2}"
            except Exception as e2:
                return f"SERVER_FALLBACK_EXCEPTION:{str(e2)}"

        # These must be indented to match the `try:` above (8 spaces total)
        except asyncio.CancelledError:
            # Bubble up so orchestrator can finish cleanup paths
            raise
        except Exception as e:
            return f"LOCAL_EXCEPTION:{str(e)}"

        # support common shapes: {choices:[{text:"..."}]} or {content:"..."}
        if isinstance(js, dict):
            if "choices" in js and js["choices"]:
                c = js["choices"][0]
                return (
                    c.get("text") or c.get("message", {}).get("content") or ""
                ).strip() or FALLBACK_TEXT
            if "content" in js:
                return (js["content"] or "").strip() or FALLBACK_TEXT
        return FALLBACK_TEXT

# NOTE: removed legacy _call_local_completions_chat (unused / error-prone)

async def generic_completion(prompt: str) -> str:
    try:
        print("[DEBUG] generic_completion() invoked")
        return await _call_local_completions(prompt)
    except Exception as e:
        print("[DEBUG] generic_completion() failed:", str(e))
        return FALLBACK_TEXT


async def summarize_via_provider(text: str) -> str:
    """
    Wraps the local completion with a summarization instruction.
    """
    return await generic_completion(f"Summarize succinctly:\n\n{text}")


# -----------------------------
# NEW: run AI with strict system + context JSON
# -----------------------------
from .llm_prompts import (
    RECOMMEND_SYSTEM,
    SUMMARIZE_SYSTEM,
    EXTRACT_SYSTEM,
    RECOMMEND_SYSTEM_WITH_CHART,
    CHAT_SYSTEM,
)

def _pack_prompt(system: str, context: dict, task: str) -> str:
    ctx = json.dumps(context, separators=(",", ":"))
    # Cap context to stay under 2k tokens for CPU-only Mistral.
    if len(ctx) > 1800:
        ctx = ctx[:1800] + "...TRUNCATED..."
    return (
        f"SYSTEM INSTRUCTIONS:\n{system}\n\n"
        f"CONTEXT_START\n{ctx}\nCONTEXT_END\n\n"
        f"TASK: {task}\n\n"
        "REPLY STRICTLY IN VALID JSON ONLY.\n"
        "Do not include comments, explanations, or extra text outside the JSON object.\n"
    )

def _extract_json(text: str):
    # Remove JS-style comments
    cleaned = re.sub(r"//.*", "", text)
    # Remove trailing commas before } or ]
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    # Ensure keys are quoted (best-effort)
    cleaned = re.sub(r"(\{|,)(\s*)([a-zA-Z0-9_]+)(\s*):", r'\1 "\3":', cleaned)

    # Try to grab the longest {...} block
    m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not m:
        raise ValueError("Model did not return JSON")
    block = m.group(0)
    try:
        return json.loads(block)
    except json.JSONDecodeError:
        # Last-resort: try truncating to last closing brace
        last = block.rfind("}")
        if last != -1:
            return json.loads(block[: last + 1])
        raise


    # --- New: Chatbot-specific extractor (more forgiving) ---
def _extract_json_chatbot(text: str):

    print("[DEBUG] _extract_json_chatbot() called (PASS-THROUGH MODE)")
    # Skip all parsing. The model output is taken verbatim.
    if not text:
        return {"error": "EMPTY_OUTPUT", "raw_text": "", "note": "No output from LLM."}

    # Return raw text directly, like the AI PDF report path.
    return {
        "summary": text[:4000],  # limit console noise
        "note": "Chatbot output preserved verbatim (JSON validation disabled)."
    }


def _thin_for_summary(c: dict) -> dict:
    return {
        "header": c.get("header", {}),
        "providerProducts": (c.get("providerProducts") or [])[:5],
        "inventory": (c.get("inventory") or [])[:5],
        # TEMP: reduce context for salesMonthly to only the last 6 months
        "salesMonthly": (c.get("salesMonthly") or [])[:6],         
    }


async def run_ai_mode(mode: str, context: dict, chatbot_mode: bool = False) -> dict:
    print("[DEBUG run_ai_mode] Mode received:", mode)
    print("[DEBUG run_ai_mode] Context keys:", list(context.keys()) if isinstance(context, dict) else type(context))
    print("[DEBUG run_ai_mode] chatbot_mode =", chatbot_mode)

    # Normalize monthly data so model always sees it
    # Always cap to 6 months to avoid long generations on CPU
    if context.get("salesMonthly"):
        context["salesMonthly"] = (context["salesMonthly"] or [])[:6]
    elif "monthly" in context:
        context["salesMonthly"] = (context["monthly"] or [])[:6]

    if mode == "recommend":
        system = RECOMMEND_SYSTEM
        task = "recommend"
    elif mode == "recommend_with_chart":
        system = RECOMMEND_SYSTEM_WITH_CHART
        task = "recommend_with_chart"
    elif mode == "summarize":
        system = SUMMARIZE_SYSTEM
        task = "summarize"
        context = _thin_for_summary(context)
    elif mode == "extract":
        system = EXTRACT_SYSTEM
        task = "extract"
    else:
        print("[DEBUG run_ai_mode] Unsupported mode reached:", mode)
        raise ValueError("Unsupported mode")

    print("[DEBUG run_ai_mode] Packing prompt for task:", task)
    prompt = _pack_prompt(system, context, task)
    print("[DEBUG run_ai_mode] Prompt length (chars):", len(prompt))
    
    # Debug line here
    print("[DEBUG] About to call generic_completion() with task:", task)
    raw = await generic_completion(prompt)
    # And right after it returns:
    print("[DEBUG] generic_completion() returned something")
    print("[DEBUG] Length of raw model output:", len(raw) if raw else "EMPTY")

    # >>> NEW: Print raw model output for debugging
    print("[DEBUG] RAW MODEL OUTPUT START =======================")
    try:
        print(raw[:2000])  # print first 2000 chars so it doesn't flood console
    except Exception as e:
        print("[DEBUG] Could not print raw output:", str(e))
    print("[DEBUG] RAW MODEL OUTPUT END =========================")
    # <<< END NEW
    try:       
        if chatbot_mode:
            print("[DEBUG] chatbot_mode=True → using _extract_json_chatbot()")
            return _extract_json_chatbot(raw)
        else:
            return _extract_json(raw)     
    except Exception as e:
        import traceback
        print("[ERROR] JSON extraction failed on first attempt:", str(e))
        traceback.print_exc()

        # Retry once with slightly modified prompt
        try:
            raw_retry = await _call_local_completions(prompt + "\n\nReturn JSON now:")

            if chatbot_mode:
                return _extract_json_chatbot(raw_retry)
            else:
                return _extract_json(raw_retry)          
        except Exception as e2:
            print("[ERROR] JSON extraction failed on retry too:", str(e2))
            traceback.print_exc()
            # FINAL SAFEGUARD: wrap raw text so orchestrator can still complete
            return {
                "error": "INVALID_MODEL_OUTPUT",
                "raw": raw_retry if 'raw_retry' in locals() else raw,
                "note": "LLM returned text that could not be parsed. See 'raw' for details."
            }