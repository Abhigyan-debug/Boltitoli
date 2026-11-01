import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardHeader, ErrorState, Field, LoadingBlock, Notice, Select, Textarea } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, ApiError, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { useApiMutation, useLesson, useVersions } from "@/services/queries";
import type { LessonVersion } from "@/types/api";

const DIFF = ["", "Easier", "Core", "Challenge"];

export default function LessonDetailPage() {
  const { id = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const versionId = sp.get("version") ?? undefined;
  const { user } = useAuth();
  const lesson = useLesson(id, versionId);
  const versions = useVersions(id);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [note, setNote] = useState("");
  const [draftDifficulty, setDraftDifficulty] = useState("2");
  const t = useT();

  const viewing: LessonVersion | undefined =
    versions.data?.find((v) => v.id === versionId) ?? lesson.data?.published_version ?? undefined;

  const review = useApiMutation(
    () => api<LessonVersion>(`/lessons/${id}/review`, { method: "POST", body: { version_id: viewing!.id, note: note || null } }),
    [["lessons"], ["lesson"], ["versions", id], ["packs"]],
  );
  const draft = useApiMutation(
    () => api<LessonVersion>(`/lessons/${id}/draft-questions`, { method: "POST", body: { count: 5, difficulty: Number(draftDifficulty) } }),
    [["versions", id], ["lessons"]],
  );

  if (lesson.isLoading) return <LoadingBlock />;
  if (lesson.isError || !lesson.data) return <ErrorState message={errorMessage(lesson.error)} onRetry={() => lesson.refetch()} />;
  const l = lesson.data;
  const isActive = viewing?.id === l.published_version?.id;
  const isStaff = user?.role !== "official";

  return (
    <div className="space-y-6">
      <Link to="/app/lessons" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Lesson library")}</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold" lang="hi">{l.title_hi}</h1>
          <p className="text-ink-muted">{l.title_en}, grades {l.skill.grade_band}</p>
        </div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDraftOpen(true)}><Sparkles /> {t("Draft more questions")}</Button>
            {viewing?.status === "draft" && <Button onClick={() => setReviewOpen(true)}><CheckCircle2 /> {t("Mark as reviewed")}</Button>}
          </div>
        )}
      </div>

      {viewing && (
        <Notice tone={viewing.status === "reviewed" ? "success" : "warning"}>
          {viewing.status === "reviewed"
            ? <>{t("Version {v} was reviewed by {name} on {date}.", { v: viewing.version, name: viewing.reviewed_by_name ?? t("a teacher"), date: fmtDate(viewing.reviewed_at) })}{viewing.review_note && <> {t("Note:")} “{viewing.review_note}”</>}</>
            : <>{t(viewing.source === "ai_draft" ? "Version {v} is a draft that includes questions drafted by Claude." : "Version {v} is a draft written by the BoltiToli team.", { v: viewing.version })} {t("Read every question before marking it reviewed.")}{viewing.source === "ai_draft" && !isActive && ` ${t("It will not be used in sessions until it is reviewed.")}`}</>}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="paper-ruled overflow-hidden">
          <div className="pl-12 pr-5 py-4 border-b border-paper-line">
            <p className="text-sm font-semibold text-wood-700">{t("Objective")}</p>
            <p lang="hi">{viewing?.objective_hi}</p>
            <p className="mt-3 text-sm font-semibold text-wood-700">{t("Opening words BoltiToli says")}</p>
            <p lang="hi" className="font-chalk text-[18px] text-slate-800">{viewing?.intro_hi}</p>
          </div>
          <ol className="divide-y divide-paper-line">
            {l.questions.map((q, i) => (
              <li key={q.id} className="grid gap-1 pl-12 pr-5 py-4 sm:grid-cols-[2.5rem_1fr_auto]">
                <span className="text-ink-faint tabular">{i + 1}.</span>
                <div className="min-w-0">
                  <p lang="hi" className="font-semibold">{q.prompt_hi}</p>
                  <p className="text-[13px] text-ink-muted">{q.prompt_en}</p>
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-teal-700">{t("Hint and explanation")}</summary>
                    <p lang="hi" className="mt-1"><span className="text-ink-muted">{t("Hint:")} </span>{q.hint_hi}</p>
                    <p lang="hi"><span className="text-ink-muted">{t("If still wrong:")} </span>{q.explanation_hi}</p>
                  </details>
                </div>
                <div className="text-sm sm:text-right">
                  <p>{t("Answer")} <span className="text-lg font-bold tabular">{q.expected_answer}</span></p>
                  <p className="text-ink-muted">{DIFF[q.difficulty]}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="self-start">
          <CardHeader title={t("Versions")} />
          <ul className="px-2 pb-3">
            {versions.data?.map((v) => (
              <li key={v.id}>
                <button onClick={() => setSp(v.id === l.published_version?.id ? {} : { version: v.id })}
                  className={`w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm hover:bg-chalk ${v.id === viewing?.id ? "bg-chalk font-semibold" : ""}`}>
                  {t("Version")} {v.version} {v.id === l.published_version?.id && <span className="text-teal-700">({t("in use")})</span>}
                  <span className="block text-[13px] font-normal text-ink-muted">
                    {t(v.status === "reviewed" ? "Reviewed" : "Draft")}, {t("{n} questions", { n: v.question_count })}{v.source === "ai_draft" && `, ${t("AI-assisted")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen} title={t("Mark this lesson as reviewed")}
        description={t("Your name will be recorded as the reviewer, and this version will be used for new sessions.")}>
        <Field label={t("Note")} optional hint={t("For example, changes you want or how you checked it.")}>
          {(fid) => <Textarea id={fid} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReviewOpen(false)}>{t("Cancel")}</Button>
          <Button loading={review.isPending} onClick={async () => {
            try {
              await review.mutateAsync(undefined);
              toast.success(t("Lesson marked as reviewed"));
              setReviewOpen(false);
              setSp({});
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}>{t("Mark as reviewed")}</Button>
        </div>
      </Dialog>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen} title={t("Draft more questions")}
        description={t("Claude proposes up to 5 questions. BoltiToli recomputes every answer, rejects anything outside this skill, and saves them as a new draft version for you to review.")}>
        <Field label={t("Difficulty")}>
          {(fid) => (
            <Select id={fid} value={draftDifficulty} onChange={(e) => setDraftDifficulty(e.target.value)}>
              <option value="1">{t("Easier")}</option><option value="2">{t("Core")}</option><option value="3">{t("Challenge")}</option>
            </Select>
          )}
        </Field>
        {draft.isError && (
          <Notice tone="danger" className="mt-4">
            {draft.error instanceof ApiError && draft.error.code === "ai_unavailable"
              ? t("Claude isn’t configured on this server, so questions can’t be drafted. Lessons still work normally.")
              : errorMessage(draft.error)}
          </Notice>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDraftOpen(false)}>{t("Cancel")}</Button>
          <Button loading={draft.isPending} onClick={async () => {
            try {
              const v = await draft.mutateAsync(undefined);
              toast.success(t("Draft version {v} created. Review it before use.", { v: v.version }));
              setDraftOpen(false);
              setSp({ version: v.id });
            } catch {
              /* shown above */
            }
          }}><Sparkles /> {t("Draft questions")}</Button>
        </div>
      </Dialog>
    </div>
  );
}
