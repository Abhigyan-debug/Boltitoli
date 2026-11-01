/**
 * Offline mirror of backend/app/lesson_engine/engine.py.
 * Used only when the server cannot be reached; the server re-grades every
 * answer on sync. Tested against shared/engine-fixtures.json.
 */

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 3;
const PROMOTE_AFTER_STREAK = 2;
const MASTERY_STREAK = 5;
const UNCLEAR_BEFORE_MANUAL = 2;

export interface EngineQuestion {
  id: string;
  difficulty: number;
  kind: string;
  operands: Record<string, number | string>;
  expected_answer: number;
}

export type Outcome = "correct" | "incorrect" | "unclear" | "skipped";

export const MISCONCEPTIONS_HI: Record<string, string> = {
  off_by_one: "गिनती में एक कम या एक ज़्यादा",
  counted_one_group: "सिर्फ़ एक समूह गिना",
  added_instead_of_subtracted: "घटाने की जगह जोड़ दिया",
  subtracted_instead_of_added: "जोड़ने की जगह घटा दिया",
  chose_smaller: "बड़ी की जगह छोटी संख्या चुनी",
  tens_ones_swapped: "दहाई और इकाई में उलझन",
  reversed_digits: "अंक उल्टे क्रम में",
  before_after_swapped: "पहले और बाद में उलझन",
};

function reverseDigits(n: number): number | null {
  const s = String(Math.abs(n));
  const r = s.split("").reverse().join("");
  return s.length > 1 && r !== s ? parseInt(r, 10) : null;
}

export function detectMisconception(q: EngineQuestion, value: number): string | null {
  const exp = q.expected_answer;
  if (value === exp) return null;
  const a = q.operands.a as number | undefined;
  const b = q.operands.b as number | undefined;
  const hasAB = a !== undefined && b !== undefined;
  if ((q.kind === "add" || q.kind === "word_add") && hasAB) {
    if (value === Math.abs(a! - b!)) return "subtracted_instead_of_added";
    if (value === a || value === b) return "counted_one_group";
  }
  if ((q.kind === "sub" || q.kind === "word_sub") && hasAB && value === a! + b!) return "added_instead_of_subtracted";
  if (q.kind === "compare" && hasAB && value === Math.min(a!, b!)) return "chose_smaller";
  if (q.kind === "place_value" && typeof q.operands.n === "number") {
    const n = q.operands.n;
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    const ask = q.operands.ask;
    if ((ask === "tens" && value === ones) || (ask === "ones" && value === tens)) return "tens_ones_swapped";
  }
  if (q.kind === "before_after" && typeof q.operands.n === "number") {
    const n = q.operands.n;
    const ask = q.operands.ask;
    if ((ask === "after" && value === n - 1) || (ask === "before" && value === n + 1)) return "before_after_swapped";
  }
  if (reverseDigits(exp) === value) return "reversed_digits";
  if (Math.abs(value - exp) === 1) return "off_by_one";
  return null;
}

export function evaluate(q: EngineQuestion, value: number | null): [Outcome, string | null] {
  if (value === null) return ["unclear", null];
  if (value === q.expected_answer) return ["correct", null];
  return ["incorrect", detectMisconception(q, value)];
}

export interface EngineState {
  current_question_id: string | null;
  difficulty: number;
  attempt: number;
  streak: number;
  first_try_streak: number;
  unclear_count: number;
  asked: string[];
  highest_difficulty: number;
  questions_completed: number;
  mastery_signal: boolean;
}

export interface Decision {
  action: "next" | "harder" | "easier" | "retry_with_hint" | "ask_again" | "exhausted";
  outcome: Outcome;
  misconception: string | null;
  next_question_id: string | null;
  show_hint: boolean;
  show_explanation: boolean;
  suggest_manual: boolean;
  mastery_signal: boolean;
}

export function pickQuestion(
  questions: EngineQuestion[],
  difficulty: number,
  asked: string[],
  exclude: string | null = null,
): string | null {
  if (questions.length === 0) return null;
  const askedSet = new Set(asked);
  const lastSeen = new Map<string, number>();
  asked.forEach((id, i) => lastSeen.set(id, i));
  const seen = (id: string) => lastSeen.get(id) ?? -1;
  const atTarget = questions.filter((q) => q.difficulty === difficulty && q.id !== exclude);

  for (const q of atTarget) if (!askedSet.has(q.id)) return q.id;
  if (atTarget.length) return atTarget.reduce((m, q) => (seen(q.id) < seen(m.id) ? q : m)).id;
  for (const delta of [-1, 1, -2, 2])
    for (const q of questions)
      if (q.difficulty === difficulty + delta && !askedSet.has(q.id) && q.id !== exclude) return q.id;
  const pool = questions.filter((q) => q.id !== exclude);
  const list = pool.length ? pool : questions;
  return list.reduce((m, q) => {
    const a = [seen(q.id), Math.abs(q.difficulty - difficulty)];
    const b = [seen(m.id), Math.abs(m.difficulty - difficulty)];
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? q : m;
  }).id;
}

export function start(questions: EngineQuestion[], startDifficulty = MIN_DIFFICULTY): EngineState {
  const st: EngineState = {
    current_question_id: null,
    difficulty: startDifficulty,
    attempt: 1,
    streak: 0,
    first_try_streak: 0,
    unclear_count: 0,
    asked: [],
    highest_difficulty: startDifficulty,
    questions_completed: 0,
    mastery_signal: false,
  };
  st.current_question_id = pickQuestion(questions, st.difficulty, st.asked);
  if (st.current_question_id) st.asked.push(st.current_question_id);
  return st;
}

function advance(st: EngineState, questions: EngineQuestion[]): string | null {
  const qid = pickQuestion(questions, st.difficulty, st.asked, st.current_question_id);
  st.current_question_id = qid;
  st.attempt = 1;
  st.unclear_count = 0;
  if (qid) st.asked.push(qid);
  return qid;
}

const decision = (d: Partial<Decision> & Pick<Decision, "action" | "outcome" | "next_question_id">): Decision => ({
  misconception: null,
  show_hint: false,
  show_explanation: false,
  suggest_manual: false,
  mastery_signal: false,
  ...d,
});

/** Mutates `st` and returns what happens next. */
export function applyOutcome(
  st: EngineState,
  questions: EngineQuestion[],
  outcome: Outcome,
  misconception: string | null = null,
): Decision {
  if (outcome === "unclear") {
    st.unclear_count += 1;
    return decision({
      action: "ask_again",
      outcome,
      next_question_id: st.current_question_id,
      suggest_manual: st.unclear_count >= UNCLEAR_BEFORE_MANUAL,
    });
  }
  if (outcome === "skipped") {
    st.streak = 0;
    return decision({ action: "next", outcome, next_question_id: advance(st, questions) });
  }
  if (outcome === "correct") {
    const firstTry = st.attempt === 1;
    st.questions_completed += 1;
    let action: Decision["action"] = "next";
    if (firstTry) {
      st.streak += 1;
      st.first_try_streak += 1;
      if (st.streak >= PROMOTE_AFTER_STREAK && st.difficulty < MAX_DIFFICULTY) {
        st.difficulty += 1;
        st.highest_difficulty = Math.max(st.highest_difficulty, st.difficulty);
        st.streak = 0;
        action = "harder";
      }
    } else {
      st.streak = 0;
      st.first_try_streak = 0;
    }
    if (st.difficulty === MAX_DIFFICULTY && st.first_try_streak >= MASTERY_STREAK) st.mastery_signal = true;
    const nxt = advance(st, questions);
    return decision({ action, outcome, next_question_id: nxt, mastery_signal: st.mastery_signal });
  }
  // incorrect
  st.streak = 0;
  st.first_try_streak = 0;
  if (st.attempt === 1) {
    st.attempt = 2;
    st.unclear_count = 0;
    return decision({
      action: "retry_with_hint",
      outcome,
      misconception,
      next_question_id: st.current_question_id,
      show_hint: true,
    });
  }
  st.questions_completed += 1;
  let action: Decision["action"] = "next";
  if (st.difficulty > MIN_DIFFICULTY) {
    st.difficulty -= 1;
    action = "easier";
  }
  const nxt = advance(st, questions);
  return decision({ action, outcome, misconception, next_question_id: nxt, show_explanation: true });
}

/** Teacher asks for an easier (-1) or harder (+1) question. Not graded. */
export function adjust(st: EngineState, questions: EngineQuestion[], delta: -1 | 1): Decision {
  st.difficulty = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, st.difficulty + delta));
  st.highest_difficulty = Math.max(st.highest_difficulty, st.difficulty);
  st.streak = 0;
  const nxt = advance(st, questions);
  return decision({ action: delta < 0 ? "easier" : "harder", outcome: "skipped", next_question_id: nxt });
}

// Child-facing phrases, identical to backend/app/services/adaptive_service.py PHRASES.
export const PHRASES: Record<string, string> = {
  praise_0: "बहुत बढ़िया! सही जवाब।",
  praise_1: "शाबाश! बिल्कुल सही।",
  praise_2: "वाह! सही उत्तर।",
  praise_3: "सही! तुम सबने मिलकर सोचा।",
  after_hint: "सही! संकेत के बाद तुमने सही जवाब दिया।",
  harder: "अब थोड़ा मुश्किल सवाल।",
  try_again: "करीब हो! एक बार फिर सोचो।",
  lets_learn: "कोई बात नहीं। चलो साथ में समझते हैं।",
  easier: "अब एक आसान सवाल।",
  unclear: "मुझे जवाब ठीक से सुनाई नहीं दिया। एक बार फिर से एक साथ बोलो।",
  unclear_manual: "जवाब साफ़ सुनाई नहीं दिया। शिक्षक या टोली-लीडर जवाब लिख सकते हैं।",
  skipped: "ठीक है, अगला सवाल।",
  complete: "आज का अभ्यास पूरा हुआ। तुम सबने अच्छा ध्यान दिया। अब अपनी शिक्षिका को बताओ।",
};

/** Phrase keys making up a feedback message (also used to look up offline audio clips). */
export function messageKeys(d: Decision, sequenceNo: number, attemptBefore: number): string[] {
  if (d.outcome === "correct") {
    const base = attemptBefore > 1 ? "after_hint" : `praise_${sequenceNo % 4}`;
    return d.action === "harder" ? [base, "harder"] : [base];
  }
  if (d.outcome === "unclear") return [d.suggest_manual ? "unclear_manual" : "unclear"];
  if (d.outcome === "skipped") return ["skipped"];
  if (d.action === "retry_with_hint") return ["try_again"];
  return d.action === "easier" ? ["lets_learn", "easier"] : ["lets_learn"];
}
