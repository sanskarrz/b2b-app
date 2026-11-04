// API client with bearer auth
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BASE) {
  console.warn("EXPO_PUBLIC_BACKEND_URL not set");
}

async function getToken(): Promise<string | null> {
  return (await storage.secureGet("rxtech_token", "")) || null;
}

export const authToken = getToken;

/** URL for an uploaded file (photo / voice). Token in query so <Image>/<audio> work on web + native. */
export async function fileUrl(fileId: string): Promise<string> {
  const t = await getToken();
  return `${BASE}/api/files/${fileId}?token=${encodeURIComponent(t || "")}`;
}

export const apiBase = `${BASE}/api`;

export async function setToken(token: string) {
  await storage.secureSet("rxtech_token", token);
}

export async function clearToken() {
  await storage.secureRemove("rxtech_token");
}

type FetchOpts = {
  method?: string;
  body?: any;
  auth?: boolean;
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;
  detail: any;
  fields: Record<string, string>;
  constructor(message: string, status: number, detail: any, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.fields = fields;
  }
}

/**
 * Convert FastAPI validation error format into:
 *  - human-readable message
 *  - field map { fieldName: message } for inline display
 */
function parseFastApiError(data: any, status: number): { message: string; fields: Record<string, string> } {
  if (!data) return { message: `Request failed (${status})`, fields: {} };

  // FastAPI 422: { detail: [{ loc: ["body","email"], msg: "field required", type: "..." }, ...] }
  if (Array.isArray(data.detail)) {
    const fields: Record<string, string> = {};
    const msgs: string[] = [];
    for (const item of data.detail) {
      if (item && typeof item === "object") {
        const loc = Array.isArray(item.loc) ? item.loc.filter((x: any) => x !== "body").join(".") : "";
        const msg = item.msg || item.message || "Invalid value";
        if (loc) fields[loc] = msg;
        msgs.push(loc ? `${loc}: ${msg}` : msg);
      } else if (typeof item === "string") {
        msgs.push(item);
      }
    }
    return { message: msgs.join(", ") || "Validation failed", fields };
  }

  // FastAPI default: { detail: "string" }  OR custom: { message: "..." } / { error: "..." }
  const msg =
    (typeof data.detail === "string" && data.detail) ||
    (typeof data.message === "string" && data.message) ||
    (typeof data.error === "string" && data.error) ||
    (typeof data === "string" && data) ||
    `Request failed (${status})`;
  return { message: msg, fields: {} };
}

export async function api<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const url = `${BASE}/api${path}`;

  // Timeout via AbortController
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 25000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new ApiError("Request timed out. Check your connection.", 0, null);
    }
    throw new ApiError(
      "Network error. Please check your internet and try again.",
      0,
      err?.message || "fetch_failed"
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const { message, fields } = parseFastApiError(data, res.status);
    // Auto sign-out on 401
    if (res.status === 401) {
      try { await clearToken(); } catch {}
    }
    throw new ApiError(message, res.status, data, fields);
  }
  return data as T;
}
