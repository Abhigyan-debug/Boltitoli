import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Check, ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Keyboard, Lightbulb, Mic, Pause, Play, RotateCcw, SkipForward,
  Star, UserRound, Volume2, WifiOff, X,
} from "lucide-react";
import { SpeakerBadge2D } from "@/components/illustrations/Cartoons";
import type { SpeakerState } from "@/components/three/BoltiToliSpeaker";
import { useLang, useT } from "@/i18n/I18nProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QuestionVisual } from "@/components/illustrations/QuestionVisual";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { AnswerRecorder, MicUnavailableError, micSupported } from "@/features/voice/recorder";
import { speak, type SpeakItem, stopSpeaking, type VoiceSource } from "@/features/voice/speaker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ApiError, errorMessage } from "@/lib/api";
import { cn, fmtClock } from "@/lib/utils";
import type { Feedback, Question, Transcription } from "@/types/api";
import { NumberPad } from "./NumberPad";
import { StatusPanel, type UiState } from "./StatusPanel";
import { PHRASES } from "../engine/engine";
import { type AnswerInput, phraseItems, type SessionActions, type SessionModel } from "./types";

const STEPS = [
  { hi: "शुरुआत", en: "Intro" },
  { hi: "सवाल", en: "Question" },
  { hi: "जवाब", en: "Listening" },
  { hi: "प्रतिक्रिया", en: "Feedback" },
];
const VOICE_NOTE: Record<VoiceSource, string | null> = {
  saved_clip: "Hindi voice saved on this device",
  server_clip: "Hindi voice from the server",
  device_voice: "Using this phone’s Hindi voice",
  none: null,
};

/** Confetti burst and a popping star over the stage; purely decorative (skipped with reduced motion). */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  x: Math.cos((i / 28) * Math.PI * 2) * (120 + (i % 4) * 40),
  y: Math.sin((i / 28) * Math.PI * 2) * (90 + (i % 3) * 35) - 40,
  r: (i * 47) % 360,
  c: ["#f28a1e", "#3b8fe0", "#1fa287", "#e2483b", "#f2b631"][i % 5],
  round: i % 3 === 0,
}));

function Celebration() {
  return (
    <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {CONFETTI.map((p, i) => (
        <motion.span key={i} className={cn("absolute h-3 w-2", p.round ? "rounded-full w-2.5 h-2.5" : "rounded-[2px]")} style={{ background: p.c }}
          initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 120], scale: [0, 1, 1], rotate: p.r + 360, opacity: [1, 1, 0] }}
          transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.35, 1] }} />
      ))}
      <div className="flex flex-col items-center">
        <Star className="size-20 fill-[#f2b631] text-[#e09a12] drop-shadow-[0_8px_16px_rgb(242_182_49/0.6)] animate-[bt-pop_0.6s_ease-out_both]" />
        <motion.p lang="hi" className="mt-1 rounded-full bg-white/90 px-4 py-1 text-[22px] font-extrabold text-success-700 shadow-[var(--shadow-lift)]"
          initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          शाबाश!
        </motion.p>
      </div>
    </motion.div>
  );
}

function stepIndex(ui: UiState, hasFeedback: boolean) {
  if (ui === "intro" || ui === "preparing") return 0;
  if (ui === "listening" || ui === "checking" || ui === "confirm") return 2;
  if (hasFeedback) return 3;
  return 1;
}

export function SessionView({ model, actions, textOnly, onNetworkLoss }: {
  model: SessionModel;
  actions: SessionActions;
  textOnly?: boolean;
  onNetworkLoss?: () => void;
}) {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const t = useT();
  const { lang } = useLang();
  const [ui, setUi] = useState<UiState>(model.status === "prepared" ? "intro" : model.status === "paused" ? "paused" : "waiting");
  const [shown, setShown] = useState<Question | null>(model.question);
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [voice, setVoice] = useState<VoiceSource>("none");
  const [levels, setLevels] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<Transcription | null>(null);
  const [padOpen, setPadOpen] = useState(!model.canListen);
  const [by, setBy] = useState<"manual" | "leader">("manual");
  const [teacherOpen, setTeacherOpen] = useState(true);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [netLost, setNetLost] = useState<null | (() => Promise<void>)>(null);
  const [canListen, setCanListen] = useState(model.canListen && micSupported());
  const recorder = useRef<AnswerRecorder | null>(null);
  const [now, setNow] = useState(Date.now());

  // Timer
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = model.activeSeconds + (model.runningSince ? (now - model.runningSince) / 1000 : 0);
  const timeUp = elapsed >= model.plannedMinutes * 60;

  // Keep the shown question in sync when it changes outside of an answer (e.g. teacher picks easier).
  useEffect(() => {
    if (!feedback && model.question?.id !== shown?.id) setShown(model.question);
  }, [model.question, feedback, shown?.id]);

  useEffect(() => () => {
    stopSpeaking();
    recorder.current?.cancel();
  }, []);

  const say = useCallback(async (items: SpeakItem[], after: UiState = "waiting") => {
    setUi(items.some((i) => i.ref?.endsWith(":hint")) && items.length === 1 ? "hint" : "speaking");
    const h = speak(items, { textOnly });
    void h.sourceReady.then(setVoice);
    await h.done;
    setUi(after);
  }, [textOnly]);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        setNetLost(() => fn);
        setUi("waiting");
      } else if (e instanceof ApiError && e.code === "stale_question") {
        toast.message(t("That answer was already recorded. Showing the current question."));
        setFeedback(null);
        setUi("waiting");
      } else {
        toast.error(errorMessage(e));
        setUi("waiting");
      }
    }
  }, [t]);

  const promptItem = (q: Question | null): SpeakItem[] => (q ? [{ ref: `q:${q.id}:prompt`, text: q.prompt_hi }] : []);

  const begin = () => guard(async () => {
    setUi("preparing");
    if (model.status === "prepared") await actions.start();
    await say([{ ref: model.introRef, text: model.introHi }, ...promptItem(model.question)]);
  });

  const submit = (a: AnswerInput) => guard(async () => {
    const asked = shown;
    setUi("checking");
    setConfirm(null);
    const fb = await actions.answer(a);
    setFeedback(fb);
    const goesOn = !["retry_with_hint", "ask_again"].includes(fb.action);
    setReveal(fb.outcome === "correct" || !!fb.explanation_hi);
    const items: SpeakItem[] = [...phraseItems(fb.message_hi)];
    if (fb.hint_hi && asked) items.push({ ref: `q:${asked.id}:hint`, text: fb.hint_hi });
    if (fb.explanation_hi && asked)
      items.push(fb.feedback_source === "claude" ? { text: fb.explanation_hi } : { ref: `q:${asked.id}:explanation`, text: fb.explanation_hi });
    if (fb.suggest_manual) setPadOpen(true);
    await say(items, "waiting");
    if (goesOn) {
      // pause on the counted result, then move to the next question
      if (fb.outcome === "correct" && !reduce) await new Promise((r) => setTimeout(r, 1400));
      setReveal(false);
      setFeedback(null);
      setShown((prev) => (prev?.id === asked?.id ? null : prev));
    }
  });

  // After an answer moves on, show and speak the new question.
  useEffect(() => {
    if (shown === null && model.question && !feedback && ui !== "complete") {
      setShown(model.question);
      void say(promptItem(model.question));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, model.question, feedback]);

  const listen = async () => {
    stopSpeaking();
    setConfirm(null);
    setLevels([]);
    const rec = new AnswerRecorder();
    recorder.current = rec;
    try {
      setUi("listening");
      const r = await rec.start({ onLevel: (l) => setLevels((xs) => [...xs.slice(-40), l]) });
      recorder.current = null;
      setUi("checking");
      if (!r.heardSpeech) {
        await submit({ input_method: "voice", value: null, confirmed: false });
        return;
      }
      const t = await actions.transcribe!(r.blob);
      if (t.usable && t.needs_confirmation) {
        setConfirm(t);
        setUi("confirm");
      } else if (t.usable) {
        await submit({ input_method: "voice", value: t.value, confidence: t.confidence, confirmed: false });
      } else {
        await submit({ input_method: "voice", value: null, text: null, confirmed: false });
      }
    } catch (e) {
      recorder.current = null;
      if (e instanceof MicUnavailableError) toast.error(`${e.message} ${t("Enter the answer with the number pad.")}`);
      else if (e instanceof ApiError && e.code === "stt_unavailable") {
        toast.error(t("Speech recognition isn’t available right now. Use the number pad."));
        setCanListen(false);
      } else if (e instanceof ApiError && e.isNetwork) setNetLost(() => listen);
      else toast.error(errorMessage(e));
      setPadOpen(true);
      setUi("waiting");
    }
  };

  const stopListening = () => recorder.current?.stop();

  const pause = () => guard(async () => {
    stopSpeaking();
    recorder.current?.cancel();
    await actions.pause();
    setUi("paused");
  });
  const resume = () => guard(async () => {
    await actions.resume();
    setUi("waiting");
  });
  const finish = async () => {
    setEnding(true);
    stopSpeaking();
    recorder.current?.cancel();
    try {
      const next = await actions.end();
      setUi("complete");
      if (!textOnly) {
        // Tell the children the practice is over, then hand over to the teacher's summary.
        const h = speak([{ ref: "p:complete", text: PHRASES.complete }]);
        await Promise.race([h.done, new Promise((r) => setTimeout(r, 7000))]);
      }
      nav(next, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) setNetLost(() => finish);
      else toast.error(errorMessage(e));
    } finally {
      setEnding(false);
      setEndOpen(false);
    }
  };

  const busy = ["speaking", "listening", "checking", "preparing", "hint"].includes(ui);
  const active = ui !== "intro" && ui !== "paused" && ui !== "preparing";
  const step = stepIndex(ui, !!feedback);
  const q = shown;
  const speakerState: SpeakerState = ui === "speaking" || ui === "hint" ? "speaking" : ui === "listening" ? "listening" : "idle";

  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_500px_at_30%_-10%,var(--color-sky-50),transparent),var(--color-chalk)]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line/70 bg-chalk/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-3 sm:px-5 h-16">
          <Button variant="ghost" size="sm" onClick={() => nav(model.kind === "online" ? "/app" : "/app/lessons")} aria-label={t("Back to dashboard. The session stays open.")}>
            <ArrowLeft /> <span className="hidden sm:inline">{t("Back to Dashboard")}</span>
          </Button>
          <div className="min-w-0 flex-1 sm:text-center">
            <p className="truncate text-[17px] font-extrabold sm:text-[19px]">
              <span className="hidden sm:inline">{t("Live Session")} · </span>{model.groupName}<span className="font-normal text-ink-muted" lang="hi">, {model.skillNameHi}</span>
            </p>
            <p className="hidden truncate text-[12px] text-ink-muted sm:block">
              {t(model.kind === "offline" ? "Offline session, saved on this device" : "Live session")}
              {model.lessonStatus === "draft" && t(", lesson not yet teacher-reviewed")}
            </p>
          </div>
          {/* timer with a ring that fills toward the planned length */}
          <div className={cn("flex items-center gap-2 rounded-full border pl-1.5 pr-3 h-10 tabular font-bold shadow-[var(--shadow-card)]",
            timeUp ? "border-saffron-500 bg-saffron-100 text-[#7a4508]" : "border-line bg-card")} aria-label={t("Elapsed {time} of {n} minutes", { time: fmtClock(elapsed), n: model.plannedMinutes })}>
            <svg viewBox="0 0 36 36" className="size-7 -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-line)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={timeUp ? "var(--color-saffron-500)" : "var(--color-teal-600)"} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${Math.min(1, elapsed / (model.plannedMinutes * 60)) * 94.2} 94.2`} className="transition-[stroke-dasharray] duration-1000" />
            </svg>
            {fmtClock(elapsed)}<span className="hidden font-normal text-ink-muted sm:inline">/{model.plannedMinutes}:00</span>
          </div>
          {ui === "paused" ? (
            <Button variant="secondary" size="sm" onClick={resume}><Play /> <span className="hidden sm:inline">{t("Resume")}</span></Button>
          ) : active && (
            <Button variant="secondary" size="sm" onClick={pause} aria-label={t("Pause session")}><Pause /> <span className="hidden sm:inline">{t("Pause")}</span></Button>
          )}
          <Button variant="danger" size="sm" onClick={() => setEndOpen(true)}><span className="sm:hidden">{t("End")}</span><span className="hidden sm:inline">{t("End session")}</span></Button>
        </div>
        {/* Steps: a real sequence the group goes through for each question */}
        <ol className="relative mx-auto hidden max-w-[720px] grid-cols-4 px-5 pb-3 pt-1 sm:grid" aria-label={t("Question steps")}>
          <span aria-hidden className="absolute left-[calc(12.5%+10px)] right-[calc(12.5%+10px)] top-[17px] h-[3px] rounded-full bg-line" />
          <motion.span aria-hidden className="absolute left-[calc(12.5%+10px)] top-[17px] h-[3px] rounded-full bg-[linear-gradient(90deg,var(--color-teal-600),var(--color-sky-600))]"
            animate={{ width: `calc(${(step / (STEPS.length - 1)) * 75}% - ${(step / (STEPS.length - 1)) * 20}px)` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          {STEPS.map((s, i) => (
            <li key={s.en} className="relative flex flex-col items-center gap-1 text-[12px]" aria-current={i === step ? "step" : undefined}>
              <span className={cn("relative grid size-7 place-items-center rounded-full border-2 text-[12px] font-bold transition-colors",
                i < step ? "border-teal-600 bg-teal-600 text-white" : i === step ? "border-slate-800 bg-slate-800 text-white" : "border-line-strong bg-card text-ink-muted")}>
                {i === step && <span aria-hidden className="absolute inset-0 rounded-full bg-slate-800/30 animate-[bt-ring_1.8s_ease-out_infinite]" />}
                {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("leading-tight", i === step ? "font-bold text-ink" : "text-ink-muted")}>{lang === "hi" ? s.hi : <>{s.en} <span lang="hi" className="hidden lg:inline">· {s.hi}</span></>}</span>
            </li>
          ))}
        </ol>
      </header>

      {netLost && (
        <div role="alert" className="mx-auto mt-3 flex max-w-[1240px] flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-warning-100 px-4 py-3 text-sm text-warning-700 sm:mx-5">
          <WifiOff className="size-5" aria-hidden />
          <span className="flex-1 min-w-48">{t(onNetworkLoss ? "The connection dropped. Nothing was lost: retry when the network is back, or continue this lesson offline on this device." : "The connection dropped. Nothing was lost: retry when the network is back.")}</span>
          <Button size="sm" variant="secondary" onClick={() => { const fn = netLost; setNetLost(null); void fn(); }}>{t("Retry")}</Button>
          {onNetworkLoss && <Button size="sm" onClick={onNetworkLoss}>{t("Continue offline")}</Button>}
        </div>
      )}

      {timeUp && ui !== "paused" && (
        <div className="mx-auto mt-3 flex max-w-[1240px] flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[#f3d3a9] bg-saffron-100 px-4 py-3 text-sm text-[#7a4508] sm:mx-5">
          <span className="flex-1" lang="hi"><strong>{model.plannedMinutes} मिनट पूरे हुए।</strong> {t("Finish this question, then end the session to see the summary.")}</span>
          <Button size="sm" onClick={() => setEndOpen(true)}>{t("End and see summary")}</Button>
        </div>
      )}

      <main className="mx-auto grid max-w-[1240px] items-start gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        {/* The slate */}
        <section aria-label="Current question" className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          {/* the classroom stage: speech bubble over the desk */}
          <div className="relative overflow-hidden rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,#f7ecd9_0%,#f1dfc2_55%,#e6c79d_100%)] shadow-[var(--shadow-lift)]">
            <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 size-64 rounded-full bg-white/50 blur-3xl" />
            <div className="relative p-4 sm:p-6">
              <div className="relative rounded-[20px] bg-white/95 p-4 shadow-[0_14px_30px_-16px_rgb(22_37_74/0.45)] sm:p-5">
                {/* bubble tail, pointing down toward BoltiToli */}
                <span aria-hidden className={cn("absolute -bottom-2 size-5 rotate-45 rounded-[4px] bg-white/95", ui === "intro" ? "left-[calc(50%-10px)]" : "right-20")} />
                {ui === "intro" ? (
                  <div>
                    <p className="font-chalk text-[26px] sm:text-[32px] leading-snug text-slate-800" lang="hi">{model.introHi}</p>
                    <p className="mt-3 text-ink-muted text-sm">{t("Connect the Bluetooth speaker, gather the group, then start. Nothing plays until you tap.")}</p>
                  </div>
                ) : ui === "paused" ? (
                  <p className="font-chalk text-[30px] text-slate-800" lang="hi">थोड़ा रुकते हैं…</p>
                ) : q ? (
                  <div className="flex items-start gap-3">
                    <button onClick={() => void say(promptItem(q))} disabled={busy} aria-label={t("Repeat the question aloud")}
                      className={cn("relative mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-600 hover:bg-sky-50 disabled:opacity-60",
                        ui === "speaking" && "text-saffron-600 bg-saffron-100")}>
                      {ui === "speaking" && <span aria-hidden className="absolute inset-0 rounded-full bg-saffron-500/30 animate-[bt-ring_1.4s_ease-out_infinite]" />}
                      <Volume2 className="relative size-5" />
                    </button>
                    <AnimatePresence mode="wait">
                      <motion.p key={q.id} lang="hi" className="text-[22px] sm:text-[28px] font-bold leading-snug text-slate-800"
                        initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduce ? undefined : { opacity: 0, y: -6 }}
                        transition={{ duration: 0.35 }}>
                        {q.prompt_hi}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                ) : <p className="text-ink-muted">{t("Loading question…")}</p>}
              </div>

              <AnimatePresence>
                {feedback && (
                  <motion.div key={`${feedback.outcome}-${feedback.message_hi}`} role="status" lang="hi"
                    initial={reduce ? false : { opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 24 }}
                    className={cn("mt-4 flex items-start gap-3 rounded-[16px] px-4 py-3 text-[17px] shadow-[var(--shadow-card)]",
                      feedback.outcome === "correct" ? "bg-success-100 text-success-700"
                        : feedback.outcome === "unclear" || feedback.outcome === "skipped" ? "bg-white/90 text-ink" : "bg-saffron-100 text-[#7a4508]")}>
                    <span aria-hidden className={cn("tile-3d mt-0.5 size-9 shrink-0", feedback.outcome === "correct" ? "bg-white text-success-700" : "bg-white text-saffron-600")}>
                      {feedback.outcome === "correct" ? <Check className="size-5" /> : <Lightbulb className="size-5" />}
                    </span>
                    <div>
                      <p className="font-bold">{feedback.message_hi}</p>
                      {feedback.hint_hi && <p className="mt-1">संकेत: {feedback.hint_hi}</p>}
                      {feedback.explanation_hi && <p className="mt-1">{feedback.explanation_hi}</p>}
                      {feedback.misconception_hi && <p className="mt-1 text-[13px] opacity-80">{t("Noted for the teacher:")} {feedback.misconception_hi}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* the desk with countable objects (and BoltiToli beside them) */}
            {q && ui !== "intro" && ui !== "paused" && (
              <div className="relative h-56 px-3 pb-2 sm:h-72">
                <QuestionVisual question={q} phase={reveal ? "reveal" : "question"} speaker={speakerState} />
              </div>
            )}
            {ui === "intro" && (
              <div className="relative flex h-40 items-end justify-center pb-4 sm:h-52" aria-hidden>
                <SpeakerBadge2D state="idle" className="scale-125" />
              </div>
            )}

            {/* celebration on a correct answer */}
            <AnimatePresence>
              {feedback?.outcome === "correct" && !reduce && <Celebration key={feedback.message_hi} />}
            </AnimatePresence>
          </div>
        </section>

        {/* Status + answering */}
        <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="rounded-[20px] border border-line bg-card p-5 shadow-[var(--shadow-card)]">
            <StatusPanel state={ui === "intro" ? "intro" : ui} levels={levels} voiceNote={ui === "speaking" ? (VOICE_NOTE[voice] ? t(VOICE_NOTE[voice]!) : null) : textOnly ? t("Text-only mode: read the question aloud") : null} />
            <div className="mt-5 space-y-2">
              {ui === "intro" ? (
                <Button size="xl" className="w-full" onClick={begin}><Play /> <span lang="hi">शुरू करें</span></Button>
              ) : ui === "paused" ? (
                <Button size="xl" className="w-full" onClick={resume}><Play /> <span lang="hi">फिर से शुरू करें</span></Button>
              ) : ui === "listening" ? (
                <Button size="xl" variant="slate" className="w-full" onClick={stopListening}>सुनना बंद करें</Button>
              ) : ui === "confirm" && confirm ? (
                <div className="space-y-2 text-center">
                  <p className="text-ink-muted text-sm">{t("Heard")} “{confirm.text}”</p>
                  <p className="text-[44px] font-extrabold leading-none tabular">{confirm.value}</p>
                  <Button size="lg" className="w-full" onClick={() => submit({ input_method: "voice", value: confirm.value, confidence: confirm.confidence, confirmed: true })}>
                    <Check /> <span lang="hi">हाँ, {confirm.value} भेजें</span>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={listen}><Mic /> फिर सुनें</Button>
                    <Button variant="secondary" onClick={() => { setConfirm(null); setPadOpen(true); setUi("waiting"); }}><Keyboard /> लिखें</Button>
                  </div>
                </div>
              ) : canListen ? (
                <Button size="xl" className="w-full" disabled={busy || !q} onClick={listen}><Mic /> <span lang="hi">जवाब सुनें</span></Button>
              ) : (
                <p className="text-center text-sm text-ink-muted">
                  {t(model.kind === "offline" ? "Listening needs internet. Enter the group’s answer below." : "Speech recognition is off. Enter the group’s answer below.")}
                </p>
              )}
              {active && ui !== "confirm" && canListen && (
                <Button variant="ghost" className="w-full" onClick={() => setPadOpen((o) => !o)} aria-expanded={padOpen}>
                  <Keyboard /> <span lang="hi">{padOpen ? "नंबर पैड छुपाएँ" : "मैं उत्तर लिख दूँ"}</span>
                </Button>
              )}
            </div>
          </div>
          {active && (padOpen || !canListen) && ui !== "confirm" && (
            <div className="rounded-[20px] border border-line bg-card p-4 shadow-[var(--shadow-card)]">
              <NumberPad disabled={busy || !q} by={by} onByChange={setBy} onSubmit={(v) => submit({ input_method: by, value: v })} />
            </div>
          )}
          <p className="px-1 text-[12px] text-ink-faint">
            {t("BoltiToli checks the group’s answer, not individual children. Voice recordings are not stored.")}
          </p>
        </aside>

        <section aria-label={t("Teacher options")} className="min-w-0 lg:col-start-1 lg:row-start-2">
          {/* Teacher options */}
          {active && q && (
            <div className="rounded-[20px] border border-line bg-card shadow-[var(--shadow-card)]">
              <button className="flex w-full items-center justify-between px-4 h-12 font-semibold" onClick={() => setTeacherOpen((o) => !o)} aria-expanded={teacherOpen}>
                <span lang="hi" className="inline-flex items-center gap-2"><UserRound className="size-4 text-teal-700" aria-hidden /> शिक्षक विकल्प {lang === "en" && <span className="font-normal text-ink-muted">Teacher options</span>}</span>
                {teacherOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
              </button>
              <AnimatePresence initial={false}>
                {teacherOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-4 [&_button]:rounded-full [&_button]:shadow-[var(--shadow-card)]">
                      <Button variant="secondary" disabled={busy} onClick={() => void say(promptItem(q))}><RotateCcw className="text-sky-600" /> दोबारा पूछें</Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void say([{ ref: `q:${q.id}:hint`, text: q.hint_hi }])}><Lightbulb className="text-saffron-600" /> संकेत दें</Button>
                      <Button variant="secondary" disabled={busy || model.difficulty <= 1} onClick={() => guard(() => actions.adjust("easier"))}><ChevronsDown className="text-teal-700" /> आसान सवाल</Button>
                      <Button variant="secondary" disabled={busy || model.difficulty >= 3} onClick={() => guard(() => actions.adjust("harder"))}><ChevronsUp className="text-danger-700" /> मुश्किल सवाल</Button>
                      <Button variant="secondary" disabled={busy} onClick={() => submit({ input_method: "override", override_outcome: "correct" })}><Check className="text-success-700" /> सही माना</Button>
                      <Button variant="secondary" disabled={busy} onClick={() => submit({ input_method: "override", override_outcome: "incorrect" })}><X className="text-danger-700" /> गलत माना</Button>
                      <Button variant="secondary" disabled={busy} className="col-span-2" onClick={() => submit({ input_method: "override", override_outcome: "skipped" })}><SkipForward /> यह सवाल छोड़ें</Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      <ConfirmDialog open={endOpen} onOpenChange={setEndOpen} title={t("End this session?")}
        body={t(model.kind === "online" ? "BoltiToli will stop, and a summary for you will be prepared." : "BoltiToli will stop, and the session will be saved on this device and synced when you are online.")}
        confirmLabel={t("End session")} onConfirm={finish} loading={ending} />
    </div>
  );
}
