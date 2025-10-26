export interface IntentResult {
  intent: "summarize" | "extract" | "recommend";
  visualize: boolean;
}

export function inferIntent(prompt: string): IntentResult {
  const lower = prompt.toLowerCase();

  // Detect visualization potential first (data-driven keywords)
  const visualize =
    lower.includes("trend") ||
    lower.includes("projection") ||
    lower.includes("growth") ||
    lower.includes("forecast") ||
    lower.includes("sales") ||
    lower.includes("chart") ||
    lower.includes("graph");

  // Infer intent based on your existing keywords (preserved)
  let intent: IntentResult["intent"];

  if (
    lower.includes("recommend") ||
    lower.includes("next action") ||
    lower.includes("supplier") ||
    lower.includes("provider") ||
    lower.includes("fulfillment")
  ) {
    intent = "recommend";
  } else if (
    lower.includes("extract") ||
    lower.includes("normalize") ||
    lower.includes("dataset") ||
    lower.includes("data model")
  ) {
    intent = "extract";
  } else if (visualize) {
    // 👈 NEW: treat projection/forecast/trend/sales as a recommend-with-chart ask
    intent = "recommend";
  } else {
    // Default fallback
    intent = "summarize";
  }

  return { intent, visualize };
}