import type { Feedback, InputMethod, Question, SessionStatus, Transcription } from "@/types/api";
import { PHRASES } from "../engine/engine";

/** What the session screen needs, whether the session runs online or offline. */
export interface SessionModel {
  kind: "online" | "offline";
  id: string;
  status: SessionStatus;
  groupName: string;
  skillNameHi: string;
  skillNameEn: string;
  lessonId: string;
  lessonStatus: string;
  introRef: string;
  introHi: string;
  plannedMinutes: number;
  activeSeconds: number;
  runningSince: number | null;
  question: Question | null;
  attempt: number;
  difficulty: number;
  questionsCompleted: number;
  canListen: boolean;
}

export interface AnswerInput {
  input_method: InputMethod;
  value?: number | null;
  text?: string | null;
  confidence?: number | null;
  confirmed?: boolean;
  override_outcome?: "correct" | "incorrect" | "skipped" | null;
}

export interface SessionActions {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  end: () => Promise<string>; // returns where to go next
  answer: (a: AnswerInput) => Promise<Feedback>;
  adjust: (direction: "easier" | "harder") => Promise<void>;
  transcribe?: (wav: Blob) => Promise<Transcription>;
}

/** Split a feedback message into the fixed phrases it is made of, to play their clips. */
export function phraseItems(message: string): { ref?: string; text: string }[] {
  const entries = Object.entries(PHRASES).sort((a, b) => b[1].length - a[1].length);
  const out: { ref?: string; text: string }[] = [];
  let rest = message.trim();
  while (rest) {
    const hit = entries.find(([, t]) => rest.startsWith(t));
    if (!hit) return [{ text: message }];
    out.push({ ref: `p:${hit[0]}`, text: hit[1] });
    rest = rest.slice(hit[1].length).trim();
  }
  return out;
}
