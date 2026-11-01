/**
 * IndexedDB storage for offline classrooms.
 *
 * Stores only what an offline session needs: approved lesson packs, their
 * audio clips, a small cache of the teacher's groups, and minimal pending
 * group-level session records waiting to sync. No children's names or audio.
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Group, LessonPack, Skill } from "@/types/api";

export interface PendingResponse {
  client_response_id: string;
  question_id: string;
  sequence_no: number;
  attempt_no: number;
  input_method: "manual" | "leader" | "override";
  value: number | null;
  confirmed: boolean;
  override_outcome?: "correct" | "incorrect" | "skipped" | null;
  answered_at: string;
}

export type PendingStatus = "in_progress" | "pending_sync" | "syncing" | "sync_failed" | "rejected";

export interface PendingSession {
  client_session_id: string;
  school_id: string;
  group_id: string;
  group_name: string;
  lesson_id: string;
  lesson_version_id: string;
  skill_name_hi: string;
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  last_resumed_at: string | null;
  paused: boolean;
  engine_state: unknown;
  responses: PendingResponse[];
  status: PendingStatus;
  attempts: number;
  last_error: string | null;
  server_session_id: string | null;
  updated_at: string;
}

interface BoltiDB extends DBSchema {
  packs: { key: string; value: LessonPack & { downloaded_at: string; audio_clips: number } };
  audio: { key: string; value: { ref: string; lesson_id: string; blob: Blob } ; indexes: { by_lesson: string } };
  pending: { key: string; value: PendingSession; indexes: { by_status: PendingStatus } };
  meta: { key: string; value: { key: string; value: unknown; updated_at: string } };
}

let dbp: Promise<IDBPDatabase<BoltiDB>> | null = null;

export function db(): Promise<IDBPDatabase<BoltiDB>> {
  if (!dbp) {
    dbp = openDB<BoltiDB>("boltitoli", 1, {
      upgrade(d) {
        d.createObjectStore("packs", { keyPath: "lesson_id" });
        const audio = d.createObjectStore("audio", { keyPath: "ref" });
        audio.createIndex("by_lesson", "lesson_id");
        const pending = d.createObjectStore("pending", { keyPath: "client_session_id" });
        pending.createIndex("by_status", "status");
        d.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbp;
}

/** For tests: close and delete the database. */
export async function _resetDbForTests() {
  if (dbp) (await dbp).close();
  dbp = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("boltitoli");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

// --------------------------------------------------------------- packs ----
export async function savePack(pack: LessonPack, audioClips: number) {
  await (await db()).put("packs", { ...pack, downloaded_at: new Date().toISOString(), audio_clips: audioClips });
}
export async function getPack(lessonId: string) {
  return (await db()).get("packs", lessonId);
}
export async function listPacks() {
  return (await db()).getAll("packs");
}
export async function deletePack(lessonId: string) {
  const d = await db();
  const tx = d.transaction(["packs", "audio"], "readwrite");
  await tx.objectStore("packs").delete(lessonId);
  const idx = tx.objectStore("audio").index("by_lesson");
  for (const key of await idx.getAllKeys(lessonId)) await tx.objectStore("audio").delete(key);
  await tx.done;
}

// --------------------------------------------------------------- audio ----
export async function saveAudio(ref: string, lessonId: string, blob: Blob) {
  await (await db()).put("audio", { ref, lesson_id: lessonId, blob });
}
export async function getAudio(ref: string): Promise<Blob | undefined> {
  return (await (await db()).get("audio", ref))?.blob;
}

// ------------------------------------------------------------- pending ----
export async function putPending(p: PendingSession) {
  await (await db()).put("pending", { ...p, updated_at: new Date().toISOString() });
}
export async function getPending(id: string) {
  return (await db()).get("pending", id);
}
export async function listPending() {
  return (await db()).getAll("pending");
}
export async function deletePending(id: string) {
  await (await db()).delete("pending", id);
}

// ---------------------------------------------------------------- meta ----
export async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", { key, value, updated_at: new Date().toISOString() });
}
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("meta", key))?.value as T | undefined;
}

export interface OfflineRoster {
  school_id: string;
  groups: Group[];
  skills: Skill[];
}

/** Clear everything stored on this device (used at logout on shared phones). */
export async function clearDevice(keepPending = true) {
  const d = await db();
  await d.clear("packs");
  await d.clear("audio");
  await d.clear("meta");
  if (!keepPending) await d.clear("pending");
}
