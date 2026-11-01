import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { getMeta, getPack, setMeta } from "@/features/offline/db";
import { errorMessage } from "@/lib/api";
import { SessionView } from "./SessionView";
import { createOfflineSession } from "./useOfflineSession";
import { useOnlineSession } from "./useOnlineSession";

export default function LiveSessionPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { query, model, actions, session } = useOnlineSession(id);

  if (query.isLoading) return <LoadingBlock label="Loading session" />;
  if (query.isError || !model || !session)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        <Button variant="link" onClick={() => nav("/app")}>Back to dashboard</Button>
      </div>
    );
  // <Navigate> redirects after render; calling nav() here would update the router mid-render
  if (session.status === "completed" || session.status === "abandoned") return <Navigate to={`/app/sessions/${id}/summary`} replace />;

  /** Network dropped mid-session: continue the same lesson on this device, from the same question. */
  const continueOffline = async () => {
    const pack = await getPack(session.lesson_id);
    if (!pack || pack.version_id !== session.lesson_version_id || !user?.school_id) {
      toast.error("This lesson isn’t saved on this device, so it can’t continue offline. Retry when the network is back.");
      return;
    }
    const cid = await createOfflineSession({
      pack, schoolId: user.school_id, groupId: session.group_id, groupName: session.group_name,
      plannedMinutes: Math.max(5, Math.ceil(session.planned_minutes - session.active_seconds / 60)),
      seed: session.current_question
        ? { questionId: session.current_question.id, difficulty: session.current_difficulty, attempt: session.current_attempt }
        : undefined,
    });
    // Remember to close the interrupted online session once we reconnect.
    const orphans = (await getMeta<string[]>("orphan_sessions")) ?? [];
    await setMeta("orphan_sessions", [...new Set([...orphans, id])]);
    toast.message("Continuing offline. This part will sync as a separate session record.");
    nav(`/session/offline/${cid}`, { replace: true });
  };

  return <SessionView model={model} actions={actions} textOnly={session.voice_mode === "text_only"} onNetworkLoss={continueOffline} />;
}
