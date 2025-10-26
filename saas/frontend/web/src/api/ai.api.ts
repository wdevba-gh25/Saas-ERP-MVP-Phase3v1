import axios, { AxiosRequestConfig } from "axios";
import { useAuthStore } from "../store/auth.store";

const AI_BASE = import.meta.env.VITE_AI_BASE; // http://localhost:8009

export const aiClient = axios.create({
  baseURL: AI_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// Attach JWT if you want (optional for demo; keeps shape aligned with others)
aiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

//----------------->>>>
export interface SummarizeResponse {
  title: string;
  summary: string;
  recommendations: string[];
  pdfUrl: string;
}


//-----------
export async function aiSummarize(
  projectId: string,
  options?: AxiosRequestConfig
): Promise<SummarizeResponse> {
  const { data } = await aiClient.post<SummarizeResponse>(
    "/ai/summarize",
    { projectId },
    options
  ); 
 
  return data;
}

//----------->>>
export async function aiExtract(
  projectId: string,
  options?: AxiosRequestConfig
) {
  const { data } = await aiClient.post<{ items: string[] }>(
    "/ai/extract",
    { projectId },
    options
  );
  return data;
}

export type RecommendResponse = {
  title: string;
  summary: string;
  recommendations: string[];
  pdfUrl: string; // relative to AI_BASE
    chart?: {
    type: "bar" | "line";
    labels: string[];
    values: number[];
  };
};

//--------->>
export async function aiRecommend(
  projectId: string,
  orgId?: string,
  visualize: boolean = false,
  options?: AxiosRequestConfig
) {
  const payload = { projectId, organizationId: orgId, visualize };
  const { data } = await aiClient.post<RecommendResponse>(
    "/ai/recommend",
    payload,
    options
  );
 
  return data;
}
// ---------- Orchestrated flow ----------
export async function aiRunTask(payload: {
  mode: "summarize" | "extract" | "recommend" | "recommend_with_chart";
  visualize?: boolean;
  projectId?: string;
  organizationId?: string;
  fromDate?: string;
  toDate?: string;
  topN?: number;
}) {
  const { data } = await aiClient.post<{ taskId: string; state: string }>(
    "/orchestrate/run",
    payload
  );
  return data;
}

export async function aiCancelTask(taskId: string) {
  const { data } = await aiClient.post<{ status: string; cleanup?: string }>(
    `/orchestrate/cancel/${taskId}`,
    {}
  );
  return data;
}

export async function aiGetTaskStatus(taskId: string) {
  const { data } = await aiClient.get<
    { taskId: string; state: "running" | "cancelling" | "cancelled" | "failed" | "completed"; result?: any; error?: string }
  >(`/orchestrate/status/${taskId}`);
  return data;
}

