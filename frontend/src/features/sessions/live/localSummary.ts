import type { PendingResponse } from "@/features/offline/db";
import type { LessonPack } from "@/types/api";
import { detectMisconception, type EngineQuestion, MISCONCEPTIONS_HI } from "../engine/engine";

/** Preview statistics for an offline session (the server recomputes everything on sync). */
export function localStats(responses: PendingResponse[], pack: LessonPack) {
  const qmap = new Map(pack.questions.map((q) => [q.id, q]));
  const bySeq = new Map<number, PendingResponse[]>();
  for (const r of responses) bySeq.set(r.sequence_no, [...(bySeq.get(r.sequence_no) ?? []), r]);
  let attempted = 0, first = 0, afterHint = 0, notYet = 0;
  const mis = new Map<string, number>();
  for (const rs of bySeq.values()) {
    rs.sort((a, b) => a.attempt_no - b.attempt_no);
    const last = rs[rs.length - 1];
    const q = qmap.get(rs[0].question_id);
    if (!q) continue;
    const correct = (r: PendingResponse) =>
      r.input_method === "override" ? r.override_outcome === "correct" : r.value === q.expected_answer;
    if (last.input_method === "override" && last.override_outcome === "skipped") continue;
    attempted += 1;
    if (rs[0].attempt_no === 1 && correct(rs[0])) first += 1;
    else if (correct(last)) afterHint += 1;
    else notYet += 1;
    for (const r of rs) {
      if (r.value !== null && !correct(r)) {
        const m = detectMisconception(q as EngineQuestion, r.value);
        if (m) mis.set(m, (mis.get(m) ?? 0) + 1);
      }
    }
  }
  const top = [...mis.entries()].sort((a, b) => b[1] - a[1])[0];
  return { attempted, first, afterHint, notYet, topMisconception: top ? MISCONCEPTIONS_HI[top[0]] : null };
}
