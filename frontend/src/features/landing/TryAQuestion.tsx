import { RotateCcw, Volume2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CountingObjects2D } from "@/components/illustrations/CountingObjects2D";
import { Button } from "@/components/ui/button";
import { applyOutcome, type EngineQuestion, evaluate, messageKeys, PHRASES, start } from "@/features/sessions/engine/engine";
import { hindiDeviceVoice } from "@/features/voice/speaker";
import { useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import type { Question } from "@/types/api";

/**
 * A working sample of a BoltiToli session using the real lesson engine and
 * three questions from the "Addition within 10" lesson. Nothing is recorded.
 */
const SAMPLE: Question[] = [
  { id: "s1", position: 0, difficulty: 1, kind: "add", prompt_hi: "यहाँ 2 सेब हैं, और यहाँ 1 सेब है। कुल कितने सेब हुए?", prompt_en: "", operands: { a: 2, b: 1 }, expected_answer: 3,
    hint_hi: "2 याद रखो, फिर दूसरे समूह को आगे गिनो।", explanation_hi: "2 के आगे गिनो: तीन। 2 और 1 मिलकर 3 होते हैं।", visual: { type: "objects", object: "apple", groups: [2, 1], op: "+" } },
  { id: "s2", position: 1, difficulty: 1, kind: "add", prompt_hi: "यहाँ 2 गेंदें हैं, और यहाँ 3 गेंदें हैं। कुल कितनी गेंदें हुईं?", prompt_en: "", operands: { a: 2, b: 3 }, expected_answer: 5,
    hint_hi: "2 याद रखो, फिर दूसरे समूह को आगे गिनो।", explanation_hi: "2 के आगे गिनो: तीन, चार, पांच। 2 और 3 मिलकर 5 होते हैं।", visual: { type: "objects", object: "ball", groups: [2, 3], op: "+" } },
  { id: "s3", position: 2, difficulty: 2, kind: "add", prompt_hi: "यहाँ 4 आम हैं, और यहाँ 3 आम हैं। कुल कितने आम हुए?", prompt_en: "", operands: { a: 4, b: 3 }, expected_answer: 7,
    hint_hi: "4 याद रखो, फिर दूसरे समूह को आगे गिनो।", explanation_hi: "4 के आगे गिनो: पांच, छह, सात। 4 और 3 मिलकर 7 होते हैं।", visual: { type: "objects", object: "mango", groups: [4, 3], op: "+" } },
];

function sayWithDevice(text: string) {
  const v = hindiDeviceVoice();
  if (!v) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

export function TryAQuestion() {
  const qs = SAMPLE as unknown as EngineQuestion[];
  const t = useT();
  const st = useRef(start(qs));
  const [qid, setQid] = useState(st.current.current_question_id);
  const [msg, setMsg] = useState<{ tone: "good" | "try" | "learn"; text: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [done, setDone] = useState(0);
  const q = useMemo(() => SAMPLE.find((x) => x.id === qid)!, [qid]);
  const choices = useMemo(() => {
    const e = q.expected_answer;
    return [...new Set([e - 1, e, e + 1, (q.operands.a as number)])].filter((n) => n >= 0).sort((a, b) => a - b);
  }, [q]);

  const answer = (v: number) => {
    const attemptBefore = st.current.attempt;
    const seq = st.current.asked.length;
    const [outcome, mis] = evaluate(q as unknown as EngineQuestion, v);
    const d = applyOutcome(st.current, qs, outcome, mis);
    const text = messageKeys(d, seq, attemptBefore).map((k) => PHRASES[k]).join(" ");
    if (outcome === "correct") {
      setMsg({ tone: "good", text });
      setReveal(true);
      setDone((n) => n + 1);
      sayWithDevice(text);
      setTimeout(() => { setReveal(false); setMsg(null); setQid(d.next_question_id); }, 2200);
    } else if (d.action === "retry_with_hint") {
      setMsg({ tone: "try", text: `${text} ${q.hint_hi}` });
      sayWithDevice(`${text} ${q.hint_hi}`);
    } else {
      setMsg({ tone: "learn", text: `${text} ${q.explanation_hi}` });
      setReveal(true);
      sayWithDevice(`${text} ${q.explanation_hi}`);
      setTimeout(() => { setReveal(false); setMsg(null); setQid(d.next_question_id); }, 3200);
    }
  };

  const reset = () => {
    st.current = start(qs);
    setQid(st.current.current_question_id);
    setMsg(null);
    setReveal(false);
    setDone(0);
  };

  return (
    <div className="wood-frame rounded-[var(--radius-slate)] shadow-[var(--shadow-lift)]">
     <div className="overflow-hidden rounded-[10px]">
      <div className="slate-surface p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <button className="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-chalk/10 hover:bg-chalk/20"
            aria-label={t("Read the question aloud with this device’s Hindi voice")} onClick={() => sayWithDevice(q.prompt_hi)}>
            <Volume2 className="size-5" />
          </button>
          <p lang="hi" className="text-[22px] sm:text-[26px] font-semibold leading-snug">{q.prompt_hi}</p>
        </div>
        <div aria-live="polite" className="min-h-14">
          {msg && (
            <p lang="hi" className={cn("mt-4 rounded-[var(--radius-md)] px-4 py-2.5",
              msg.tone === "good" ? "bg-success-100 text-success-700" : "bg-saffron-100 text-[#7a4508]")}>{msg.text}</p>
          )}
        </div>
      </div>
      <div className="h-44 border-t-[6px] border-wood-500 bg-wood-100 px-4 py-3">
        {q.visual?.type === "objects" && <CountingObjects2D visual={q.visual} phase={reveal ? "reveal" : "question"} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 bg-card px-5 py-4">
        <span className="mr-2 text-sm text-ink-muted">{t("Answer as the group would:")}</span>
        {choices.map((c) => (
          <Button key={c} variant="secondary" className="min-w-14 text-lg tabular" disabled={reveal} onClick={() => answer(c)}>{c}</Button>
        ))}
        <span className="ml-auto text-[13px] text-ink-muted tabular">{t("{n} solved", { n: done })}</span>
        <Button variant="ghost" size="sm" onClick={reset} aria-label={t("Start the sample again")}><RotateCcw /></Button>
      </div>
     </div>
    </div>
  );
}
