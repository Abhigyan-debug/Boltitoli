import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Small cartoon illustrations drawn as inline SVG (no image downloads, crisp at any size).
 * Decorative only: always aria-hidden.
 */

function Face({ x, skin, hair, shirt, girl = false }: { x: number; skin: string; hair: string; shirt: string; girl?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M2 64 C2 50 10 44 20 44 C30 44 38 50 38 64 Z" fill={shirt} />
      <path d="M14 44 L20 50 L26 44" fill="#ffffff" opacity=".85" />
      {girl && <><circle cx="5" cy="24" r="5.5" fill={hair} /><circle cx="35" cy="24" r="5.5" fill={hair} /></>}
      <circle cx="20" cy="26" r="15" fill={skin} />
      <path d={girl ? "M5 25 C4 10 14 7 20 7 C28 7 36 11 35 25 C31 17 24 15 20 15 C15 15 9 17 5 25 Z" : "M5 24 C5 11 13 7 21 7 C30 7 36 13 35 23 C31 19 27 14 21 14 C15 14 9 18 5 24 Z"} fill={hair} />
      <circle cx="14.5" cy="27" r="2.1" fill="#1f1410" /><circle cx="25.5" cy="27" r="2.1" fill="#1f1410" />
      <circle cx="15.2" cy="26.2" r=".7" fill="#fff" /><circle cx="26.2" cy="26.2" r=".7" fill="#fff" />
      <circle cx="11" cy="32" r="2.4" fill="#f08a7a" opacity=".5" /><circle cx="29" cy="32" r="2.4" fill="#f08a7a" opacity=".5" />
      <path d="M16 33 Q20 37 24 33" stroke="#7a2b22" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Two children side by side, shirts in the group's colour. */
export function KidPair({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 72 64" className={cn("h-14 w-16", className)} aria-hidden>
      <Face x={0} skin="#d39b6a" hair="#2a1a12" shirt={color} girl />
      <Face x={32} skin="#b97d4f" hair="#1d130d" shirt="#ffffff" />
    </svg>
  );
}

/**
 * BoltiToli as a flat CSS speaker, for screens without 3D: glass face, glowing eyes that blink,
 * sound rings while speaking, wide white eyes while the microphone is really open.
 */
export function SpeakerBadge2D({ state = "idle", className }: { state?: "idle" | "speaking" | "listening"; className?: string }) {
  const eye = state === "listening" ? "bg-white h-5 shadow-[0_0_12px_4px_rgb(255_255_255/0.6)]" : "bg-[#3fd4ff] h-4 shadow-[0_0_12px_4px_rgb(63_212_255/0.55)]";
  return (
    <div aria-hidden className={cn("relative h-[68px] w-[96px]", className)}>
      {state === "speaking" && [0, 1].map((i) => (
        <span key={i} className="absolute inset-0 rounded-[26px] border-2 border-[#3fd4ff]/60 animate-[bt-ring_1.6s_ease-out_infinite]" style={{ animationDelay: `${i * 0.8}s` }} />
      ))}
      <div className="relative h-full w-full rounded-[26px] bg-[linear-gradient(160deg,#2a3c6e,#16254a_60%)] p-2 shadow-[0_10px_24px_-10px_rgb(22_37_74/0.7),inset_0_1px_0_rgb(255_255_255/0.2)]">
        <div className="flex h-full items-center justify-center gap-4 rounded-[16px] bg-[#070c1c]">
          {[0, 1].map((i) => <span key={i} className={cn("w-3 rounded-full animate-[bt-blink_3.6s_infinite]", eye)} />)}
        </div>
        <span className="absolute inset-x-3 -bottom-0.5 h-1 rounded-full bg-[#3fd4ff] shadow-[0_0_10px_2px_rgb(63_212_255/0.7)]" />
      </div>
    </div>
  );
}

/** A small village school building with a flag and a tree. */
export function SchoolHouse({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 72" className={cn("h-16 w-20", className)} aria-hidden>
      <ellipse cx="48" cy="66" rx="44" ry="5" fill="#16254a" opacity=".12" />
      <circle cx="82" cy="40" r="11" fill="#57a85a" /><circle cx="76" cy="34" r="8" fill="#3f8f4a" /><rect x="80" y="46" width="3" height="18" rx="1" fill="#8c5f35" />
      <rect x="14" y="30" width="58" height="34" rx="2" fill="#f4e6cf" />
      <path d="M8 32 L43 12 L78 32 Z" fill="#e2483b" /><path d="M8 32 L43 12 L43 16 L13 33 Z" fill="#c8402f" />
      <rect x="37" y="44" width="12" height="20" rx="1.5" fill="#8c5f35" />
      <rect x="20" y="40" width="11" height="10" rx="1.5" fill="#8fc5ea" /><rect x="55" y="40" width="11" height="10" rx="1.5" fill="#8fc5ea" />
      <rect x="42" y="2" width="1.6" height="12" fill="#5a3b1f" />
      <path d="M43.6 2 h9 v2.4 h-9z" fill="#f28a1e" /><path d="M43.6 4.4 h9 v2.4 h-9z" fill="#fff" /><path d="M43.6 6.8 h9 v2.4 h-9z" fill="#1fa287" />
    </svg>
  );
}

/** Isometric toy blocks with digits: the "skill" illustration on cards. */
export function ToyBlocks({ className, digits = ["3", "+", "2"] }: { className?: string; digits?: string[] }) {
  const id = useId();
  const colors = ["#f28a1e", "#3b8fe0", "#1fa287", "#e2483b"];
  return (
    <svg viewBox="0 0 120 92" className={cn("h-20 w-28", className)} aria-hidden>
      <defs>
        <filter id={`${id}-s`} x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#16254a" floodOpacity=".25" /></filter>
      </defs>
      <g filter={`url(#${id}-s)`}>
        {digits.map((d, i) => {
          const x = 8 + i * 36;
          const y = i === 1 ? 26 : 34;
          const c = colors[i % colors.length];
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M0 10 L16 0 L32 10 L16 20 Z" fill={c} style={{ filter: "brightness(1.25)" }} />
              <path d="M0 10 L16 20 L16 48 L0 38 Z" fill={c} style={{ filter: "brightness(.85)" }} />
              <path d="M32 10 L16 20 L16 48 L32 38 Z" fill={c} />
              <text x="24" y="36" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Mukta, sans-serif">{d}</text>
            </g>
          );
        })}
      </g>
      <circle cx="104" cy="14" r="5" fill="#f2b631" /><circle cx="10" cy="16" r="3.5" fill="#3b8fe0" opacity=".6" />
    </svg>
  );
}
