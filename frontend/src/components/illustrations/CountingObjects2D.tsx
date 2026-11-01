import { motion } from "framer-motion";
import type { ReactElement } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Visual } from "@/types/api";

/**
 * 2D counting objects that always agree with the question.
 * phase "question": groups shown apart; "reveal": addition groups slide
 * together / subtracted objects leave, so the answer can be counted.
 */

const ICONS: Record<string, (k: string) => ReactElement> = {
  apple: (k) => (
    <g key={k}>
      <path d="M20 9c-3-3-9-3-12 1-4 5-2 15 4 19 2 1 4 1 6 0 2 1 4 1 6 0 6-4 8-14 4-19-3-4-6-3-8-1z" fill="#c8402f" />
      <path d="M20 9c0-3 1-5 3-6" stroke="#5a3b1f" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M22 6c3-2 6-1 7 1-3 1-5 1-7-1z" fill="#4f8a3c" />
      <ellipse cx="13" cy="15" rx="2.5" ry="4" fill="#fff" opacity=".25" />
    </g>
  ),
  mango: (k) => (
    <g key={k}>
      <path d="M8 22c-2-9 6-17 15-15 7 2 9 11 4 18-4 5-16 6-19-3z" fill="#f0a72e" />
      <path d="M22 8c4-5 7 0 7 0-3 1-5 1-7 0z" fill="#4f8a3c" />
      <ellipse cx="14" cy="16" rx="3" ry="5" fill="#fff" opacity=".22" transform="rotate(-30 14 16)" />
    </g>
  ),
  ball: (k) => (
    <g key={k}>
      <circle cx="20" cy="19" r="12" fill="#0f7f77" />
      <path d="M8 19h24M20 7c-5 4-5 20 0 24M20 7c5 4 5 20 0 24" stroke="#f7f3ec" strokeWidth="2" fill="none" />
    </g>
  ),
  stick: (k) => (
    <g key={k}>
      <rect x="18" y="3" width="4" height="32" rx="2" fill="#d9ad73" />
      <rect x="18" y="3" width="4" height="4" rx="2" fill="#9a6a3b" />
    </g>
  ),
  laddoo: (k) => (
    <g key={k}>
      <circle cx="20" cy="20" r="11" fill="#e8a23a" />
      {[[15, 16], [23, 14], [19, 23], [25, 22], [14, 24]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.4" fill="#b8761b" />
      ))}
    </g>
  ),
  leaf: (k) => (
    <g key={k}>
      <path d="M6 30C6 14 18 5 34 6c0 16-11 26-28 24z" fill="#5a9a46" />
      <path d="M8 28L30 9" stroke="#3d6e2f" strokeWidth="1.6" />
    </g>
  ),
};

const SIZE = 40;

function grid(n: number, cols: number) {
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) * SIZE, y: Math.floor(i / cols) * SIZE }));
}

export function CountingObjects2D({ visual, phase }: { visual: Extract<Visual, { type: "objects" }>; phase: "question" | "reveal" }) {
  const reduce = useReducedMotion();
  const icon = ICONS[visual.object] ?? ICONS.ball;
  const t = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 18 };
  const groups = visual.groups;
  const total = groups.reduce((a, b) => a + b, 0);
  const cols = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(Math.max(...groups)))));
  const merged = phase === "reveal" && visual.op === "+";
  const removing = visual.op === "-" ? visual.remove ?? 0 : 0;

  // Positions: each group is its own grid; when merged, all objects form one grid.
  const gap = SIZE * 1.6;
  const groupWidth = cols * SIZE;
  const items: { key: string; x: number; y: number; gone: boolean }[] = [];
  let idx = 0;
  groups.forEach((n, gi) => {
    grid(n, cols).forEach((p, i) => {
      const mergedPos = grid(total, cols)[idx];
      const apart = { x: gi * (groupWidth + gap) + p.x, y: p.y };
      const isRemoved = visual.op === "-" && i >= n - removing;
      items.push({
        key: `${gi}-${i}`,
        x: merged ? mergedPos.x + (groupWidth + gap) / 2 : apart.x,
        y: merged ? mergedPos.y : apart.y,
        gone: isRemoved && phase === "reveal",
      });
      idx += 1;
    });
  });
  const rows = Math.ceil(Math.max(...groups, merged ? total : 0) / cols);
  const width = groups.length * groupWidth + (groups.length - 1) * gap;
  const height = rows * SIZE + 8;
  const plusX = groupWidth + gap / 2;

  return (
    <svg viewBox={`-6 -4 ${width + 12} ${height + 8}`} className="h-full w-full max-h-56" role="img"
      aria-label={visual.op === "+" ? `${groups[0]} and ${groups[1]} objects` : visual.op === "-" ? `${groups[0]} objects, ${removing} taken away` : `${groups[0]} objects`}>
      {groups.length === 2 && (
        <motion.text x={plusX} y={(rows * SIZE) / 2 + 12} textAnchor="middle" fontSize="38" fontWeight="800" fill="var(--color-slate-800)"
          animate={{ opacity: merged ? 0 : 1 }} transition={t}>
          {visual.op === "+" ? "+" : "−"}
        </motion.text>
      )}
      {items.map((it) => (
        <motion.g key={it.key} initial={false}
          animate={{ x: it.gone ? it.x + 30 : it.x, y: it.gone ? it.y - 24 : it.y, opacity: it.gone ? 0.18 : 1 }}
          transition={t}>
          {icon(it.key)}
          {visual.op === "-" && it.gone && <path d="M6 6L34 34" stroke="#a3392a" strokeWidth="3" strokeLinecap="round" />}
        </motion.g>
      ))}
    </svg>
  );
}

/** Tens bundles (10 sticks tied) and loose ones. */
export function Bundles2D({ tens, ones, remove = 0, phase }: { tens: number; ones: number; remove?: number; phase: "question" | "reveal" }) {
  const reduce = useReducedMotion();
  const bundleW = 46;
  const width = tens * bundleW + ones * 14 + 30;
  let removeLeft = phase === "reveal" ? remove : 0;
  const looseGone = Math.min(ones, removeLeft);
  removeLeft -= looseGone;
  return (
    <svg viewBox={`0 0 ${Math.max(width, 120)} 92`} className="h-full w-full max-h-48" role="img" aria-label={`${tens} tens and ${ones} ones`}>
      {Array.from({ length: tens }).map((_, b) => (
        <g key={b} transform={`translate(${b * bundleW + 4},6)`} opacity={b >= tens - Math.ceil(removeLeft / 10) && removeLeft > 0 ? 0.35 : 1}>
          {Array.from({ length: 10 }).map((__, s) => <rect key={s} x={s * 3.4} y={0} width={3} height={78} rx={1.4} fill="#d9ad73" />)}
          <rect x={-2} y={34} width={38} height={7} rx={2} fill="#c2553c" />
        </g>
      ))}
      {Array.from({ length: ones }).map((_, i) => (
        <motion.rect key={i} x={tens * bundleW + 20 + i * 14} y={6} width={5} height={78} rx={2.4} fill="#d9ad73" initial={false}
          animate={{ opacity: i >= ones - looseGone ? 0.15 : 1, y: i >= ones - looseGone ? -6 : 6 }}
          transition={reduce ? { duration: 0 } : { duration: 0.4 }} />
      ))}
    </svg>
  );
}

export function NumberLine2D({ from, to, highlight, ask, answer, phase }: {
  from: number; to: number; highlight: number; ask: "before" | "after"; answer: number; phase: "question" | "reveal";
}) {
  const n = to - from + 1;
  const step = 52;
  return (
    <svg viewBox={`0 0 ${n * step + 20} 90`} className="h-full w-full max-h-40" role="img" aria-label={`Number line from ${from} to ${to}`}>
      <line x1="10" x2={n * step + 10} y1="40" y2="40" stroke="var(--color-slate-800)" strokeWidth="3" />
      {Array.from({ length: n }).map((_, i) => {
        const v = from + i;
        const isH = v === highlight;
        const isA = v === answer;
        const hidden = isA && phase === "question";
        return (
          <g key={v} transform={`translate(${10 + i * step + step / 2},0)`}>
            <line y1="32" y2="48" stroke="var(--color-slate-800)" strokeWidth="3" />
            <circle cy="70" r="16" fill={isH ? "var(--color-saffron-100)" : isA && !hidden ? "var(--color-success-100)" : "transparent"}
              stroke={isH ? "var(--color-saffron-500)" : "transparent"} strokeWidth="2" />
            <text y="76" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--color-ink)">{hidden ? "?" : v}</text>
          </g>
        );
      })}
      <text x="10" y="18" fontSize="13" fill="var(--color-ink-muted)">{ask === "after" ? "बाद में →" : "← पहले"}</text>
    </svg>
  );
}
