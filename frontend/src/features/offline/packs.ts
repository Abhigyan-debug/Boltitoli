import { api, ApiError } from "@/lib/api";
import type { Group, LessonPack, Skill } from "@/types/api";
import { PHRASES } from "@/features/sessions/engine/engine";
import { type OfflineRoster, savePack, saveAudio, setMeta } from "./db";

/** Every speakable clip in a pack, as [ref, text]. Matches backend clip_texts(). */
export function packClips(pack: LessonPack): [string, string][] {
  const clips: [string, string][] = [[`v:${pack.version_id}:intro`, pack.intro_hi]];
  for (const q of pack.questions) {
    clips.push([`q:${q.id}:prompt`, q.prompt_hi], [`q:${q.id}:hint`, q.hint_hi], [`q:${q.id}:explanation`, q.explanation_hi]);
  }
  for (const [k, t] of Object.entries(PHRASES)) clips.push([`p:${k}`, t]);
  return clips;
}

export interface DownloadResult {
  pack: LessonPack;
  audioSaved: number;
  audioTotal: number;
  audioError: string | null;
}

export async function downloadPack(
  lessonId: string,
  opts: { withAudio: boolean; onProgress?: (done: number, total: number) => void },
): Promise<DownloadResult> {
  const pack = await api<LessonPack>(`/lesson-packs/${lessonId}`);
  const clips = packClips(pack);
  let saved = 0;
  let audioError: string | null = null;
  if (opts.withAudio) {
    for (const [ref] of clips) {
      try {
        const res = await api<Response>(`/speech/clip?ref=${encodeURIComponent(ref)}`, { raw: true });
        await saveAudio(ref, lessonId, await res.blob());
        saved += 1;
        opts.onProgress?.(saved, clips.length);
      } catch (e) {
        audioError = e instanceof ApiError ? e.code : "audio_failed";
        break; // provider unavailable: keep the text-only pack
      }
    }
  }
  await savePack(pack, saved);
  return { pack, audioSaved: saved, audioTotal: clips.length, audioError };
}

/** Cache the teacher's groups and skills so an offline session can be started. */
export async function cacheRoster(schoolId: string) {
  const [groups, skills] = await Promise.all([api<Group[]>("/groups"), api<Skill[]>("/skills")]);
  const roster: OfflineRoster = { school_id: schoolId, groups, skills };
  await setMeta("roster", roster);
  return roster;
}
