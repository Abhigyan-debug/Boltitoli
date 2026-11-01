import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { useGroups } from "@/services/queries";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { user } = useAuth();
  const groups = useGroups();
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const t = useT();
  const invalid = from > to;

  const download = async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ since: `${from}T00:00:00Z`, until: `${to}T23:59:59Z` });
      if (group) qs.set("group_id", group);
      const res = await api<Response>(`/reports/sessions.csv?${qs}`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `boltitoli-sessions-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Report downloaded"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("Reports")} sub={t("Download completed sessions as a spreadsheet (CSV opens in Excel and Google Sheets).")} />
      <Card className="max-w-2xl space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("From")}>{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t("To")} error={invalid ? t("The end date must be after the start date") : undefined}>
            {(id, d) => <Input id={id} type="date" value={to} min={from} aria-describedby={d} aria-invalid={invalid} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        {user?.role !== "official" && (
          <Field label={t("Group")}>
            {(id) => (
              <Select id={id} value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">{t("All groups")}</option>
                {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <div className="rounded-[var(--radius-md)] bg-chalk p-4 text-sm text-ink-muted">
          {t("Each row is one session: date, group, skill, minutes, questions answered, right first try, right after a hint, needing more practice, highest difficulty reached and the most common difficulty. It contains no children’s names.")}
        </div>
        <Button onClick={download} loading={busy} disabled={invalid}><Download /> {t("Download CSV")}</Button>
      </Card>
    </>
  );
}
