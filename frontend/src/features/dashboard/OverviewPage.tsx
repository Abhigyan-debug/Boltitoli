import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck, Clock, CloudDownload, CloudOff, type LucideIcon, Play, Plus, Target, Users, WifiOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { GroupProgressChart } from "@/components/charts/GroupProgressChart";
import { KidPair, ToyBlocks } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { CountUp, Reveal, TiltCard } from "@/components/ui/motion";
import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { useT } from "@/i18n/I18nProvider";
import { listPacks } from "@/features/offline/db";
import { errorMessage } from "@/lib/api";
import { cn, daysAgo, fmtDate, LEVELS, pct } from "@/lib/utils";
import { useActiveSessions, useGroupAnalytics, useGroups, useOverview } from "@/services/queries";
import type { Group, GroupAnalytics, SessionListItem, SessionStatus } from "@/types/api";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function StatCard({ icon: Icon, tone, value, suffix, label, note, delay }: {
  icon: LucideIcon; tone: string; value: number | null; suffix?: string; label: string; note: string; delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <TiltCard className="h-full rounded-[var(--radius-lg)]">
        <Card className="flex h-full flex-col items-start gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)] sm:flex-row sm:gap-3.5">
          <span className={cn("tile-3d size-12 shrink-0", tone)}><Icon className="size-6" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-[26px] font-extrabold leading-none tabular">
              {value === null ? "—" : <CountUp value={value} suffix={suffix} />}
            </p>
            <p className="mt-1.5 text-[13px] font-semibold">{label}</p>
            <p className="text-[12px] text-ink-faint">{note}</p>
          </div>
        </Card>
      </TiltCard>
    </Reveal>
  );
}

function GroupCard({ g, stats, onStart, delay }: { g: Group; stats?: GroupAnalytics; onStart: () => void; delay: number }) {
  const lv = LEVELS[g.level];
  const acc = stats?.first_try_accuracy ?? null;
  const t = useT();
  return (
    <Reveal delay={delay} className="h-full">
      <TiltCard className="h-full rounded-[var(--radius-lg)]">
        <div className="flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
          <div className={cn("-mx-1 -mt-1 flex items-end justify-center rounded-[var(--radius-md)] pt-2", lv.tint)}>
            <KidPair color={lv.color} className="h-16 w-[72px] translate-y-px" />
          </div>
          <Link to={`/app/groups/${g.id}`} className="mt-3 text-[17px] font-bold hover:underline underline-offset-4">{g.name}</Link>
          <p className="text-[13px] text-ink-muted">{t(lv.en)}{g.size ? ` · ${t("{n} children", { n: g.size })}` : ""}</p>
          <p className="mt-2 flex-1 text-[13px]">
            {g.current_skill ? <><span lang="hi" className="font-semibold">{g.current_skill.name_hi}</span><span className="block text-ink-muted">{g.current_skill.name_en}</span></> : <span className="text-ink-muted">{t("No skill chosen yet")}</span>}
          </p>
          {/* accuracy bar: measured "right first try" for the selected weeks */}
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-ink-muted"><span>{t("Right first try")}</span><span className="tabular font-semibold text-ink">{pct(acc)}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-chalk-dim">
              <motion.div className="h-full rounded-full" style={{ background: lv.color }}
                initial={{ width: 0 }} whileInView={{ width: `${acc ?? 0}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: delay + 0.2, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">{t("Last practice:")} {daysAgo(g.last_session_at, t)}</p>
          </div>
          <Button className="mt-3" variant={g.current_skill ? "secondary" : "ghost"} size="sm" onClick={onStart}>
            <Play /> {t(g.current_skill ? "Start session" : "Choose a skill")}
          </Button>
        </div>
      </TiltCard>
    </Reveal>
  );
}

const STATUS: Partial<Record<SessionStatus, { label: string; tone: string }>> = {
  completed: { label: "Completed", tone: "bg-success-100 text-success-700" },
  abandoned: { label: "Ended early", tone: "bg-warning-100 text-warning-700" },
  active: { label: "In progress", tone: "bg-sky-100 text-sky-600" },
  paused: { label: "Paused", tone: "bg-chalk-dim text-ink-muted" },
};

function accTone(n: number | null) {
  if (n === null) return "text-ink-muted";
  return n >= 75 ? "text-success-700" : n >= 50 ? "text-warning-700" : "text-danger-700";
}

function RecentTable({ rows }: { rows: SessionListItem[] }) {
  const t = useT();
  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="w-full min-w-[460px] text-left text-[13px]">
        <thead className="text-[12px] text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-3 py-2 font-semibold">{t("Date")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Group")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Skill")}</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">{t("First try")}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{t("Status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const acc = s.questions_attempted ? (100 * s.correct_first_try) / s.questions_attempted : null;
            const st = STATUS[s.status] ?? { label: s.status, tone: "bg-chalk-dim text-ink-muted" };
            return (
              <motion.tr key={s.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="border-b border-line/70 last:border-0 hover:bg-sky-50">
                <td className="px-3 py-2.5 tabular text-ink-muted">{fmtDate(s.started_at)}</td>
                <td className="px-3 py-2.5 font-semibold">
                  <Link to={`/app/sessions/${s.id}/summary`} className="hover:underline underline-offset-4">{s.group_name}</Link>
                  {s.mode === "offline" && <CloudOff className="ml-1.5 inline size-3.5 text-ink-faint" aria-label={t("Recorded offline")} />}
                </td>
                <td className="max-w-40 truncate px-3 py-2.5 text-ink-muted">{s.skill_name_en}</td>
                <td className={cn("px-3 py-2.5 text-right font-bold tabular", accTone(acc))}>
                  {pct(acc)}<span className="block text-[11px] font-medium text-ink-faint">{s.correct_first_try}/{s.questions_attempted}</span>
                </td>
                <td className="px-3 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{t(st.label)}</span></td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const ov = useOverview(7);
  const groups = useGroups();
  const analytics = useGroupAnalytics(4);
  const active = useActiveSessions();
  const packs = useQuery({ networkMode: "always", queryKey: ["offline-packs"], queryFn: listPacks });
  const isOfficial = user?.role === "official";
  const t = useT();
  const first = user?.full_name.split(" ")[0];
  const statsFor = (id: string) => analytics.data?.find((a) => a.group_id === id);

  if (ov.isError && !navigator.onLine)
    return <EmptyState icon={<WifiOff className="size-8" />} title={t("You are offline")}
      body={t("The dashboard needs a connection. Downloaded lessons can still be run from Lessons.")}
      action={<Button asChild><Link to="/app/lessons">{t("Open lessons")}</Link></Button>} />;

  const o = ov.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-[-0.015em]">
            {t(greeting())}, {first}!{" "}
            <motion.span aria-hidden className="inline-block origin-[70%_80%]" animate={{ rotate: [0, 16, -6, 14, 0] }} transition={{ duration: 1.6, delay: 0.4 }}>👋</motion.span>
          </h1>
          <p className="text-ink-muted">{t(isOfficial ? "Aggregated practice across schools you can view." : "Here’s your classroom overview.")}</p>
          {packs.data !== undefined && !isOfficial && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-semibold text-teal-800">
              <CloudDownload className="size-3.5" aria-hidden /> {packs.data.length === 1 ? t("1 lesson ready offline on this device") : t("{n} lessons ready offline on this device", { n: packs.data.length })}
            </p>
          )}
        </div>
        {!isOfficial && (
          <Button size="lg" className="group/cta" onClick={() => nav("/app/sessions/new")}>
            <Play /> {t("Start 15-minute Session")} <ArrowRight className="transition-transform group-hover/cta:translate-x-1" />
          </Button>
        )}
      </div>

      {active.data?.map((s) => (
        <div key={s.id} className="slate-surface relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-[var(--radius-lg)] px-5 py-4 shadow-[var(--shadow-lift)]">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[#3fd4ff]/20 blur-2xl" />
          <p className="relative flex items-center gap-2.5">
            <span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#3fd4ff]" /><span className="relative size-2.5 rounded-full bg-[#3fd4ff]" /></span>
            <span><span className="font-semibold">{s.group_name}</span> {t("has an unfinished session:")} {s.skill.name_en}.</span>
          </p>
          <Button variant="chalk" className="relative" onClick={() => nav(`/session/${s.id}`)}>{t("Resume session")}</Button>
        </div>
      ))}

      {ov.isLoading ? <Card><LoadingBlock label="Loading this week" /></Card>
        : ov.isError ? <ErrorState message={errorMessage(ov.error)} onRetry={() => ov.refetch()} />
        : o && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard delay={0} icon={CalendarCheck} tone="bg-saffron-100 text-saffron-600" value={o.sessions_completed} label={t("Sessions completed")} note={t("last {n} days", { n: o.period_days })} />
            <StatCard delay={0.06} icon={Users} tone="bg-sky-100 text-sky-600" value={isOfficial ? o.active_groups : groups.data?.length ?? o.active_groups} label={t("Learning groups")} note={t("{n} practised this week", { n: o.active_groups })} />
            <StatCard delay={0.12} icon={Clock} tone="bg-teal-100 text-teal-700" value={o.practice_minutes} label={t("Practice minutes")} note={t("guided by BoltiToli")} />
            <StatCard delay={0.18} icon={Target} tone="bg-success-100 text-success-700" value={o.first_try_accuracy === null ? null : Math.round(o.first_try_accuracy)} suffix="%" label={t("Right first try")} note={o.accuracy_sample ? t("from {n} answers", { n: o.accuracy_sample }) : t("no answers yet")} />
          </div>
        )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {!isOfficial && (
          <Card>
            <CardHeader title={t("Your learning groups")} action={<Link to="/app/groups" className="text-sm font-semibold text-teal-700 hover:underline">{t("View all")}</Link>} />
            {groups.isLoading ? <LoadingBlock /> : groups.isError ? <ErrorState message={errorMessage(groups.error)} onRetry={() => groups.refetch()} />
              : groups.data?.length === 0 ? (
                <EmptyState title={t("No groups yet")} body={t("Create three groups by learning level, for example Beginner, Developing and Advancing.")}
                  action={<Button onClick={() => nav("/app/groups")}><Plus /> {t("Create groups")}</Button>} />
              ) : (
                <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.data?.map((g, i) => (
                    <GroupCard key={g.id} g={g} stats={statsFor(g.id)} delay={i * 0.08}
                      onStart={() => nav(g.current_skill ? `/app/sessions/new?group=${g.id}` : `/app/groups/${g.id}`)} />
                  ))}
                </div>
              )}
          </Card>
        )}

        {o?.recommendation && !isOfficial && (
          <Reveal delay={0.1}>
            <Card className="relative h-full overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-saffron-100 blur-2xl" />
              <CardHeader title={t("Suggested next step")} />
              <div className="relative flex flex-col gap-4 px-5 pb-5">
                <div className="flex items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(135deg,var(--color-saffron-100),var(--color-sky-100))] py-4">
                  <ToyBlocks className="h-24 w-32 animate-[bt-float_4s_ease-in-out_infinite]" />
                </div>
                <p lang="hi" className="text-[15px]">{o.recommendation.message_hi}</p>
                {o.recommendation.kind === "create_group" ? (
                  <Button variant="secondary" onClick={() => nav("/app/groups")}><Plus /> {t("Create a group")}</Button>
                ) : (
                  <Button variant="secondary" onClick={() => nav(`/app/sessions/new?group=${o.recommendation!.group_id}`)}>
                    <Play /> {t("Start with {name}", { name: o.recommendation.group_name })}
                  </Button>
                )}
              </div>
            </Card>
          </Reveal>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* min-w-0: let the card shrink so only its table scrolls sideways on phones */}
        <Card className="min-w-0">
          <CardHeader title={t("Recent sessions")} action={<Link to={isOfficial ? "/app/reports" : "/app/sessions"} className="text-sm font-semibold text-teal-700 hover:underline">{t("View all")}</Link>} />
          {ov.isLoading ? <LoadingBlock /> : !o?.recent_sessions.length ? (
            <EmptyState title={t("No sessions yet")} body={t("Completed sessions and their summaries will appear here.")} />
          ) : <RecentTable rows={o.recent_sessions} />}
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t("Group progress")} sub={t("Right first try, last 4 weeks")} action={<Link to="/app/progress" className="text-sm font-semibold text-teal-700 hover:underline">{t("Details")}</Link>} />
          <div className="px-5 pb-5">
            {analytics.isLoading ? <LoadingBlock /> : analytics.isError ? <ErrorState message={errorMessage(analytics.error)} onRetry={() => analytics.refetch()} />
              : !analytics.data?.length ? <EmptyState title={t("No progress yet")} body={t("Bars appear after groups complete sessions.")} />
              : <GroupProgressChart groups={analytics.data} height={220} />}
          </div>
        </Card>
      </div>
    </div>
  );
}
