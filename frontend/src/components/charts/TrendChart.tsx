import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "@/i18n/I18nProvider";
import { pct } from "@/lib/utils";

export type TrendPoint = { label: string; value: number | null; attempted: number; sessions: number };

function TrendTip({ active, payload }: { active?: boolean; payload?: { payload?: TrendPoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  const t = useT();
  if (!p) return null;
  return (
    <div className="rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-[13px] shadow-[var(--shadow-lift)] backdrop-blur-md">
      <p className="text-[12px] font-semibold text-ink-muted">{p.label}</p>
      <p className="font-bold">{p.value === null ? t("No answers") : t("{p}% right first try", { p: Math.round(p.value) })}</p>
      <p className="text-[12px] text-ink-muted">{t("{n} sessions", { n: p.sessions })} · {t("{n} answers", { n: p.attempted })}</p>
    </div>
  );
}

/**
 * Weekly accuracy as a smooth area in the group's colour. Weeks without answers are gaps,
 * not zeros, so the line never invents a drop.
 */
export function TrendChart({ data, color, label, height = 200 }: { data: TrendPoint[]; color: string; label: string; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const t = useT();
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="4 6" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }} content={(p) => <TrendTip {...(p as object)} />} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fill={`url(#${uid}-fill)`}
            dot={{ r: 4, fill: "#fff", stroke: color, strokeWidth: 2.5 }} activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
            animationDuration={1100} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
      {/* sr-only on a div, not the table: tables ignore the 1px clip and stretched the page below the sidebar */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{t("{n} sessions", { n: d.sessions })}</td><td>{t("{n} answers", { n: d.attempted })}</td><td>{pct(d.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
