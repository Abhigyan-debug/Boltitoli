import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { GroupProgressChart } from "@/components/charts/GroupProgressChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { KidPair } from "@/components/illustrations/Cartoons";
import { Reveal } from "@/components/ui/motion";
import { useT } from "@/i18n/I18nProvider";
import { Card, CardHeader, EmptyState, ErrorState, LevelTally, LoadingBlock, Notice, PageHeader, Select } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api";
import { fmtDate, LEVELS, pct } from "@/lib/utils";
import { useGroupAnalytics } from "@/services/queries";
import type { GroupAnalytics } from "@/types/api";

const DIFF = ["", "Easier", "Core", "Challenge"];

/** Overall first-try accuracy as a gauge that sweeps up to its value. */
function Gauge({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="relative size-[72px] shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-chalk-dim)" strokeWidth="5" />
        <motion.circle cx="22" cy="22" r="18" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: (value ?? 0) / 100 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[15px] font-extrabold tabular">{pct(value)}</span>
    </div>
  );
}

function GroupCard({ g, delay }: { g: GroupAnalytics; delay: number }) {
  const t = useT();
  const lv = LEVELS[g.level];
  const trend = [...g.weekly].sort((a, b) => b.weeks_ago - a.weeks_ago)
    .map((w) => ({ label: w.weeks_ago === 0 ? t("This wk") : t("{n} wk ago", { n: w.weeks_ago }), value: w.first_try_accuracy, attempted: w.attempted, sessions: w.sessions }));
  return (
    <Reveal delay={delay}>
      <Card className="h-full overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 px-5 pt-5">
          <div className={`grid h-16 w-20 shrink-0 place-items-end justify-center rounded-[var(--radius-md)] ${lv.tint}`}><KidPair color={lv.color} className="h-14 w-16" /></div>
          <div className="min-w-40 flex-1">
            <h2 className="text-[19px] font-bold">{g.group_name}</h2>
            <p className="text-sm text-ink-muted"><LevelTally level={g.level} /> · {t("{n} answers", { n: g.questions_attempted })}</p>
            {!g.enough_data && <span className="mt-1 inline-block rounded-full bg-chalk-dim px-2.5 py-0.5 text-[12px] font-semibold text-ink-muted">{t("Not enough data yet")}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Gauge value={g.first_try_accuracy} color={lv.color} />
            <span className="text-[12px] leading-tight text-ink-muted">{t("Right first try")}</span>
          </div>
        </div>
        <div className="px-3 pt-3"><TrendChart data={trend} color={lv.color} label={t("Weekly first-try accuracy for {name}", { name: g.group_name })} /></div>
        <div className="grid gap-5 border-t border-line px-5 py-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">{t("Skills practised")}</p>
            {g.skills.length ? (
              <ul className="mt-2 space-y-2.5 text-sm">
                {g.skills.map((s, i) => (
                  <li key={s.skill_id}>
                    <div className="flex justify-between gap-2"><span lang="hi" className="font-medium">{s.name_hi}</span><span className="tabular font-semibold">{pct(s.first_try_accuracy)}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-chalk-dim">
                      <motion.div className="h-full rounded-full" style={{ background: lv.color }} initial={{ width: 0 }} whileInView={{ width: `${s.first_try_accuracy ?? 0}%` }}
                        viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1 * i }} />
                    </div>
                    <span className="block text-[12px] text-ink-muted">
                      {t("{n} sessions, up to {d}, last {date}", { n: s.sessions, d: t(DIFF[s.highest_difficulty]).toLowerCase(), date: fmtDate(s.last_session_at) })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">{t("None yet")}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold">{t("Common difficulties")}</p>
            {g.misconceptions.length ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {g.misconceptions.map((m) => (
                  <li key={m.code} lang="hi" className="inline-flex items-center gap-1.5 rounded-full bg-warning-100 px-2.5 py-1 text-[13px] text-warning-700">
                    <AlertCircle className="size-3.5" aria-hidden /> {m.label_hi} <span className="tabular opacity-80">{m.count}×</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-sm text-ink-muted">{t("No repeated pattern")}</p>}
          </div>
        </div>
      </Card>
    </Reveal>
  );
}

export default function ProgressPage() {
  const [weeks, setWeeks] = useState(6);
  const q = useGroupAnalytics(weeks);
  const t = useT();
  return (
    <>
      <PageHeader title={t("Progress & analytics")}
        sub={t("Measured from recorded sessions only. “Right first try” is the share of questions a group answered correctly before any hint.")}
        actions={
          <div className="w-40">
            <label htmlFor="weeks" className="sr-only">{t("Time range")}</label>
            <Select id="weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              <option value={4}>{t("Last 4 weeks")}</option><option value={6}>{t("Last 6 weeks")}</option><option value={12}>{t("Last 12 weeks")}</option>
            </Select>
          </div>
        } />
      <Notice tone="info" className="mb-6">
        A few sessions are not enough to show that a group has mastered a skill. Groups with fewer than 20 answers are marked
        “not enough data yet”. Use these numbers alongside what you see in class.
      </Notice>
      {q.isLoading ? <Card><LoadingBlock /></Card> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        : !q.data?.length ? <Card><EmptyState title={t("No groups to show")} body={t("Progress appears after your groups complete sessions.")} /></Card>
        : (
          <div className="space-y-6">
            <Reveal>
              <Card>
                <CardHeader title={t("All groups, week by week")} sub={t("Click a group to hide or show it")} />
                <div className="px-5 pb-5"><GroupProgressChart groups={q.data} height={300} /></div>
              </Card>
            </Reveal>
            <div className="grid gap-6 xl:grid-cols-2">
              {q.data.map((g, i) => <GroupCard key={g.group_id} g={g} delay={i * 0.08} />)}
            </div>
          </div>
        )}
    </>
  );
}
