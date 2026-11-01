import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Field, Input, Notice, Select } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { LEVELS } from "@/lib/utils";
import { useApiMutation, useClassrooms, useSkills } from "@/services/queries";
import type { Group, Level } from "@/types/api";

const schema = z.object({
  classroom_id: z.string().min(1, "Choose a classroom"),
  name: z.string().trim().min(1, "Give the group a name").max(60),
  level: z.enum(["beginner", "developing", "advancing"]),
  size: z.union([z.literal(""), z.coerce.number().int().min(1, "At least 1").max(60, "At most 60")]).optional(),
  leader_label: z.string().trim().max(40).optional(),
  current_skill_id: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function GroupForm({ initial, defaultClassroom, onSaved, onCancel }: {
  initial?: Group;
  defaultClassroom?: string;
  onSaved: (g: Group) => void;
  onCancel?: () => void;
}) {
  const rooms = useClassrooms();
  const skills = useSkills();
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const tm = (m?: string) => (m ? t(m) : undefined);
  const f = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      classroom_id: initial?.classroom_id ?? defaultClassroom ?? "",
      name: initial?.name ?? "",
      level: initial?.level ?? "beginner",
      size: initial?.size ?? "",
      leader_label: initial?.leader_label ?? "",
      current_skill_id: initial?.current_skill_id ?? "",
    },
  });
  const level = f.watch("level") as Level;
  const save = useApiMutation(
    (v: Form) => {
      const body = {
        name: v.name, level: v.level,
        size: v.size === "" || v.size === undefined ? null : v.size,
        leader_label: v.leader_label || null,
        current_skill_id: v.current_skill_id || null,
        ...(initial ? {} : { classroom_id: v.classroom_id }),
      };
      return api<Group>(initial ? `/groups/${initial.id}` : "/groups", { method: initial ? "PATCH" : "POST", body });
    },
    [["groups"], ["group"], ["classrooms"], ["overview"]],
  );
  const e = f.formState.errors;
  const sorted = [...(skills.data ?? [])].sort((a, b) => Number(b.level === level) - Number(a.level === level) || a.sort_order - b.sort_order);

  return (
    <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => {
      setErr(null);
      try {
        onSaved(await save.mutateAsync(v));
      } catch (x) {
        setErr(errorMessage(x));
      }
    })}>
      {err && <Notice tone="danger">{err}</Notice>}
      {!initial && (
        <Field label={t("Classroom")} error={tm(e.classroom_id?.message)}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} aria-invalid={!!e.classroom_id} {...f.register("classroom_id")}>
              <option value="">{t("Choose a classroom")}</option>
              {rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      <Field label={t("Group name")} hint={t("A friendly name, not children’s names. For example उड़ान, Group A.")} error={tm(e.name?.message)}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!e.name} {...f.register("name")} />}
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("Learning level")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <label key={l} className="flex cursor-pointer flex-col items-start gap-1 rounded-[var(--radius-md)] border border-line-strong p-3 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-saffron-500">
              <input type="radio" value={l} className="sr-only" {...f.register("level")} />
              <span className="font-semibold">{t(LEVELS[l].en)}</span>
              <span className="text-ink-muted" lang="hi">{LEVELS[l].hi}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-ink-muted">{t("Levels are a starting point you can change any time, not a label on children.")}</p>
      </fieldset>
      <Field label={t("Skill to practise")} optional hint={t("Skills for this level are listed first.")}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} {...f.register("current_skill_id")}>
            <option value="">{t("Choose later")}</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name_hi} — {s.name_en}</option>)}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Number of children")} optional error={tm(e.size?.message as string | undefined)}>
          {(id, d) => <Input id={id} type="number" min={1} max={60} inputMode="numeric" aria-describedby={d} aria-invalid={!!e.size} {...f.register("size")} />}
        </Field>
        <Field label={t("Group leader")} optional hint={t("Use a roll number or role, e.g. “Roll 4”.")}>
          {(id, d) => <Input id={id} maxLength={40} aria-describedby={d} {...f.register("leader_label")} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>{t("Cancel")}</Button>}
        <Button type="submit" loading={save.isPending}>{t(initial ? "Save changes" : "Create group")}</Button>
      </div>
    </form>
  );
}
