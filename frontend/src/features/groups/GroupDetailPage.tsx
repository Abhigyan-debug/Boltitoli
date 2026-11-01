import { Archive, ArchiveRestore, ArrowLeft, CloudOff, Pencil, Play } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, ErrorState, LevelTally, LoadingBlock } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime, pct } from "@/lib/utils";
import { useApiMutation, useGroup, useGroupAnalytics, useSessions } from "@/services/queries";
import { GroupForm } from "./GroupForm";

export default function GroupDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const g = useGroup(id);
  const sessions = useSessions({ group_id: id, limit: 20 });
  const analytics = useGroupAnalytics(6);
  const stats = analytics.data?.find((a) => a.group_id === id);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const t = useT();
  const archive = useApiMutation(
    () => api(`/groups/${id}`, { method: "PATCH", body: { archived: !g.data?.archived_at } }),
    [["groups"], ["group"], ["overview"]],
  );

  if (g.isLoading) return <LoadingBlock />;
  if (g.isError || !g.data) return <ErrorState message={errorMessage(g.error)} onRetry={() => g.refetch()} />;
  const grp = g.data;

  return (
    <div className="space-y-6">
      <Link to="/app/groups" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("All groups")}</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold">{grp.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-muted">
            <LevelTally level={grp.level} />
            {grp.size && <span>{t("{n} children", { n: grp.size })}</span>}
            {grp.leader_label && <span>{t("Leader:")} {grp.leader_label}</span>}
            {grp.archived_at && <span className="font-semibold text-warning-700">{t("Archived")}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> {t("Edit group")}</Button>
          <Button variant="ghost" onClick={() => (grp.archived_at ? archive.mutate() : setArchiving(true))}>
            {grp.archived_at ? <><ArchiveRestore /> {t("Restore")}</> : <><Archive /> {t("Archive")}</>}
          </Button>
          {!grp.archived_at && (
            <Button disabled={!grp.current_skill} onClick={() => nav(`/app/sessions/new?group=${grp.id}`)}><Play /> {t("Start session")}</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader title={t("Current skill")} />
          <div className="px-5 pb-5">
            {grp.current_skill ? (
              <>
                <p className="text-lg font-semibold" lang="hi">{grp.current_skill.name_hi}</p>
                <p className="text-ink-muted">{grp.current_skill.name_en}</p>
                <p className="mt-3 text-sm" lang="hi">{grp.current_skill.description_hi}</p>
              </>
            ) : (
              <EmptyState title={t("No skill chosen")} body={t("Choose a skill so this group can start a session.")}
                action={<Button onClick={() => setEditing(true)}>{t("Choose a skill")}</Button>} />
            )}
          </div>
          <div className="border-t border-line px-5 py-4 text-sm">
            <p className="font-semibold">{t("Last 6 weeks")}</p>
            {stats ? (
              <p className="mt-1 text-ink-muted">
                {t("{n} questions answered, {p} right on the first try.", { n: stats.questions_attempted, p: pct(stats.first_try_accuracy) })}
                {!stats.enough_data && ` ${t("That is not enough answers to judge progress yet.")}`}
              </p>
            ) : <p className="mt-1 text-ink-muted">{t("No sessions yet.")}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Session history")} />
          {sessions.isLoading ? <LoadingBlock /> : sessions.isError ? <ErrorState message={errorMessage(sessions.error)} />
            : !sessions.data?.items.length ? <EmptyState title={t("No sessions yet")} body={t("Each session’s summary will be listed here.")} />
            : (
              <ul className="divide-y divide-line px-2 pb-2">
                {sessions.data.items.map((s) => (
                  <li key={s.id}>
                    <Link to={s.status === "completed" || s.status === "abandoned" ? `/app/sessions/${s.id}/summary` : `/session/${s.id}`}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 hover:bg-chalk">
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium">{fmtDateTime(s.started_at)}</span>
                        <span className="block text-[13px] text-ink-muted truncate">{s.skill_name_en}{s.status !== "completed" && `, ${t(s.status)}`}</span>
                      </span>
                      {s.mode === "offline" && <CloudOff className="size-4 text-ink-faint" aria-label={t("Recorded offline")} />}
                      <span className="text-sm tabular">{s.correct_first_try}/{s.questions_attempted} {t("first try")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>

      <Dialog open={editing} onOpenChange={setEditing} title={t("Edit {name}", { name: grp.name })}>
        <GroupForm initial={grp} onCancel={() => setEditing(false)} onSaved={() => {
          toast.success(t("Saved changes"));
          setEditing(false);
        }} />
      </Dialog>
      <ConfirmDialog open={archiving} onOpenChange={setArchiving} title={t("Archive {name}?", { name: grp.name })}
        body={t("The group will be hidden from session setup. Its history is kept and you can restore it.")}
        confirmLabel={t("Archive group")} loading={archive.isPending}
        onConfirm={async () => {
          try {
            await archive.mutateAsync(undefined);
            toast.success(t("Archived {name}", { name: grp.name }));
          } catch (e) {
            toast.error(errorMessage(e));
          }
          setArchiving(false);
        }} />
    </div>
  );
}
