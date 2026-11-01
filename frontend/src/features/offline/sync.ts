/**
 * Sync queue for sessions recorded offline.
 *
 * - Sessions are uploaded in batches to POST /sync.
 * - Every session and answer carries a client-generated id, so re-sending
 *   after a dropped connection can never create duplicates on the server.
 * - "duplicate" from the server is treated as success.
 * - Failures back off and stay visible to the teacher as "sync failed".
 */
import { api, ApiError } from "@/lib/api";
import type { SyncResult } from "@/types/api";
import { deletePending, getMeta, listPending, type PendingSession, putPending, setMeta } from "./db";

export interface SyncReport {
  attempted: number;
  synced: number;
  failed: number;
  rejected: number;
}

let running: Promise<SyncReport> | null = null;
const listeners = new Set<() => void>();

export function onSyncChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

export function toPayload(p: PendingSession) {
  return {
    client_session_id: p.client_session_id,
    group_id: p.group_id,
    lesson_version_id: p.lesson_version_id,
    planned_minutes: p.planned_minutes,
    started_at: p.started_at,
    ended_at: p.ended_at,
    active_seconds: Math.round(p.active_seconds),
    responses: p.responses.map((r) => ({ ...r, override_outcome: r.override_outcome ?? null })),
  };
}

export function syncPending(schoolId?: string | null): Promise<SyncReport> {
  if (running) return running;
  running = (async () => {
    const report: SyncReport = { attempted: 0, synced: 0, failed: 0, rejected: 0 };
    const all = await listPending();
    const ready = all.filter(
      (p) => (p.status === "pending_sync" || p.status === "sync_failed") && (!schoolId || p.school_id === schoolId),
    );
    for (let i = 0; i < ready.length; i += 10) {
      const batch = ready.slice(i, i + 10);
      report.attempted += batch.length;
      for (const p of batch) await putPending({ ...p, status: "syncing" });
      emit();
      try {
        const res = await api<{ results: SyncResult[] }>("/sync", {
          method: "POST",
          body: { sessions: batch.map(toPayload) },
        });
        const byId = new Map(res.results.map((r) => [r.client_session_id, r]));
        for (const p of batch) {
          const r = byId.get(p.client_session_id);
          if (r && (r.status === "accepted" || r.status === "duplicate")) {
            report.synced += 1;
            // Synced records are removed: the server is now the source of truth.
            await deletePending(p.client_session_id);
          } else {
            report.rejected += 1;
            await putPending({ ...p, status: "rejected", attempts: p.attempts + 1, last_error: r?.error ?? "unknown" });
          }
        }
      } catch (e) {
        const msg = e instanceof ApiError ? e.code : "network_error";
        for (const p of batch) {
          report.failed += 1;
          await putPending({ ...p, status: "sync_failed", attempts: p.attempts + 1, last_error: msg });
        }
      }
      emit();
    }
    return report;
  })().finally(() => {
    running = null;
    emit();
  });
  return running;
}

export function isSyncing() {
  return running !== null;
}

/** Close online sessions that were interrupted by a network drop and continued offline. */
export async function closeOrphanSessions() {
  const ids = (await getMeta<string[]>("orphan_sessions")) ?? [];
  if (!ids.length) return;
  const left: string[] = [];
  for (const id of ids) {
    try {
      await api(`/sessions/${id}/end`, { method: "POST" });
    } catch (e) {
      if (e instanceof ApiError && (e.isNetwork || e.status >= 500)) left.push(id);
    }
  }
  await setMeta("orphan_sessions", left);
}
