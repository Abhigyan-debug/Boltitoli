import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Bot, CalendarDays, CheckCircle2, Clock, CloudOff, HelpCircle, type LucideIcon, Play, Square, Star, Target, Volume2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ToyBlocks } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { CountUp, Reveal, TiltCard } from "@/components/ui/motion";
import { Card, CardHeader, ErrorState, LoadingBlock, Notice } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { type PlayHandle, speakText } from "@/features/voice/speaker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useT } from "@/i18n/I18nProvider";
import { api, errorMessage } from "@/lib/api";
import { cn, fmtClock, fmtDateTime, LEVELS } from "@/lib/utils";
import { useApiMutation, useGroup, useSessionDetail, useSummary } from "@/services/queries";
import type { Level, SummaryStats } from "@/types/api";

/**
 * Learning progress as a stack of 3D blocks: one block per question.
 * Solid = right first try, lighter = right after a hint, outline = needs more practice.
 * It shows what was measured in this session, not a claim of mastery.
 */
function BlockStack({ stats }: { stats: SummaryStats }) {
  const reduce = useReducedMotion();
  const t = useT();
  const blocks = [
    ...Array(stats.correct_first_try).fill("first"),
    ...Array(stats.correct_after_hint).fill("hint"),
    ...Array(stats.not_yet).fill("notyet"),
  ] as ("first" | "hint" | "notyet")[];
  return (
    <div>
      <div className="flex flex-wrap-reverse content-start gap-1.5" role="img"
        aria-label={t("{a} right first try, {b} after a hint, {c} need more practice", { a: stats.correct_first_try, b: stats.correct_after_hint, c: stats.not_yet })}>
        {blocks.map((b, i) => (
          <motion.span key={i} className={
            b === "first" ? "size-9 rounded-[8px] bg-[linear-gradient(160deg,#3fc27f,var(--color-success-700))] shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_-4px_0_rgb(0_0_0/0.18),0_4px_8px_-4px_rgb(29_116_66/0.6)]"
              : b === "hint" ? "size-9 rounded-[8px] bg-[linear-gradient(160deg,#ffd27a,#f2b631)] shadow-[inset_0_2px_0_rgb(255_255_255/0.45),inset_0_-4px_0_rgb(0_0_0/0.12),0_4px_8px_-4px_rgb(242_182_49/0.6)]"
              : "size-9 rounded-[8px] border-2 border-dashed border-line-strong"}
            initial={reduce ? false : { y: -24, opacity: 0, rotate: -12 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: reduce ? 0 : 0.3 + i * 0.06, type: "spring", stiffness: 320, damping: 16 }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-success-500" /> {t("Right first try")} ({stats.correct_first_try})</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-[#f2b631]" /> {t("After a hint")} ({stats.correct_after_hint})</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border-2 border-dashed border-line-strong" /> {t("More practice")} ({stats.not_yet})</li>
      </ul>
    </div>
  );
}

/** Ring that draws itself up to the first-try percentage. */
function AccuracyRing({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <svg viewBox="0 0 44 44" className="size-12 -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-line)" strokeWidth="6" />
      <motion.circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-saffron-500)" strokeWidth="6" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: v / 100 }} transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}

function Tile({ icon: Icon, tone, children, label, delay }: { icon: LucideIcon; tone: string; children: ReactNode; label: string; delay: number }) {
  return (
    <Reveal delay={delay}>
      <TiltCard className="h-full rounded-[var(--radius-lg)]">
        <Card className="flex h-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
          <span className={cn("tile-3d size-12 shrink-0", tone)}><Icon className="size-6" aria-hidden /></span>
          <div>
            <p className="text-[26px] font-extrabold leading-none tabular">{children}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{label}</p>
          </div>
        </Card>
      </TiltCard>
    </Reveal>
  );
}

const NEXT_LEVEL: Record<Level, Level | null> = { beginner: "developing", developing: "advancing", advancing: null };
const PREV_LEVEL: Record<Level, Level | null> = { beginner: null, developing: "beginner", advancing: "developing" };
const DIFF = ["", "Easier", "Core", "Challenge"];

export default function SummaryPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const session = useSessionDetail(id);
  const summary = useSummary(id);
  const group = useGroup(session.data?.group_id ?? "");
  const [playing, setPlaying] = useState<PlayHandle | null>(null);
  const t = useT();
  const changeLevel = useApiMutation(
    (level: Level) => api(`/groups/${session.data!.group_id}`, { method: "PATCH", body: { level } }),
    [["groups"], ["group"]],
  );

  if (summary.isLoading || session.isLoading) return <LoadingBlock label={t("Preparing the summary")} />;
  if (summary.isError || !summary.data || !session.data) return <ErrorState message={errorMessage(summary.error ?? session.error)} onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const st = s.stats;
  const g = group.data;
  const done = session.data.status !== "abandoned";
  const suggestedLevel = g && (s.level_suggestion === "review_up" ? NEXT_LEVEL[g.level] : s.level_suggestion === "review_down" ? PREV_LEVEL[g.level] : null);
  const diffs = Object.entries(st.by_difficulty).filter(([, d]) => d.attempted > 0).sort(([a], [b]) => Number(a) - Number(b));

  const listen = async () => {
    if (playing) {
      playing.stop();
      setPlaying(null);
      return;
    }
    const h = await speakText(`${s.summary_hi} ${s.next_activity_hi}`);
    if (h.source === "none") toast.error(t("No Hindi voice is available. The summary is shown as text."));
    setPlaying(h);
    void h.done.then(() => setPlaying(null));
  };

  return (
    <div className="space-y-6">
      <Link to="/app/sessions" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Sessions")}</Link>

      {/* celebration banner */}
      <div className="slate-surface relative isolate overflow-hidden rounded-[24px] px-6 py-7 shadow-[var(--shadow-lift)] sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-72 rounded-full bg-[#3fd4ff]/20 blur-3xl animate-[bt-drift_14s_ease-in-out_infinite]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 -z-10 size-64 rounded-full bg-saffron-500/20 blur-3xl" />
        {[["left-[58%] top-6 bg-saffron-500", "0s"], ["left-[72%] bottom-8 bg-[#3fd4ff]", "0.7s"], ["left-[86%] top-10 bg-success-500", "1.4s"], ["left-[64%] bottom-5 bg-[#f2b631]", "2s"]].map(([c, d]) => (
          <span key={c} aria-hidden className={`absolute hidden size-2.5 rounded-full sm:block animate-[bt-float_3s_ease-in-out_infinite] ${c}`} style={{ animationDelay: d }} />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {done && <Star aria-hidden className="size-16 shrink-0 fill-[#f2b631] text-[#e09a12] drop-shadow-[0_8px_18px_rgb(242_182_49/0.55)] animate-[bt-pop_0.7s_ease-out_both]" />}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[30px] font-extrabold text-chalk" lang="hi">{done ? "सत्र पूरा हुआ" : "सत्र जल्दी खत्म हुआ"}</h1>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold", done ? "bg-success-100 text-success-700" : "bg-warning-100 text-warning-700")}>
                  <CheckCircle2 className="size-3.5" aria-hidden /> {t(done ? "Completed" : "Ended early")}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-chalk/80">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden /> {fmtDateTime(session.data.started_at)}</span>
                <span>{session.data.group_name}, <span lang="hi">{session.data.skill.name_hi}</span></span>
                <span>{t("{time} of practice", { time: fmtClock(session.data.active_seconds) })}</span>
                {st.mode === "offline" && <span className="inline-flex items-center gap-1"><CloudOff className="size-4" aria-hidden /> {t("recorded offline")}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="chalk" onClick={listen}>{playing ? <><Square /> {t("Stop")}</> : <><Volume2 /> {t("Listen to summary")}</>}</Button>
            {user?.role !== "official" && (
              <Button onClick={() => nav(`/app/sessions/new?group=${session.data!.group_id}`)}><Play /> {t("Next session for {name}", { name: session.data.group_name })}</Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile delay={0} icon={HelpCircle} tone="bg-sky-100 text-sky-600" label={t("Questions")}><CountUp value={st.questions_attempted} /></Tile>
        <Tile delay={0.06} icon={CheckCircle2} tone="bg-success-100 text-success-700" label={t("Right first try")}><CountUp value={st.correct_first_try} /></Tile>
        <Reveal delay={0.12}>
          <TiltCard className="h-full rounded-[var(--radius-lg)]">
            <Card className="flex h-full flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
              <AccuracyRing value={st.first_try_accuracy_pct} />
              <div>
                <p className="text-[26px] font-extrabold leading-none tabular">{st.first_try_accuracy_pct === null ? "—" : <CountUp value={Math.round(st.first_try_accuracy_pct)} suffix="%" />}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{t("First-try accuracy")}</p>
              </div>
            </Card>
          </TiltCard>
        </Reveal>
        <Tile delay={0.18} icon={Clock} tone="bg-saffron-100 text-saffron-600" label={t("of {n} planned minutes", { n: st.planned_minutes })}><CountUp value={st.minutes} suffix={` ${t("min")}`} /></Tile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Reveal>
            <Card className="paper-ruled overflow-hidden">
              <div className="pl-12 pr-6 pt-5 pb-6">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-wood-700">
                  {s.generated_by === "claude" ? <><Bot className="size-4" aria-hidden /> {t("Written by Claude from this session’s recorded answers")}</> : t("Written from this session’s recorded answers")}
                </p>
                <p className="mt-2 text-[18px] leading-8" lang="hi">{s.summary_hi}</p>
              </div>
            </Card>
          </Reveal>
          <Reveal delay={0.08}>
            <Card className="relative flex flex-wrap items-center gap-5 overflow-hidden p-5">
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-saffron-100 blur-2xl" />
              <div className="relative grid place-items-center rounded-[var(--radius-md)] bg-[linear-gradient(135deg,var(--color-saffron-100),var(--color-sky-100))] px-3 py-2">
                <ToyBlocks className="h-20 w-28 animate-[bt-float_4s_ease-in-out_infinite]" />
              </div>
              <div className="relative min-w-52 flex-1">
                <p className="text-[13px] font-semibold text-wood-700">{t("Suggested next activity")}</p>
                <p className="text-[17px] leading-8" lang="hi">{s.next_activity_hi}</p>
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-6">
          <Reveal delay={0.1}>
            <Card>
              <CardHeader title={t("{n} questions", { n: st.questions_attempted })} sub={st.questions_attempted < 8 ? t("A small sample: treat it as a glimpse, not a result.") : undefined} />
              <div className="px-5 pb-5">{st.questions_attempted ? <BlockStack stats={st} /> : <p className="text-ink-muted">{t("No answers were recorded.")}</p>}</div>
            </Card>
          </Reveal>
          {diffs.length > 0 && (
            <Reveal delay={0.14}>
              <Card>
                <CardHeader title={t("By difficulty")} sub={t("Right first try out of questions asked")} />
                <ul className="space-y-3 px-5 pb-5">
                  {diffs.map(([k, d], i) => {
                    const p = (100 * d.correct_first_try) / d.attempted;
                    return (
                      <li key={k} className="text-[13px]">
                        <div className="flex justify-between"><span className="font-semibold">{DIFF[Number(k)] ? t(DIFF[Number(k)]) : k}</span><span className="tabular text-ink-muted">{d.correct_first_try}/{d.attempted}</span></div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-chalk-dim">
                          <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-teal-600),#3fd4ff)]"
                            initial={{ width: 0 }} whileInView={{ width: `${p}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1 * i }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Reveal>
          )}
          <Reveal delay={0.18}>
            <Card>
              <CardHeader title={t("What was noticed")} />
              <div className="space-y-3 px-5 pb-5 text-sm">
                {st.misconceptions.length ? (
                  <ul className="space-y-1.5">
                    {st.misconceptions.map((m) => (
                      <li key={m.code} lang="hi" className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden />{m.label_hi} <span className="text-ink-muted tabular">({m.count}×)</span></li>
                    ))}
                  </ul>
                ) : <p className="flex items-center gap-2 text-ink-muted"><CheckCircle2 className="size-4 text-success-700" aria-hidden /> {t("No repeated mistake pattern was detected.")}</p>}
                {st.unclear_responses > 0 && <p className="text-ink-muted">{t("{n} spoken answers were unclear and were not counted.", { n: st.unclear_responses })}</p>}
                <p className="flex items-start gap-2 text-ink-muted">
                  <Target className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {t("Highest difficulty reached:")} {t(["", "easier", "core", "challenge"][st.highest_difficulty] ?? "")}.{" "}
                    {t("Answers entered by")} {Object.entries(st.input_methods).map(([k, v]) => `${t(k === "manual" ? "teacher" : k === "leader" ? "group leader" : k)} (${v})`).join(", ") || "—"}.
                  </span>
                </p>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>

      {s.level_suggestion !== "keep" && s.level_suggestion_reason_hi && g && user?.role !== "official" && (
        <Notice tone="info" className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-60">
            <p className="font-semibold">{t("A suggestion for you to decide on")}</p>
            <p lang="hi">{s.level_suggestion_reason_hi}</p>
          </div>
          {suggestedLevel && g.level !== suggestedLevel && (
            <Button variant="secondary" loading={changeLevel.isPending} onClick={async () => {
              try {
                await changeLevel.mutateAsync(suggestedLevel);
                toast.success(t("{name} moved to {level}", { name: g.name, level: t(LEVELS[suggestedLevel].en) }));
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}>{t("Move {name} to {level}", { name: g.name, level: t(LEVELS[suggestedLevel].en) })}</Button>
          )}
        </Notice>
      )}
    </div>
  );
}
