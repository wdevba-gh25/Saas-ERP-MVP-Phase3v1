import { useAuthStore } from "./store/auth.store";

const API_BASE: string =
  import.meta.env.VITE_API_BASE || "http://localhost:5240";

type ApiRequestOptions = RequestInit & {
  token?: string;   // optional manual override
  body?: unknown;   // allow object bodies
};

/**
 * Wrapper around fetch that:
 * - Adds Authorization header from useAuthStore automatically
 * - Adds JSON headers
 * - Stringifies body objects
 * - Throws with a useful message on errors
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  // 🔐 Use token from auth store if not explicitly passed
  const storeToken = useAuthStore.getState().token;
  const token = options.token ?? storeToken;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    credentials: options.credentials ?? "omit",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Parse response safely
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errMsg =
      (body && (body.detail || body.Message || body.error || body)) ||
      res.statusText ||
      "API request failed";
    throw new Error(errMsg);
  }

  return body as T;
}