import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, configureAuthHooks, setAccessToken } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("api client", () => {
  it("refreshes an expired access token once and retries", async () => {
    setAccessToken("old");
    const onTokens = vi.fn();
    configureAuthHooks({ onAuthLost: vi.fn(), onTokens });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${url} ${(init.headers as Record<string, string>)?.Authorization ?? ""}`);
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", user: { id: "u" } });
      if ((init.headers as Record<string, string>).Authorization === "Bearer old")
        return json(401, { error: { code: "token_expired", message: "expired" } });
      return json(200, { ok: true });
    }));
    await expect(api("/groups")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["/api/v1/groups Bearer old", "/api/v1/auth/refresh ", "/api/v1/groups Bearer new"]);
    expect(onTokens).toHaveBeenCalled();
  });

  it("reports auth loss when refresh fails", async () => {
    setAccessToken("old");
    const onAuthLost = vi.fn();
    configureAuthHooks({ onAuthLost, onTokens: vi.fn() });
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh") ? json(401, {}) : json(401, { error: { code: "token_expired", message: "expired" } })));
    await expect(api("/groups")).rejects.toBeInstanceOf(ApiError);
    expect(onAuthLost).toHaveBeenCalled();
  });

  it("turns network failures into a recognisable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = (await api("/groups").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
  });

  it("exposes the server's error code and message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(409, { error: { code: "session_in_progress", message: "busy", details: { session_id: "s1" } } })));
    const err = (await api("/sessions", { method: "POST", body: {} }).catch((e) => e)) as ApiError;
    expect([err.status, err.code, err.message]).toEqual([409, "session_in_progress", "busy"]);
    expect(err.details).toEqual({ session_id: "s1" });
  });
});
