import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { getPack, savePack } from "@/features/offline/db";
import { api, newId } from "@/lib/api";
import { qk, useSpeechStatus } from "@/services/queries";
import type { AnswerOut, LessonPack, SessionOut, Transcription } from "@/types/api";
import type { AnswerInput, SessionActions, SessionModel } from "./types";

export function useOnlineSession(id: string) {
  const qc = useQueryClient();
  const speech = useSpeechStatus();
  const q = useQuery({ queryKey: qk.session(id), queryFn: () => api<SessionOut>(`/sessions/${id}`), refetchOnWindowFocus: false });
  const fetchedAt = useRef(Date.now());
  const pendingKeys = useRef(new Map<string, string>());
  // Keep the lesson on the device during an online session so it can continue if the network drops.
  useQuery({
    queryKey: ["session-pack", q.data?.lesson_id],
    networkMode: "always",
    enabled: !!q.data?.lesson_id,
    queryFn: async () => {
      const existing = await getPack(q.data!.lesson_id);
      if (existing && existing.version_id === q.data!.lesson_version_id) return existing;
      const pack = await api<LessonPack>(`/lesson-packs/${q.data!.lesson_id}`);
      if (pack.version_id === q.data!.lesson_version_id) await savePack(pack, existing?.audio_clips ?? 0);
      return pack;
    },
    staleTime: Infinity,
  });

  const set = useCallback((s: SessionOut) => {
    fetchedAt.current = Date.now();
    qc.setQueryData(qk.session(id), s);
  }, [qc, id]);

  const model: SessionModel | null = useMemo(() => {
    const s = q.data;
    if (!s) return null;
    return {
      kind: "online", id: s.id, status: s.status, groupName: s.group_name, skillNameHi: s.skill.name_hi,
      skillNameEn: s.skill.name_en, lessonId: s.lesson_id, lessonStatus: s.lesson_status,
      introRef: `v:${s.lesson_version_id}:intro`, introHi: s.intro_hi, plannedMinutes: s.planned_minutes,
      activeSeconds: s.active_seconds, runningSince: s.status === "active" ? fetchedAt.current : null,
      question: s.current_question, attempt: s.current_attempt, difficulty: s.current_difficulty,
      questionsCompleted: s.questions_completed, canListen: !!speech.data?.stt_available && s.voice_mode !== "text_only",
    };
  }, [q.data, speech.data]);

  const actions: SessionActions = useMemo(() => ({
    start: async () => set(await api<SessionOut>(`/sessions/${id}/start`, { method: "POST" })),
    pause: async () => set(await api<SessionOut>(`/sessions/${id}/pause`, { method: "POST" })),
    resume: async () => set(await api<SessionOut>(`/sessions/${id}/resume`, { method: "POST" })),
    end: async () => {
      set(await api<SessionOut>(`/sessions/${id}/end`, { method: "POST" }));
      await qc.invalidateQueries({ queryKey: ["overview"] });
      await qc.invalidateQueries({ queryKey: ["groups"] });
      return `/app/sessions/${id}/summary`;
    },
    adjust: async (direction) => set(await api<SessionOut>(`/sessions/${id}/adjust`, { method: "POST", body: { direction } })),
    answer: async (a: AnswerInput) => {
      const current = qc.getQueryData<SessionOut>(qk.session(id));
      // One idempotency key per question attempt, reused if the request is retried after a network drop,
      // so a retry can never record the same answer twice.
      const slot = `${current?.current_question?.id}-${current?.current_attempt}-${current?.questions_completed}`;
      const key = pendingKeys.current.get(slot) ?? newId();
      pendingKeys.current.set(slot, key);
      const res = await api<AnswerOut>(`/sessions/${id}/answer`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: { question_id: current?.current_question?.id, ...a },
      });
      pendingKeys.current.delete(slot);
      set(res.session);
      return res.feedback;
    },
    transcribe: async (wav: Blob) => {
      const fd = new FormData();
      fd.append("file", wav, "answer.wav");
      return api<Transcription>("/speech/transcribe", { method: "POST", form: fd });
    },
  }), [id, qc, set]);

  return { query: q, model, actions, session: q.data };
}
