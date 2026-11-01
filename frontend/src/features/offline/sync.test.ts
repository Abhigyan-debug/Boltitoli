import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDbForTests, listPending, type PendingSession, putPending } from "./db";
import { syncPending } from "./sync";

function pending(id: string, status: PendingSession["status"] = "pending_sync"): PendingSession {
  return {
    client_session_id: id,
    school_id: "school-1",
    group_id: "g1",
    group_name: "Udaan",
    lesson_id: "l1",
    lesson_version_id: "v1",
    skill_name_hi: "जोड़",
    planned_minutes: 15,
    started_at: "2026-10-01T04:30:00.000Z",
    ended_at: "2026-10-01T04:45:00.000Z",
    active_seconds: 840.4,
    last_resumed_at: null,
    paused: false,
    engine_state: {},
    responses: [{ client_response_id: `${id}-r1`, question_id: "q1", sequence_no: 1, attempt_no: 1,
      input_method: "manual", value: 3, confirmed: true, answered_at: "2026-10-01T04:31:00.000Z" }],
    status,
    attempts: 0,
    last_error: null,
    server_session_id: null,
    updated_at: "",
  };
}

beforeEach(async () => {
  await _resetDbForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("offline sync queue", () => {
  it("uploads pending sessions and removes them once accepted or duplicate", async () => {
    await putPending(pending("aaaaaaaa1"));
    await putPending(pending("aaaaaaaa2"));
    await putPending(pending("inprogress", "in_progress"));
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.sessions).toHaveLength(2);
      expect(body.sessions[0].active_seconds).toBe(840);
      return new Response(JSON.stringify({ results: [
        { client_session_id: "aaaaaaaa1", status: "accepted", session_id: "s1", error: null },
        { client_session_id: "aaaaaaaa2", status: "duplicate", session_id: "s2", error: null },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const report = await syncPending();
    expect(report).toEqual({ attempted: 2, synced: 2, failed: 0, rejected: 0 });
    const left = await listPending();
    expect(left.map((p) => p.client_session_id)).toEqual(["inprogress"]);
  });

  it("keeps records and marks them failed when the network drops", async () => {
    await putPending(pending("bbbbbbbb1"));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const report = await syncPending();
    expect(report.failed).toBe(1);
    const [p] = await listPending();
    expect(p.status).toBe("sync_failed");
    expect(p.attempts).toBe(1);
    expect(p.last_error).toBe("network_error");
  });

  it("retries failed records and never sends the same answer id twice as new", async () => {
    await putPending(pending("cccccccc1", "sync_failed"));
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      seen.push(...body.sessions.flatMap((s: { responses: { client_response_id: string }[] }) =>
        s.responses.map((r) => r.client_response_id)));
      return new Response(JSON.stringify({ results: [
        { client_session_id: "cccccccc1", status: "accepted", session_id: "s3", error: null }] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    await syncPending();
    expect(seen).toEqual(["cccccccc1-r1"]);
    expect(await listPending()).toHaveLength(0);
  });

  it("marks server-rejected records so the teacher can see them", async () => {
    await putPending(pending("dddddddd1"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [
      { client_session_id: "dddddddd1", status: "rejected", session_id: null, error: "unknown_question" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } })));
    const report = await syncPending();
    expect(report.rejected).toBe(1);
    expect((await listPending())[0]).toMatchObject({ status: "rejected", last_error: "unknown_question" });
  });
});
