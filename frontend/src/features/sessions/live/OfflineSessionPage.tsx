import { useQuery } from "@tanstack/react-query";
import { CloudOff, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Card, EmptyState, ErrorState, Field, LevelTally, LoadingBlock, Notice, Select } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { getMeta, getPack, type OfflineRoster } from "@/features/offline/db";
import { syncPending } from "@/features/offline/sync";
import { useOnline } from "@/hooks/useOnline";
import { fmtClock } from "@/lib/utils";
import { localStats } from "./localSummary";
import { SessionView } from "./SessionView";
import { createOfflineSession, useOfflineSession } from "./useOfflineSession";

/** Pick a group for a downloaded lesson, then create the offline session record. */
function NewOffline() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const lessonId = sp.get("lesson") ?? "";
  const pack = useQuery({ networkMode: "always", queryKey: ["offline-pack", lessonId], queryFn: () => getPack(lessonId) });
  const roster = useQuery({ networkMode: "always", queryKey: ["offline-roster"], queryFn: () => getMeta<OfflineRoster>("roster") });
  const [groupId, setGroupId] = useState(sp.get("group") ?? "");
  const [minutes, setMinutes] = useState("15");
  const t = useT();

  if (pack.isLoading || roster.isLoading) return <LoadingBlock />;
  if (!pack.data) return <ErrorState message={t("This lesson is not saved on this device.")} />;
  const groups = (roster.data?.groups ?? []).filter((g) => g.archived_at === null);
  return (
    <div className="mx-auto max-w-lg p-5">
      <Logo className="mb-6" />
      <h1 className="text-2xl font-extrabold">{t("Run a lesson offline")}</h1>
      <p className="mb-5 text-ink-muted" lang="hi">{pack.data.title_hi}, {t(pack.data.audio_clips ? "Hindi audio saved" : "text only")}</p>
      <Notice tone="info" className="mb-5">
        Offline, BoltiToli speaks from saved audio (or this phone’s Hindi voice) and you enter the group’s answers with the number pad.
        Speech recognition needs internet. The session syncs automatically later.
      </Notice>
      {groups.length === 0 ? (
        <EmptyState title={t("No groups saved on this device")} body={t("Open Lessons while online once so your groups are saved for offline use.")} />
      ) : (
        <Card className="space-y-4 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("Group")}</legend>
            <div className="space-y-2">
              {groups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center justify-between rounded-[var(--radius-md)] border border-line-strong p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="group" value={g.id} checked={groupId === g.id} onChange={() => setGroupId(g.id)} className="accent-teal-600 size-4" />
                    <span className="font-semibold">{g.name}</span>
                  </span>
                  <LevelTally level={g.level} />
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("Duration")}>
            {(id) => (
              <Select id={id} value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                <option value="10">{t("{n} minutes", { n: 10 })}</option><option value="15">{t("{n} minutes", { n: 15 })}</option><option value="20">{t("{n} minutes", { n: 20 })}</option>
              </Select>
            )}
          </Field>
          <Button size="lg" className="w-full" disabled={!groupId || !user?.school_id} onClick={async () => {
            const g = groups.find((x) => x.id === groupId)!;
            const cid = await createOfflineSession({ pack: pack.data!, schoolId: user!.school_id!, groupId: g.id, groupName: g.name, plannedMinutes: Number(minutes) });
            nav(`/session/offline/${cid}`, { replace: true });
          }}><Play /> {t("Prepare session")}</Button>
        </Card>
      )}
      <Link to="/app/lessons" className="mt-4 inline-block text-sm text-teal-700 underline">{t("Back to lessons")}</Link>
    </div>
  );
}

function OfflineDone({ id }: { id: string }) {
  const { record, pack, error } = useOfflineSession(id);
  const online = useOnline();
  const { user, status } = useAuth();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const t = useT();
  useEffect(() => {
    if (online && status === "authenticated" && record?.status === "pending_sync") {
      void syncPending(user?.school_id).then((r) =>
        setSyncMsg(r.synced ? "Synced. The full summary is now in Sessions." : r.failed ? "Sync failed. It will retry automatically." : null));
    }
  }, [online, status, record?.status, user?.school_id]);
  if (error) return <div className="p-6"><Notice tone="info">{syncMsg ? t(syncMsg) : error}</Notice><Link to="/app/sessions" className="text-teal-700 underline">{t("Open sessions")}</Link></div>;
  if (!record || !pack) return <LoadingBlock />;
  const s = localStats(record.responses, pack);
  return (
    <div className="mx-auto max-w-xl p-5">
      <Logo className="mb-6" />
      <h1 className="text-2xl font-extrabold" lang="hi">सत्र पूरा हुआ</h1>
      <p className="text-ink-muted">{record.group_name}, {t("{time} of practice", { time: fmtClock(record.active_seconds) })}</p>
      <Card className="paper-ruled mt-5 py-5 pl-12 pr-5">
        <p lang="hi" className="leading-8">
          {s.attempted} सवाल किए गए: {s.first} पहली बार में सही, {s.afterHint} संकेत के बाद सही, {s.notYet} में अभी और अभ्यास चाहिए।
          {s.topMisconception && <> सबसे ज़्यादा दिखी कठिनाई: {s.topMisconception}।</>}
        </p>
      </Card>
      <Notice tone={record.status === "rejected" ? "danger" : "info"} className="mt-4 flex items-center gap-2">
        <CloudOff className="size-4 shrink-0" />
        {record.status === "rejected"
          ? record.last_error === "no_answers" ? t("No answers were recorded, so there is nothing to sync.") : t("The server could not accept this session ({e}).", { e: record.last_error ?? "" })
          : t(syncMsg ?? "Saved on this device. This is a preview; the server checks every answer again and writes the full summary when it syncs.")}
      </Notice>
      <div className="mt-6 flex gap-2">
        <Button asChild><Link to="/app/lessons">{t("Back to lessons")}</Link></Button>
        {online && <Button asChild variant="secondary"><Link to="/app/sessions">{t("Sessions")}</Link></Button>}
      </div>
    </div>
  );
}

function OfflineRun({ id }: { id: string }) {
  const { model, actions, error } = useOfflineSession(id);
  if (error) return <div className="mx-auto max-w-lg p-6"><ErrorState message={error} /></div>;
  if (!model) return <LoadingBlock label="Opening offline session" />;
  return <SessionView model={model} actions={actions} />;
}

export default function OfflineSessionPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  if (id === "new") return <NewOffline />;
  if (sp.get("done")) return <OfflineDone id={id} />;
  return <OfflineRun id={id} />;
}
