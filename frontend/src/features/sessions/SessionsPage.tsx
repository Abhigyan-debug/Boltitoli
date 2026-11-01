import { CloudOff, History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Select } from "@/components/ui/primitives";
import { useSyncState } from "@/hooks/useOnline";
import { errorMessage } from "@/lib/api";
import { fmtClock, fmtDateTime } from "@/lib/utils";
import { useGroups, useSessions } from "@/services/queries";

const PAGE = 20;
const STATUS_LABEL: Record<string, string> = { completed: "Completed", abandoned: "Ended early", active: "In progress", paused: "Paused", prepared: "Not started" };

export default function SessionsPage() {
  const [group, setGroup] = useState("");
  const [offset, setOffset] = useState(0);
  const t = useT();
  const groups = useGroups();
  const q = useSessions({ group_id: group || undefined, limit: PAGE, offset });
  const { pending } = useSyncState();
  const waiting = pending.filter((p) => p.status !== "in_progress");

  return (
    <>
      <PageHeader title={t("Sessions")} sub={t("Every session and its summary. Offline sessions appear here after they sync.")} />
      {waiting.length > 0 && (
        <Card className="mb-5 p-4">
          <p className="font-semibold">{t("On this device, waiting to sync")}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {waiting.map((p) => (
              <li key={p.client_session_id} className="flex flex-wrap gap-x-3">
                <CloudOff className="size-4 text-ink-faint" aria-hidden />
                {p.group_name}, {fmtDateTime(p.started_at)}, {t("{n} answers", { n: p.responses.length })}
                <span className={p.status === "rejected" || p.status === "sync_failed" ? "text-danger-700" : "text-ink-muted"}>
                  {p.status === "sync_failed" ? `${t("sync failed")} (${p.last_error})` : p.status === "rejected" ? `${t("not accepted")} (${p.last_error})` : t("waiting")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mb-4 max-w-xs">
        <label className="sr-only" htmlFor="filter-group">{t("Filter by group")}</label>
        <Select id="filter-group" value={group} onChange={(e) => { setGroup(e.target.value); setOffset(0); }}>
          <option value="">{t("All groups")}</option>
          {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          : !q.data?.items.length ? <EmptyState icon={<History className="size-8" />} title={t("No sessions yet")} body={t("Start a 15-minute session from the Overview.")}
            action={<Button asChild><Link to="/app/sessions/new">{t("Start a session")}</Link></Button>} />
          : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">{t("Session history")}</caption>
                  <thead className="bg-chalk text-[13px] text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">{t("Date")}</th>
                      <th scope="col" className="px-3 py-3 font-semibold">{t("Group")}</th>
                      <th scope="col" className="px-3 py-3 font-semibold">{t("Skill")}</th>
                      <th scope="col" className="px-3 py-3 font-semibold">{t("Length")}</th>
                      <th scope="col" className="px-3 py-3 font-semibold">{t("Right first try")}</th>
                      <th scope="col" className="px-5 py-3 font-semibold">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {q.data.items.map((s) => {
                      const done = s.status === "completed" || s.status === "abandoned";
                      return (
                        <tr key={s.id} className="hover:bg-chalk/60">
                          <td className="px-5 py-3"><Link className="font-semibold hover:underline underline-offset-4" to={done ? `/app/sessions/${s.id}/summary` : `/session/${s.id}`}>{fmtDateTime(s.started_at)}</Link></td>
                          <td className="px-3 py-3">{s.group_name}</td>
                          <td className="px-3 py-3"><span lang="hi">{s.skill_name_hi}</span></td>
                          <td className="px-3 py-3 tabular">{fmtClock(s.active_seconds)}</td>
                          <td className="px-3 py-3 tabular">{s.questions_attempted ? t("{a} of {b}", { a: s.correct_first_try, b: s.questions_attempted }) : "—"}</td>
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-1.5">{s.mode === "offline" && <CloudOff className="size-4 text-ink-faint" aria-label={t("Recorded offline")} />}{t(STATUS_LABEL[s.status] ?? s.status)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
                <span className="text-ink-muted">{t("{a}–{b} of {n}", { a: offset + 1, b: Math.min(offset + PAGE, q.data.total), n: q.data.total })}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>{t("Previous")}</Button>
                  <Button size="sm" variant="secondary" disabled={offset + PAGE >= q.data.total} onClick={() => setOffset(offset + PAGE)}>{t("Next")}</Button>
                </div>
              </div>
            </>
          )}
      </Card>
    </>
  );
}
