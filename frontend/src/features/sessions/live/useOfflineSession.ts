import { useCallback, useEffect, useMemo, useState } from "react";
import { getPack, getPending, type PendingSession, putPending } from "@/features/offline/db";
import { newId } from "@/lib/api";
import type { Feedback, LessonPack } from "@/types/api";
import {
  adjust as engineAdjust,
  applyOutcome,
  detectMisconception,
  type EngineQuestion,
  type EngineState,
  evaluate,
  MISCONCEPTIONS_HI,
  messageKeys,
  PHRASES,
  start as engineStart,
} from "../engine/engine";
import { parseAnswer } from "../engine/hindiNumbers";
import type { AnswerInput, SessionActions, SessionModel } from "./types";

/** Create a new offline session record for a downloaded lesson. */
export async function createOfflineSession(opts: {
  pack: LessonPack;
  schoolId: string;
  groupId: string;
  groupName: string;
  plannedMinutes: number;
  seed?: { questionId: string; difficulty: number; attempt: number };
}): Promise<string> {
  const qs = opts.pack.questions as EngineQuestion[];
  const st = engineStart(qs);
  if (opts.seed && qs.some((q) => q.id === opts.seed!.questionId)) {
    // Continuing a session whose network dropped: resume at the same question and level.
    st.current_question_id = opts.seed.questionId;
    st.asked = [opts.seed.questionId];
    st.difficulty = opts.seed.difficulty;
    st.highest_difficulty = opts.seed.difficulty;
    st.attempt = opts.seed.attempt;
  }
  const id = newId();
  const now = new Date().toISOString();
  await putPending({
    client_session_id: id, school_id: opts.schoolId, group_id: opts.groupId, group_name: opts.groupName,
    lesson_id: opts.pack.lesson_id, lesson_version_id: opts.pack.version_id, skill_name_hi: opts.pack.skill.name_hi,
    planned_minutes: opts.plannedMinutes, started_at: now, ended_at: null, active_seconds: 0,
    last_resumed_at: opts.seed ? now : null, paused: false, engine_state: st, responses: [],
    status: "in_progress", attempts: 0, last_error: null, server_session_id: null, updated_at: now,
  });
  return id;
}

function elapsed(p: PendingSession) {
  return p.active_seconds + (p.last_resumed_at && !p.paused ? (Date.now() - new Date(p.last_resumed_at).getTime()) / 1000 : 0);
}

export function useOfflineSession(id: string) {
  const [rec, setRec] = useState<PendingSession | null>(null);
  const [pack, setPack] = useState<LessonPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getPending(id);
      if (!p) return alive && setError("This session is no longer on this device. If it has synced, you will find it under Sessions.");
      const lp = await getPack(p.lesson_id);
      if (!lp || lp.version_id !== p.lesson_version_id) return alive && setError("The lesson for this session is no longer on this device.");
      if (alive) {
        setRec(p);
        setPack(lp);
      }
    })().catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  const save = useCallback(async (p: PendingSession) => {
    await putPending(p);
    setRec({ ...p });
  }, []);

  const model: SessionModel | null = useMemo(() => {
    if (!rec || !pack) return null;
    const st = rec.engine_state as EngineState;
    const status = rec.status !== "in_progress" ? "completed" : !rec.last_resumed_at && rec.active_seconds === 0 ? "prepared" : rec.paused ? "paused" : "active";
    return {
      kind: "offline", id: rec.client_session_id, status, groupName: rec.group_name, skillNameHi: pack.skill.name_hi,
      skillNameEn: pack.skill.name_en, lessonId: pack.lesson_id, lessonStatus: pack.status,
      introRef: `v:${pack.version_id}:intro`, introHi: pack.intro_hi, plannedMinutes: rec.planned_minutes,
      activeSeconds: rec.active_seconds,
      runningSince: status === "active" && rec.last_resumed_at ? new Date(rec.last_resumed_at).getTime() : null,
      question: pack.questions.find((q) => q.id === st.current_question_id) ?? null, attempt: st.attempt,
      difficulty: st.difficulty, questionsCompleted: st.questions_completed, canListen: false,
    };
  }, [rec, pack]);

  const actions: SessionActions = useMemo(() => {
    const need = () => {
      if (!rec || !pack) throw new Error("Session not loaded");
      return { p: { ...rec, engine_state: structuredClone(rec.engine_state) as EngineState }, pack };
    };
    return {
      start: async () => {
        const { p } = need();
        await save({ ...p, last_resumed_at: new Date().toISOString(), paused: false });
      },
      pause: async () => {
        const { p } = need();
        await save({ ...p, active_seconds: elapsed(p), last_resumed_at: null, paused: true });
      },
      resume: async () => {
        const { p } = need();
        await save({ ...p, last_resumed_at: new Date().toISOString(), paused: false });
      },
      end: async () => {
        const { p } = need();
        await save({ ...p, active_seconds: elapsed(p), last_resumed_at: null, ended_at: new Date().toISOString(),
          status: p.responses.length ? "pending_sync" : "rejected", last_error: p.responses.length ? null : "no_answers" });
        return `/session/offline/${p.client_session_id}?done=1`;
      },
      adjust: async (direction) => {
        const { p, pack: lp } = need();
        engineAdjust(p.engine_state as EngineState, lp.questions as EngineQuestion[], direction === "easier" ? -1 : 1);
        await save(p);
      },
      answer: async (a: AnswerInput): Promise<Feedback> => {
        const { p, pack: lp } = need();
        const st = p.engine_state as EngineState;
        const q = lp.questions.find((x) => x.id === st.current_question_id);
        if (!q) throw new Error("No current question");
        let value = a.value ?? null;
        if (value === null && a.text) value = parseAnswer(a.text).value;
        let outcome: Feedback["outcome"];
        let mis: string | null = null;
        if (a.input_method === "override") {
          outcome = a.override_outcome ?? "skipped";
          if (outcome === "incorrect" && value !== null) mis = detectMisconception(q as EngineQuestion, value);
        } else {
          [outcome, mis] = evaluate(q as EngineQuestion, value);
        }
        const attemptBefore = st.attempt;
        const seq = st.asked.length;
        const d = applyOutcome(st, lp.questions as EngineQuestion[], outcome, mis);
        p.responses.push({
          client_response_id: newId(), question_id: q.id, sequence_no: seq, attempt_no: attemptBefore,
          input_method: a.input_method === "voice" ? "manual" : a.input_method, value, confirmed: true,
          override_outcome: a.input_method === "override" ? a.override_outcome ?? null : null,
          answered_at: new Date().toISOString(),
        });
        await save(p);
        return {
          outcome, action: d.action, misconception: mis, misconception_hi: mis ? MISCONCEPTIONS_HI[mis] : null,
          message_hi: messageKeys(d, seq, attemptBefore).map((k) => PHRASES[k]).join(" "),
          hint_hi: d.show_hint ? q.hint_hi : null, explanation_hi: d.show_explanation ? q.explanation_hi : null,
          suggest_manual: d.suggest_manual, mastery_signal: d.mastery_signal, feedback_source: "rules",
        };
      },
    };
  }, [rec, pack, save]);

  return { model, actions, record: rec, pack, error };
}
