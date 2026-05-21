// API client with bearer auth
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BASE) {
  console.warn("EXPO_PUBLIC_BACKEND_URL not set");
}

async function getToken(): Promise<string | null> {
  return (await storage.secureGet("rxtech_token", "")) || null;
}

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
};

export async function api<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
