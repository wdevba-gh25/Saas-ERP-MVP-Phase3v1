import json
from typing import Any, Dict

from .llm_prompts import CHAT_SYSTEM

ALLOWED_TOP_KEYS = {"answer", "used", "stockAlerts"}


def _build_sectional_prompt(context: Dict[str, Any], question: str) -> str:
    """
    Build a multi-section prompt (sales, inventory, providers, etc.) sequentially.
    This dramatically reduces context drop-out in smaller LLMs like Mistral 7B.
    """
    # Trim context to last 12 months if present
    sales_monthly = context.get("salesMonthly", [])
    if len(sales_monthly) > 12:
        sales_monthly = sales_monthly[-12:]

    # Compose sections separately
    sections = []
    sections.append("SYSTEM INSTRUCTIONS:\n" + CHAT_SYSTEM)
    sections.append(
        "SECTION: SALES_HISTORY\n" + json.dumps(sales_monthly, separators=(",", ":"))
    )
    sections.append(
        "SECTION: INVENTORY\n"
        + json.dumps(context.get("inventory", []), separators=(",", ":"))
    )
    sections.append(
        "SECTION: PROVIDERS\n"
        + json.dumps(context.get("providers", []), separators=(",", ":"))
    )
    sections.append(
        "SECTION: PROVIDER_PRODUCTS\n"
        + json.dumps(context.get("providerProducts", []), separators=(",", ":"))
    )

    return (
        "\n".join(sections)
        + "\n\nTASK: "
        + question
        + "\n\nRespond ONLY as a single valid JSON object with keys 'answer', 'used', and optional 'stockAlerts'."
    )

def _normalize_chat_json(obj: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ensure we always return the chat-specific shape.
        """
        answer = obj.get("answer")
        if not isinstance(answer, str) or not answer.strip():
            # If model put the text somewhere else (e.g., 'summary'), lift it.
            alt = obj.get("summary") or obj.get("report") or obj.get("content") or ""
            answer = str(alt).strip() or "NOT_ENOUGH_CONTEXT"

        used = obj.get("used") or {}
        if not isinstance(used, dict):
            used = {}
        used.setdefault("products", [])
        used.setdefault("providers", [])
        used.setdefault("inventoryIds", [])
        used.setdefault("providerProductIds", [])
        used.setdefault("saleIds", [])

        stock_alerts = obj.get("stockAlerts") or []
        if not isinstance(stock_alerts, list):
            stock_alerts = []

        # Remove stray keys to avoid frontends choking on unknown fields
        clean: Dict[str, Any] = {"answer": answer, "used": used}
        if stock_alerts:
            clean["stockAlerts"] = stock_alerts
        return clean


async def recommend_chatbotai(context: Dict[str, Any], question: str) -> Dict[str, Any]:
    """
    Run the chat-style ERP recommendation using the local LLM and return strict JSON.
    On any parsing issue, return a sentinel error payload with the raw text.
    """
    prompt = _build_sectional_prompt(context, question)

    # --- Use new chatbot-specific completions from provider.py ---
    from .provider import _call_local_completions_chat  # local import to avoid circulars
    try:
        raw = await _call_local_completions_chat(prompt)
    except Exception as e:
        return {
            "error": "GATEWAY_TIMEOUT_OR_CONNECTION_ERROR",
            "raw": str(e)
        }

    # --- Debug: log a preview of raw model output before parsing ---
    preview = raw[:300].replace("\n", "\\n") + ("..." if len(raw) > 300 else "")
    print(f"[DEBUG][CHATBOT_RAW_OUTPUT_PREVIEW]: {preview}")


    try:
        from .provider import _extract_json  # lazy import to avoid circular import
        js = _extract_json(raw)
        return _normalize_chat_json(js)
    except Exception:
        # Preserve raw for debugging 'INVALID MODEL OUTPUT' incidents
        return {"error": "INVALID_MODEL_OUTPUT_GATEWAY", "raw": raw}
