import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AuditEvent,
  Classroom,
  Consent,
  Group,
  GroupAnalytics,
  Lesson,
  LessonDetail,
  LessonVersion,
  Overview,
  PackIndexItem,
  Page,
  ProviderStatus,
  School,
  SessionListItem,
  SessionOut,
  Skill,
  SpeechStatus,
  Summary,
  User,
} from "@/types/api";

export const qk = {
  classrooms: (archived = false) => ["classrooms", archived] as const,
  groups: (archived = false) => ["groups", archived] as const,
  group: (id: string) => ["group", id] as const,
  skills: ["skills"] as const,
  lessons: ["lessons"] as const,
  lesson: (id: string, v?: string) => ["lesson", id, v ?? "active"] as const,
  versions: (id: string) => ["versions", id] as const,
  packs: ["packs"] as const,
  overview: (days: number) => ["overview", days] as const,
  groupAnalytics: (weeks: number) => ["group-analytics", weeks] as const,
  sessions: (params: string) => ["sessions", params] as const,
  activeSessions: ["sessions", "active"] as const,
  session: (id: string) => ["session", id] as const,
  summary: (id: string) => ["summary", id] as const,
  speech: ["speech-status"] as const,
  school: ["school"] as const,
  staff: ["staff"] as const,
  consents: ["consents"] as const,
  audit: ["audit"] as const,
  providers: ["providers"] as const,
};

export const useClassrooms = (archived = false) =>
  useQuery({ queryKey: qk.classrooms(archived), queryFn: () => api<Classroom[]>(`/classrooms?include_archived=${archived}`) });
export const useGroups = (archived = false) =>
  useQuery({ queryKey: qk.groups(archived), queryFn: () => api<Group[]>(`/groups?include_archived=${archived}`) });
export const useGroup = (id: string) =>
  useQuery({ queryKey: qk.group(id), queryFn: () => api<Group>(`/groups/${id}`), enabled: !!id });
export const useSkills = () =>
  useQuery({ queryKey: qk.skills, queryFn: () => api<Skill[]>("/skills"), staleTime: 60 * 60_000 });
export const useLessons = () => useQuery({ queryKey: qk.lessons, queryFn: () => api<Lesson[]>("/lessons") });
export const useLesson = (id: string, versionId?: string) =>
  useQuery({
    queryKey: qk.lesson(id, versionId),
    queryFn: () => api<LessonDetail>(`/lessons/${id}${versionId ? `?version_id=${versionId}` : ""}`),
  });
export const useVersions = (id: string) =>
  useQuery({ queryKey: qk.versions(id), queryFn: () => api<LessonVersion[]>(`/lessons/${id}/versions`) });
export const usePackIndex = () => useQuery({ queryKey: qk.packs, queryFn: () => api<PackIndexItem[]>("/lesson-packs") });
export const useOverview = (days = 7) =>
  useQuery({ queryKey: qk.overview(days), queryFn: () => api<Overview>(`/analytics/overview?days=${days}`) });
export const useGroupAnalytics = (weeks = 6) =>
  useQuery({ queryKey: qk.groupAnalytics(weeks), queryFn: () => api<GroupAnalytics[]>(`/analytics/groups?weeks=${weeks}`) });
export const useSessions = (params: Record<string, string | number | undefined> = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
  ).toString();
  return useQuery({ queryKey: qk.sessions(qs), queryFn: () => api<Page<SessionListItem>>(`/sessions?${qs}`) });
};
export const useActiveSessions = () =>
  useQuery({ queryKey: qk.activeSessions, queryFn: () => api<SessionOut[]>("/sessions/active") });
export const useSummary = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.summary(id), queryFn: () => api<Summary>(`/sessions/${id}/summary`), enabled });
export const useSessionDetail = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => api<SessionOut>(`/sessions/${id}`) });
export const useSpeechStatus = () =>
  useQuery({ queryKey: qk.speech, queryFn: () => api<SpeechStatus>("/speech/status"), staleTime: 60_000 });
export const useSchool = () => useQuery({ queryKey: qk.school, queryFn: () => api<School>("/schools/current") });
export const useStaff = () => useQuery({ queryKey: qk.staff, queryFn: () => api<User[]>("/schools/current/staff") });
export const useConsents = () =>
  useQuery({ queryKey: qk.consents, queryFn: () => api<Consent[]>("/schools/current/consents") });
export const useAudit = (enabled: boolean) =>
  useQuery({ queryKey: qk.audit, queryFn: () => api<AuditEvent[]>("/schools/current/audit?limit=50"), enabled });
export const useProviders = (enabled: boolean) =>
  useQuery({
    queryKey: qk.providers,
    queryFn: () => api<{ providers: ProviderStatus[]; models: Record<string, string>; fallback: string }>("/admin/providers"),
    enabled,
  });

/** Generic mutation that invalidates the given query keys on success. */
export function useApiMutation<TVars, TRes = unknown>(
  fn: (v: TVars) => Promise<TRes>,
  invalidate: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k as unknown[] }))),
  });
}
