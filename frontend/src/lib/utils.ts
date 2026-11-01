import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Level } from "@/types/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `color` is the level's chart/card colour (CSS variable); `tint` its light background utility. */
export const LEVELS: Record<Level, { en: string; hi: string; tally: number; color: string; tint: string }> = {
  beginner: { en: "Beginner", hi: "शुरुआती", tally: 1, color: "var(--color-udaan)", tint: "bg-saffron-100" },
  developing: { en: "Developing", hi: "विकसित हो रहे", tally: 2, color: "var(--color-pragati)", tint: "bg-sky-100" },
  advancing: { en: "Advancing", hi: "आगे बढ़ रहे", tally: 3, color: "var(--color-tarang)", tint: "bg-teal-100" },
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function fmtDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}
export function fmtDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}
export function fmtClock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
type Tr = (en: string, vars?: Record<string, string | number>) => string;
const fill: Tr = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m: string, k: string) => String(v[k] ?? m)) : s);

/** Pass the `t` from useT() to get the current interface language; defaults to English. */
export function daysAgo(iso: string | null | undefined, t: Tr = fill): string {
  if (!iso) return t("No sessions yet");
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return t("Today");
  if (d === 1) return t("Yesterday");
  return t("{n} days ago", { n: d });
}
export function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${Math.round(n)}%`;
}
