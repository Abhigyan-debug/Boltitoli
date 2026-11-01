import * as Tabs from "@radix-ui/react-tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, ErrorState, Field, Input, LoadingBlock, Notice, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { renderTier, setRenderPreference } from "@/components/three/capability";
import { useAuth } from "@/features/auth/AuthProvider";
import { clearDevice, listPacks, listPending } from "@/features/offline/db";
import { api, errorMessage } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { useApiMutation, useAudit, useConsents, useProviders, useSchool, useSpeechStatus, useStaff } from "@/services/queries";
import type { User } from "@/types/api";

function Account() {
  const { user, setUser } = useAuth();
  const t = useT();
  const [name, setName] = useState(user?.full_name ?? "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const save = useApiMutation((v: { full_name: string }) => api<User>("/auth/me", { method: "PATCH", body: v }));
  const pw = useApiMutation((v: { current_password: string; new_password: string }) => api("/auth/change-password", { method: "POST", body: v }));
  const pwError = next && (next.length < 8 || !/\d/.test(next) || !/[a-zA-Z]/.test(next)) ? t("Use at least 8 characters with letters and a number") : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 space-y-4">
        <h2 className="font-bold">{t("Your details")}</h2>
        <Field label={t("Name")}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t("Email")} hint={t("Contact your school administrator to change it.")}>{(id, d) => <Input id={id} value={user?.email} disabled aria-describedby={d} />}</Field>
        <Button disabled={name.trim().length < 2} loading={save.isPending} onClick={async () => {
          try {
            setUser({ ...user!, ...(await save.mutateAsync({ full_name: name.trim() })) });
            toast.success(t("Saved changes"));
          } catch (e) { toast.error(errorMessage(e)); }
        }}>{t("Save changes")}</Button>
      </Card>
      <Card className="p-5 space-y-4">
        <h2 className="font-bold">{t("Change password")}</h2>
        <Field label={t("Current password")}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />}</Field>
        <Field label={t("New password")} error={pwError}>{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!pwError} value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <p className="text-[13px] text-ink-muted">{t("Changing your password logs you out on other devices.")}</p>
        <Button disabled={!cur || !next || !!pwError} loading={pw.isPending} onClick={async () => {
          try {
            await pw.mutateAsync({ current_password: cur, new_password: next });
            setCur(""); setNext("");
            toast.success(t("Password changed"));
          } catch (e) { toast.error(errorMessage(e)); }
        }}>{t("Change password")}</Button>
      </Card>
    </div>
  );
}

function School({ isAdmin }: { isAdmin: boolean }) {
  const school = useSchool();
  const staff = useStaff();
  const qc = useQueryClient();
  const t = useT();
  const [form, setForm] = useState({ name: "", district: "", block: "" });
  const [adding, setAdding] = useState(false);
  const [newStaff, setNewStaff] = useState({ full_name: "", email: "" });
  const [temp, setTemp] = useState<string | null>(null);
  useEffect(() => {
    if (school.data) setForm({ name: school.data.name, district: school.data.district ?? "", block: school.data.block ?? "" });
  }, [school.data]);
  const save = useApiMutation((v: typeof form) => api("/schools/current", { method: "PATCH", body: { name: v.name, district: v.district || null, block: v.block || null } }), [["school"]]);
  const add = useApiMutation((v: typeof newStaff) => api<{ temporary_password: string }>("/schools/current/staff", { method: "POST", body: v }), [["staff"]]);
  if (school.isLoading) return <LoadingBlock />;
  if (school.isError) return <ErrorState message={errorMessage(school.error)} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5 space-y-4">
        <h2 className="font-bold">{t("School")}</h2>
        <Field label={t("School name")}>{(id) => <Input id={id} disabled={!isAdmin} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("District")}>{(id) => <Input id={id} disabled={!isAdmin} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />}</Field>
          <Field label={t("Block")}>{(id) => <Input id={id} disabled={!isAdmin} value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} />}</Field>
        </div>
        {school.data?.udise_code && <p className="text-sm text-ink-muted">UDISE code {school.data.udise_code}</p>}
        {isAdmin && <Button loading={save.isPending} disabled={form.name.trim().length < 2} onClick={async () => {
          try { await save.mutateAsync(form); await qc.invalidateQueries({ queryKey: ["school"] }); toast.success(t("Saved changes")); } catch (e) { toast.error(errorMessage(e)); }
        }}>{t("Save changes")}</Button>}
      </Card>
      <Card>
        <CardHeader title={t("Teachers")} action={isAdmin && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>{t("Add teacher")}</Button>} />
        {staff.isLoading ? <LoadingBlock /> : (
          <ul className="divide-y divide-line px-5 pb-3">
            {staff.data?.map((u) => (
              <li key={u.id} className="py-3">
                <p className="font-semibold">{u.full_name}</p>
                <p className="text-sm text-ink-muted">{u.email}, {t(u.role === "school_admin" ? "administrator" : "teacher")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog open={adding} onOpenChange={(o) => { setAdding(o); if (!o) { setTemp(null); setNewStaff({ full_name: "", email: "" }); } }} title={t("Add a teacher")}
        description={t("They get a temporary password to change after their first login.")}>
        {temp ? (
          <div className="space-y-3">
            <Notice tone="success">{t("Account created. Share this temporary password privately. It is shown only once.")}</Notice>
            <p className="rounded-[var(--radius-md)] bg-chalk p-3 text-center text-xl font-bold tracking-wide select-all">{temp}</p>
            <Button className="w-full" onClick={() => setAdding(false)}>{t("Done")}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label={t("Name")}>{(id) => <Input id={id} value={newStaff.full_name} onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })} />}</Field>
            <Field label={t("Email")}>{(id) => <Input id={id} type="email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />}</Field>
            <Button className="w-full" loading={add.isPending} disabled={newStaff.full_name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(newStaff.email)} onClick={async () => {
              try { setTemp((await add.mutateAsync(newStaff)).temporary_password); } catch (e) { toast.error(errorMessage(e)); }
            }}>{t("Create account")}</Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const CONSENT_TYPES = { school_authorisation: "School / SMC authorisation", parent_notice: "Notice to parents", parent_consent: "Parent consent" };
const METHODS = { signed_form: "Signed form", smc_meeting: "SMC meeting minutes", written_notice: "Written notice", other: "Other" };

function Privacy({ isAdmin }: { isAdmin: boolean }) {
  const school = useSchool();
  const consents = useConsents();
  const audit = useAudit(isAdmin);
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ consent_type: "school_authorisation", scope: "Use of BoltiToli for group maths practice", method: "smc_meeting", reference: "", granted_on: new Date().toISOString().slice(0, 10), notes: "" });
  const [retention, setRetention] = useState<number | "">("");
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  useEffect(() => { if (school.data) setRetention(school.data.data_retention_days); }, [school.data]);
  const addConsent = useApiMutation(() => api("/schools/current/consents", { method: "POST", body: { ...form, reference: form.reference || null, notes: form.notes || null, granted_on: `${form.granted_on}T00:00:00Z` } }), [["consents"], ["audit"]]);
  const revoke = useApiMutation((id: string) => api(`/schools/current/consents/${id}/revoke`, { method: "POST" }), [["consents"], ["audit"]]);
  const saveRetention = useApiMutation((d: number) => api("/schools/current", { method: "PATCH", body: { data_retention_days: d } }), [["school"], ["audit"]]);
  const applyRetention = useApiMutation(() => api<{ deleted_sessions: number }>("/schools/current/retention/apply", { method: "POST" }), [["sessions"], ["overview"], ["audit"]]);
  const deleteAll = useApiMutation(() => api("/schools/current/data?confirm=DELETE", { method: "DELETE" }), [["sessions"], ["overview"], ["group-analytics"], ["audit"]]);

  return (
    <div className="space-y-6">
      <Notice tone="info">
        BoltiToli stores group-level answers and session summaries only. It does not store children’s names, photos or voice
        recordings: spoken answers are sent once for transcription and discarded. Before using BoltiToli in a school, check your
        state’s rules, the DPDP Act and Rules, and agree a consent process with your SMC. This record helps you document that; it is not legal advice.
      </Notice>
      <Card>
        <CardHeader title={t("Consent and authorisation records")} />
        {consents.isLoading ? <LoadingBlock /> : !consents.data?.length ? <EmptyState title={t("No records yet")} body={t("Record how your school authorised the use of BoltiToli and how parents were informed.")} /> : (
          <ul className="divide-y divide-line px-5">
            {consents.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1 min-w-56">
                  <p className="font-semibold">{t(CONSENT_TYPES[c.consent_type as keyof typeof CONSENT_TYPES] ?? c.consent_type)}</p>
                  <p className="text-sm text-ink-muted">{c.scope}. {t(METHODS[c.method as keyof typeof METHODS] ?? c.method)}{c.reference && `, ${c.reference}`}, {fmtDate(c.granted_on)}
                    {c.revoked_on && <span className="text-danger-700">, {t("revoked")} {fmtDate(c.revoked_on)}</span>}</p>
                </div>
                {isAdmin && !c.revoked_on && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(c.id)}>{t("Mark revoked")}</Button>}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
            <Field label={t("Type")}>{(id) => <Select id={id} value={form.consent_type} onChange={(e) => setForm({ ...form, consent_type: e.target.value })}>{Object.entries(CONSENT_TYPES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select>}</Field>
            <Field label={t("How it was given")}>{(id) => <Select id={id} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select>}</Field>
            <Field label={t("What it covers")}>{(id) => <Input id={id} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />}</Field>
            <Field label={t("Date")}>{(id) => <Input id={id} type="date" value={form.granted_on} onChange={(e) => setForm({ ...form, granted_on: e.target.value })} />}</Field>
            <Field label={t("Reference")} optional hint={t("For example, the minutes book page.")}>{(id, d) => <Input id={id} aria-describedby={d} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />}</Field>
            <Field label={t("Notes")} optional>{(id) => <Textarea id={id} className="min-h-11" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
            <div><Button loading={addConsent.isPending} disabled={form.scope.trim().length < 3} onClick={async () => {
              try { await addConsent.mutateAsync(undefined); toast.success(t("Record added")); } catch (e) { toast.error(errorMessage(e)); }
            }}>{t("Add record")}</Button></div>
          </div>
        )}
      </Card>

      {isAdmin && (
        <Card className="p-5 space-y-4">
          <h2 className="font-bold">{t("Data retention")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48"><Field label={t("Keep session records for")} hint={t("Between 90 and 3650 days.")}>{(id, d) => <Input id={id} type="number" min={90} max={3650} aria-describedby={d} value={retention} onChange={(e) => setRetention(e.target.value === "" ? "" : Number(e.target.value))} />}</Field></div>
            <Button variant="secondary" disabled={retention === "" || retention < 90 || retention > 3650} loading={saveRetention.isPending} onClick={async () => {
              try { await saveRetention.mutateAsync(Number(retention)); await qc.invalidateQueries({ queryKey: ["school"] }); toast.success(t("Retention period saved")); } catch (e) { toast.error(errorMessage(e)); }
            }}>{t("Save")}</Button>
            <Button variant="secondary" loading={applyRetention.isPending} onClick={async () => {
              try { const r = await applyRetention.mutateAsync(undefined); toast.success(t("Deleted {n} expired session records", { n: r.deleted_sessions })); } catch (e) { toast.error(errorMessage(e)); }
            }}>{t("Delete expired records now")}</Button>
          </div>
          <div className="border-t border-line pt-4">
            <p className="font-semibold text-danger-700">{t("Delete all learning records")}</p>
            <p className="text-sm text-ink-muted">{t("Removes every session, summary and progress record for this school. Groups and lessons stay.")}</p>
            <Button className="mt-3" variant="dangerOutline" onClick={() => setDeleting(true)}>{t("Delete all learning records")}</Button>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader title={t("Activity log")} sub={t("Administrative actions in this school.")} />
          {audit.isLoading ? <LoadingBlock /> : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-line px-5 pb-3 text-sm">
              {audit.data?.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span>{a.action.replace(/[._]/g, " ")}</span><span className="text-ink-muted tabular">{fmtDateTime(a.at)}</span></li>)}
            </ul>
          )}
        </Card>
      )}

      <ConfirmDialog open={deleting} onOpenChange={(o) => { setDeleting(o); setConfirmText(""); }} danger title={t("Delete all learning records?")}
        body={<div className="space-y-3"><p>{t("This cannot be undone. Type DELETE to confirm.")}</p><Input aria-label={t("Type DELETE to confirm")} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></div>}
        confirmLabel={t("Delete everything")} loading={deleteAll.isPending}
        onConfirm={async () => {
          if (confirmText !== "DELETE") { toast.error(t("Type DELETE to confirm")); return; }
          try { await deleteAll.mutateAsync(undefined); toast.success(t("All learning records deleted")); setDeleting(false); } catch (e) { toast.error(errorMessage(e)); }
        }} />
    </div>
  );
}

function VoiceAndDevice({ isAdmin }: { isAdmin: boolean }) {
  const speech = useSpeechStatus();
  const providers = useProviders(isAdmin);
  const t = useT();
  const [tier, setTier] = useState(renderTier());
  const [stored, setStored] = useState<{ packs: number; pending: number } | null>(null);
  useEffect(() => {
    void Promise.all([listPacks(), listPending()]).then(([p, q]) => setStored({ packs: p.length, pending: q.length }));
  }, []);
  const STATE: Record<string, string> = { ok: "Working", degraded: "Recent errors", cooling_down: "Paused after repeated errors", not_configured: "Not configured", unknown: "Not used yet" };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-bold">{t("Voice features right now")}</h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>{t("Hindi speech (server):")} {t(speech.data?.tts_available ? "available" : "not available")}</li>
          <li>{t("Listening to answers:")} {t(speech.data?.stt_available ? "available, needs internet" : "not available")}</li>
          <li>{t("Offline listening: not supported. Offline answers are entered on the number pad.")}</li>
        </ul>
        {isAdmin && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="font-semibold">{t("Provider health")}</p>
            {providers.isLoading ? <LoadingBlock rows={2} /> : (
              <ul className="mt-2 space-y-1 text-sm">
                {providers.data?.providers.map((p) => (
                  <li key={p.name} className="flex justify-between gap-3"><span className="capitalize">{p.name.replace("_", " ")}</span>
                    <span className={p.state === "ok" ? "text-success-700" : p.state === "not_configured" || p.state === "unknown" ? "text-ink-muted" : "text-warning-700"}>
                      {t(STATE[p.state] ?? p.state)}{p.last_error_code && p.state !== "ok" ? ` (${p.last_error_code})` : ""}
                    </span></li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[13px] text-ink-muted">{providers.data?.fallback}</p>
          </div>
        )}
      </Card>
      <Card className="p-5 space-y-4">
        <h2 className="font-bold">{t("This device")}</h2>
        <Field label={t("Illustrations")} hint={t("2D uses less battery and works on every phone.")}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={tier} onChange={(e) => { setRenderPreference(e.target.value as "2d" | "3d"); setTier(renderTier()); }}>
              <option value="3d">{t("3D where supported")}</option><option value="2d">{t("Always 2D")}</option>
            </Select>
          )}
        </Field>
        <p className="text-sm text-ink-muted">{stored ? t("{a} lessons and {b} unsynced sessions are stored on this device.", { a: stored.packs, b: stored.pending }) : t("Checking storage…")}</p>
        <Button variant="secondary" onClick={async () => { await clearDevice(true); setStored((s) => s && { ...s, packs: 0 }); toast.success(t("Downloaded lessons removed. Unsynced sessions were kept.")); }}>
          {t("Remove downloaded lessons")}
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "school_admin";
  const isOfficial = user?.role === "official";
  const t = useT();
  const tabs = [["account", "Account"], ...(isOfficial ? [] : [["school", "School"], ["privacy", "Privacy and consent"]]), ["voice", "Voice and device"]];
  return (
    <>
      <PageHeader title={t("Settings")} />
      <Tabs.Root defaultValue="account">
        <Tabs.List className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label={t("Settings sections")}>
          {tabs.map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="whitespace-nowrap border-b-2 border-transparent px-3 h-11 text-sm font-semibold text-ink-muted data-[state=active]:border-slate-800 data-[state=active]:text-ink">{t(l)}</Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="account"><Account /></Tabs.Content>
        {!isOfficial && <Tabs.Content value="school"><School isAdmin={isAdmin} /></Tabs.Content>}
        {!isOfficial && <Tabs.Content value="privacy"><Privacy isAdmin={isAdmin} /></Tabs.Content>}
        <Tabs.Content value="voice"><VoiceAndDevice isAdmin={isAdmin} /></Tabs.Content>
      </Tabs.Root>
    </>
  );
}
