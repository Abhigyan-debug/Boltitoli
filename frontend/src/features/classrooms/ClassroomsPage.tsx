import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Pencil, Plus, School2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SchoolHouse } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Card, EmptyState, ErrorState, Field, Input, LoadingBlock, Notice, PageHeader } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { qk, useApiMutation, useClassrooms } from "@/services/queries";
import type { Classroom } from "@/types/api";

const schema = z.object({
  name: z.string().trim().min(1, "Give the classroom a name").max(100),
  grades: z.string().regex(/^[1-5](-[1-5])?$/, "Use a grade or range from 1 to 5, like 1-3"),
});
type Form = z.infer<typeof schema>;

export function ClassroomForm({ initial, onSaved, onCancel }: { initial?: Classroom; onSaved: (c: Classroom) => void; onCancel?: () => void }) {
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: initial?.name ?? "", grades: initial?.grades ?? "1-3" } });
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const save = useApiMutation(
    (v: Form) => api<Classroom>(initial ? `/classrooms/${initial.id}` : "/classrooms", { method: initial ? "PATCH" : "POST", body: v }),
    [["classrooms"]],
  );
  return (
    <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => {
      setErr(null);
      try {
        onSaved(await save.mutateAsync(v));
      } catch (e) {
        setErr(errorMessage(e));
      }
    })}>
      {err && <Notice tone="danger">{err}</Notice>}
      <Field label={t("Classroom name")} error={f.formState.errors.name?.message && t(f.formState.errors.name.message)}>
        {(id, d) => <Input id={id} placeholder={t("e.g. Class 1–3 (multigrade)")} aria-describedby={d} aria-invalid={!!f.formState.errors.name} {...f.register("name")} />}
      </Field>
      <Field label={t("Grades")} hint={t("One grade (2) or a range (1-3).")} error={f.formState.errors.grades?.message && t(f.formState.errors.grades.message)}>
        {(id, d) => <Input id={id} inputMode="numeric" aria-describedby={d} aria-invalid={!!f.formState.errors.grades} {...f.register("grades")} />}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>{t("Cancel")}</Button>}
        <Button type="submit" loading={save.isPending}>{t(initial ? "Save changes" : "Create classroom")}</Button>
      </div>
    </form>
  );
}

export default function ClassroomsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const q = useClassrooms(showArchived);
  const [editing, setEditing] = useState<Classroom | "new" | null>(null);
  const [archiving, setArchiving] = useState<Classroom | null>(null);
  const t = useT();
  const archive = useApiMutation(
    (c: Classroom) => api(`/classrooms/${c.id}`, { method: "PATCH", body: { archived: !c.archived_at } }),
    [["classrooms"], qk.groups(false)],
  );

  return (
    <>
      <PageHeader title={t("Classrooms")} sub={t("A classroom holds the learning groups you teach together.")}
        actions={<Button onClick={() => setEditing("new")}><Plus /> {t("New classroom")}</Button>} />
      <label className="mb-4 inline-flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" className="size-4 accent-teal-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {t("Show archived classrooms")}
      </label>
      <Card>
        {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          : !q.data?.length ? (
            <EmptyState icon={<School2 className="size-8" />} title={t("No classrooms yet")}
              body={t("Most multigrade schools need just one classroom, for example “Class 1–3”.")}
              action={<Button onClick={() => setEditing("new")}><Plus /> {t("Create a classroom")}</Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {q.data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-sky-50/60">
                  <div className="grid h-16 w-20 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--color-sky-100),var(--color-saffron-100))]">
                    <SchoolHouse className="h-14 w-[72px]" />
                  </div>
                  <div className="flex-1 min-w-48">
                    <p className="font-semibold">{c.name} {c.archived_at && <span className="ml-1 text-xs font-medium text-ink-muted">({t("archived")})</span>}</p>
                    <p className="text-sm text-ink-muted">{t("Grades {g}, {n} active groups, created {date}", { g: c.grades, n: c.group_count, date: fmtDate(c.created_at) })}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil /> {t("Edit")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => (c.archived_at ? archive.mutate(c) : setArchiving(c))}>
                    {c.archived_at ? <><ArchiveRestore /> {t("Restore")}</> : <><Archive /> {t("Archive")}</>}
                  </Button>
                </li>
              ))}
            </ul>
          )}
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={t(editing === "new" ? "New classroom" : "Edit classroom")}>
        {editing && (
          <ClassroomForm initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)}
            onSaved={(c) => {
              toast.success(editing === "new" ? t("Created {name}", { name: c.name }) : t("Saved changes"));
              setEditing(null);
            }} />
        )}
      </Dialog>
      <ConfirmDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)} title={t("Archive {name}?", { name: archiving?.name })}
        body={t("Its groups will be hidden from session setup. Session history is kept and you can restore the classroom later.")}
        confirmLabel={t("Archive classroom")} loading={archive.isPending}
        onConfirm={async () => {
          if (!archiving) return;
          try {
            await archive.mutateAsync(archiving);
            toast.success(t("Archived {name}", { name: archiving.name }));
          } catch (e) {
            toast.error(errorMessage(e));
          }
          setArchiving(null);
        }} />
    </>
  );
}
