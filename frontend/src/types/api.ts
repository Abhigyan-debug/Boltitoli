// Mirrors backend/app/schemas. Keep in sync when the API changes.

export type Role = "teacher" | "school_admin" | "official";
export type Level = "beginner" | "developing" | "advancing";
export type SessionStatus = "prepared" | "active" | "paused" | "completed" | "abandoned";
export type InputMethod = "voice" | "manual" | "leader" | "override";
export type Outcome = "correct" | "incorrect" | "unclear" | "skipped";

export interface School {
  id: string;
  name: string;
  udise_code: string | null;
  district: string | null;
  block: string | null;
  is_demo: boolean;
  data_retention_days: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  school_id: string | null;
  preferred_language: string;
  onboarding_completed: boolean;
  school: School | null;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Classroom {
  id: string;
  school_id: string;
  name: string;
  grades: string;
  archived_at: string | null;
  created_at: string;
  group_count: number;
}

export interface Skill {
  id: string;
  code: string;
  name_en: string;
  name_hi: string;
  level: Level;
  grade_band: string;
  sort_order: number;
  description_hi: string;
  curriculum_refs: string[];
}

export interface Group {
  id: string;
  classroom_id: string;
  name: string;
  level: Level;
  size: number | null;
  leader_label: string | null;
  current_skill_id: string | null;
  current_skill: Skill | null;
  archived_at: string | null;
  created_at: string;
  last_session_at: string | null;
  sessions_count: number;
}

export type Visual =
  | { type: "objects"; object: string; groups: number[]; op: "+" | "-" | null; remove?: number }
  | { type: "number_line"; from: number; to: number; highlight: number; ask: "before" | "after" }
  | { type: "compare"; values: [number, number] }
  | { type: "bundles"; tens: number; ones: number; remove?: number }
  | { type: "bundles_add"; a: [number, number]; b: [number, number] };

export interface Question {
  id: string;
  position: number;
  difficulty: number;
  kind: string;
  prompt_hi: string;
  prompt_en: string;
  operands: Record<string, number | string>;
  expected_answer: number;
  hint_hi: string;
  explanation_hi: string;
  visual: Visual | null;
}

export interface LessonVersion {
  id: string;
  lesson_id: string;
  version: number;
  status: "draft" | "reviewed";
  source: string;
  objective_hi: string;
  intro_hi: string;
  completion_criteria: Record<string, number>;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  question_count: number;
}

export interface Lesson {
  id: string;
  code: string;
  title_hi: string;
  title_en: string;
  skill: Skill;
  published_version: LessonVersion | null;
  latest_version: LessonVersion | null;
}

export interface LessonDetail extends Lesson {
  questions: Question[];
}

export interface LessonPack {
  pack_id: string;
  lesson_id: string;
  lesson_code: string;
  version_id: string;
  version: number;
  status: "draft" | "reviewed";
  skill: Skill;
  title_hi: string;
  objective_hi: string;
  intro_hi: string;
  completion_criteria: Record<string, number>;
  questions: Question[];
  audio: Record<string, string>;
  audio_status: "included" | "unavailable" | "partial";
  built_at: string;
}

export interface PackIndexItem {
  lesson_id: string;
  pack_id: string;
  version_id: string;
  version: number;
  status: string;
  skill_id: string;
  title_hi: string;
  title_en: string;
  question_count: number;
}

export interface SessionOut {
  id: string;
  group_id: string;
  group_name: string;
  skill: Skill;
  lesson_id: string;
  lesson_title_hi: string;
  lesson_version_id: string;
  lesson_status: string;
  status: SessionStatus;
  mode: string;
  voice_mode: string;
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  current_question: Question | null;
  current_attempt: number;
  current_difficulty: number;
  questions_completed: number;
  intro_hi: string;
  has_summary: boolean;
}

export interface Feedback {
  outcome: Outcome;
  action: string;
  misconception: string | null;
  misconception_hi: string | null;
  message_hi: string;
  hint_hi: string | null;
  explanation_hi: string | null;
  suggest_manual: boolean;
  mastery_signal: boolean;
  feedback_source: "rules" | "claude";
}

export interface AnswerOut {
  session: SessionOut;
  feedback: Feedback;
  replayed: boolean;
}

export interface SessionListItem {
  id: string;
  group_id: string;
  group_name: string;
  skill_name_hi: string;
  skill_name_en: string;
  status: SessionStatus;
  mode: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  questions_attempted: number;
  correct_first_try: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SummaryStats {
  minutes: number;
  planned_minutes: number;
  questions_attempted: number;
  correct_first_try: number;
  correct_after_hint: number;
  not_yet: number;
  skipped: number;
  unclear_responses: number;
  first_try_accuracy_pct: number | null;
  by_difficulty: Record<string, { attempted: number; correct_first_try: number }>;
  highest_difficulty: number;
  misconceptions: { code: string; label_hi: string; count: number }[];
  input_methods: Record<string, number>;
  mastery_signal: boolean;
  mode: string;
}

export interface Summary {
  session_id: string;
  stats: SummaryStats;
  summary_hi: string;
  next_activity_hi: string;
  level_suggestion: "keep" | "review_up" | "review_down";
  level_suggestion_reason_hi: string | null;
  generated_by: "rules" | "claude";
  created_at: string;
}

export interface Transcription {
  text: string;
  value: number | null;
  parse_status: string;
  confidence: number | null;
  usable: boolean;
  needs_confirmation: boolean;
  needs_retry: boolean;
  provider: string;
}

export interface SpeechStatus {
  stt_available: boolean;
  tts_available: boolean;
  stt_provides_confidence: boolean;
  offline_stt: boolean;
  notes: string;
}

export interface Overview {
  period_days: number;
  sessions_completed: number;
  practice_minutes: number;
  active_groups: number;
  questions_attempted: number;
  first_try_accuracy: number | null;
  accuracy_sample: number;
  offline_sessions: number;
  recent_sessions: SessionListItem[];
  recommendation: {
    kind: "create_group" | "first_session" | "next_practice";
    group_id?: string;
    group_name?: string;
    days_since?: number;
    message_hi: string;
    message_en: string;
  } | null;
  is_demo: boolean;
}

export interface GroupAnalytics {
  group_id: string;
  group_name: string;
  level: Level;
  weekly: { weeks_ago: number; label: string; sessions: number; attempted: number; first_try_accuracy: number | null }[];
  skills: {
    skill_id: string;
    name_hi: string;
    name_en: string;
    sessions: number;
    attempted: number;
    first_try_accuracy: number | null;
    highest_difficulty: number;
    last_session_at: string | null;
  }[];
  misconceptions: { code: string; label_hi: string; count: number }[];
  questions_attempted: number;
  first_try_accuracy: number | null;
  enough_data: boolean;
}

export interface Consent {
  id: string;
  consent_type: string;
  scope: string;
  method: string;
  reference: string | null;
  granted_on: string;
  revoked_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  at: string;
}

export interface ProviderStatus {
  name: string;
  configured: boolean;
  state: "not_configured" | "cooling_down" | "degraded" | "ok" | "unknown";
  last_ok_at: number | null;
  last_error_at: number | null;
  last_error_code: string | null;
  consecutive_failures: number;
}

export interface SyncResult {
  client_session_id: string;
  status: "accepted" | "duplicate" | "rejected";
  session_id: string | null;
  error: string | null;
}
