import { useCallback, useId, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "@/i18n/I18nProvider";
import { cn, LEVELS, pct } from "@/lib/utils";
import type { GroupAnalytics } from "@/types/api";

type Row = { label: string } & Record<string, number | string | null>;


/** Glass tooltip: every visible group's accuracy that week, with its answer count. */
function ChartTip({ active, payload, label, groups, weekLabel }: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | null }[];
  label?: string;
  groups: GroupAnalytics[];
  weekLabel: (weeksAgo: number) => string;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-xl border border-white/70 bg-white/90 px-3.5 py-2.5 shadow-[var(--shadow-lift)] backdrop-blur-md">
      <p className="text-[12px] font-semibold text-ink-muted">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((p) => {
          const g = groups.find((x) => x.group_id === p.dataKey);
          if (!g) return null;
          const week = g.weekly.find((w) => weekLabel(w.weeks_ago) === label);
          return (
            <li key={g.group_id} className="flex items-center gap-2 text-[13px]">
              <span className="size-2.5 rounded-full" style={{ background: LEVELS[g.level].color }} />
              <span className="flex-1 font-semibold">{g.group_name}</span>
              <span className="tabular font-bold">{p.value == null ? "—" : `${Math.round(p.value)}%`}</span>
              <span className="tabular text-[11px] text-ink-muted">{week?.attempted ?? 0} {t("ans")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Weekly "right first try" per group, one colour per level.
 * Bars grow in one series after another; click a legend chip to hide or show that group.
 */
export function GroupProgressChart({ groups, height = 240 }: { groups: GroupAnalytics[]; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const t = useT();
  // one translated label builder for both the axis and the tooltip lookup
  const weekLabel = useCallback((n: number) => (n === 0 ? t("This wk") : t("{n} wk ago", { n })), [t]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const data = useMemo<Row[]>(() => {
    const weeks = [...new Set(groups.flatMap((g) => g.weekly.map((w) => w.weeks_ago)))].sort((a, b) => b - a);
    return weeks.map((wa) => {
      const row: Row = { label: weekLabel(wa) };
      groups.forEach((g) => (row[g.group_id] = g.weekly.find((w) => w.weeks_ago === wa)?.first_try_accuracy ?? null));
      return row;
    });
  }, [groups, weekLabel]);
  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("Show or hide groups")}>
        {groups.map((g) => {
          const off = hidden.has(g.group_id);
          return (
            <button key={g.group_id} type="button" onClick={() => toggle(g.group_id)} aria-pressed={!off}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-[opacity,background-color]",
                off ? "border-line bg-card text-ink-faint opacity-60" : "border-transparent bg-chalk-dim text-ink")}>
              <span className="size-2.5 rounded-full" style={{ background: off ? "var(--color-line-strong)" : LEVELS[g.level].color }} />
              {g.group_name}
            </button>
          );
        })}
      </div>
      <div style={{ height }} role="img" aria-label={t("Weekly right-first-try accuracy for each group")}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 6, left: -20, bottom: 0 }} barCategoryGap="22%" barGap={4}>
            <defs>
              {groups.map((g) => (
                <linearGradient key={g.group_id} id={`${uid}-${g.group_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LEVELS[g.level].color} stopOpacity={1} />
                  <stop offset="100%" stopColor={LEVELS[g.level].color} stopOpacity={0.45} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="4 6" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--color-sky-50)", radius: 10 }} content={(p) => <ChartTip {...(p as object)} groups={groups} weekLabel={weekLabel} />} />
            {groups.map((g, i) => (
              <Bar key={g.group_id} dataKey={g.group_id} name={g.group_name} hide={hidden.has(g.group_id)}
                fill={`url(#${uid}-${g.group_id})`} radius={[8, 8, 3, 3]} maxBarSize={22}
                animationBegin={i * 180} animationDuration={900} animationEasing="ease-out"
                activeBar={{ stroke: LEVELS[g.level].color, strokeWidth: 2, fillOpacity: 1 }} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* sr-only on a div, not the table: tables ignore the 1px clip and stretched the page below the sidebar */}
      <div className="sr-only">
        <table>
          <caption>{t("Right first try, by week and group")}</caption>
          <thead><tr><th>{t("Week")}</th>{groups.map((g) => <th key={g.group_id}>{g.group_name}</th>)}</tr></thead>
          <tbody>{data.map((r) => <tr key={r.label}><td>{r.label}</td>{groups.map((g) => <td key={g.group_id}>{pct(r[g.group_id] as number | null)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
