import { useEffect, useState, useSyncExternalStore } from "react";
import { listPending, type PendingSession } from "@/features/offline/db";
import { isSyncing, onSyncChange } from "@/features/offline/sync";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export type SyncState = "online" | "offline" | "syncing" | "sync_failed" | "pending";

/** Connectivity + offline queue state for the top bar. */
export function useSyncState(): { state: SyncState; pending: PendingSession[] } {
  const online = useOnline();
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [syncing, setSyncing] = useState(isSyncing());
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listPending()
        .then((p) => alive && setPending(p))
        .catch(() => {});
    refresh();
    const off = onSyncChange(() => {
      setSyncing(isSyncing());
      refresh();
    });
    const t = window.setInterval(refresh, 15_000);
    return () => {
      alive = false;
      off();
      window.clearInterval(t);
    };
  }, []);
  const waiting = pending.filter((p) => p.status !== "in_progress");
  let state: SyncState = online ? "online" : "offline";
  if (online && syncing) state = "syncing";
  else if (online && waiting.some((p) => p.status === "sync_failed" || p.status === "rejected")) state = "sync_failed";
  else if (online && waiting.length) state = "pending";
  return { state, pending };
}
