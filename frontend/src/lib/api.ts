/**
 * API client. The access token lives only in memory; the refresh token is an
 * httpOnly cookie the browser sends to /api/v1/auth/refresh. No provider keys
 * ever reach the browser — all Claude/Sarvam calls happen on the backend.
 */
import type { TokenOut } from "@/types/api";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<TokenOut | null> | null = null;
let onAuthLost: (() => void) | null = null;
let onTokens: ((t: TokenOut) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function configureAuthHooks(hooks: { onAuthLost: () => void; onTokens: (t: TokenOut) => void }) {
  onAuthLost = hooks.onAuthLost;
  onTokens = hooks.onTokens;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  return new ApiError(
    res.status,
    body.error?.code ?? `http_${res.status}`,
    body.error?.message ?? `Request failed (${res.status})`,
    body.error?.details,
  );
}

export async function refreshAccessToken(): Promise<TokenOut | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) return null;
        const data = (await res.json()) as TokenOut;
        accessToken = data.access_token;
        onTokens?.(data);
        return data;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  raw?: boolean;
  signal?: AbortSignal;
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, headers = {}, raw = false, signal, auth = true } = opts;
  const doFetch = () => {
    const h: Record<string, string> = { ...headers };
    if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) h["Content-Type"] = "application/json";
    return fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: h,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: "include",
      signal,
    });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error", "No connection to the BoltiToli server.");
  }

  if (res.status === 401 && auth) {
    const err = await parseError(res);
    if (["token_expired", "not_authenticated", "invalid_token"].includes(err.code)) {
      const t = await refreshAccessToken();
      if (t) {
        try {
          res = await doFetch();
        } catch {
          throw new ApiError(0, "network_error", "No connection to the BoltiToli server.");
        }
      } else {
        onAuthLost?.();
        throw err;
      }
    } else {
      throw err;
    }
  }
  if (!res.ok) throw await parseError(res);
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
