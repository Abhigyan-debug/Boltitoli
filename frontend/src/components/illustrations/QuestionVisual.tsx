import { lazy, type ReactNode, Suspense, useState } from "react";
import type { SpeakerState } from "@/components/three/BoltiToliSpeaker";
import { renderTier } from "@/components/three/capability";
import { ThreeBoundary } from "@/components/three/ThreeBoundary";
import type { Question } from "@/types/api";
import { SpeakerBadge2D } from "./Cartoons";
import { Bundles2D, CountingObjects2D, NumberLine2D } from "./CountingObjects2D";

const CountingScene3D = lazy(() => import("@/components/three/CountingScene3D"));

/**
 * Picks the right illustration for a question. Always agrees with the question data.
 * `speaker` (live session only) adds BoltiToli: inside the 3D scene, or as a flat badge with 2D visuals.
 */
export function QuestionVisual({ question, phase, allow3d = true, speaker }: { question: Question; phase: "question" | "reveal"; allow3d?: boolean; speaker?: SpeakerState }) {
  const v = question.visual;
  const [tier] = useState(renderTier);
  const flat = (node: ReactNode) =>
    speaker ? (
      <div className="relative h-full w-full">
        {node}
        <SpeakerBadge2D state={speaker} className="absolute bottom-1 right-1 hidden scale-90 sm:block" />
      </div>
    ) : node;

  if (!v) {
    const a = question.operands.a as number | undefined;
    const b = question.operands.b as number | undefined;
    return flat(
      <div className="flex h-full items-center justify-center gap-4 font-chalk text-[44px] text-slate-800" aria-hidden>
        {a !== undefined && b !== undefined && (
          <>
            <span>{a}</span>
            <span>{question.kind.endsWith("sub") ? "−" : "+"}</span>
            <span>{b}</span>
            <span>=</span>
            <span>{phase === "reveal" ? question.expected_answer : "?"}</span>
          </>
        )}
      </div>,
    );
  }
  switch (v.type) {
    case "objects": {
      const fallback = flat(<CountingObjects2D visual={v} phase={phase} />);
      if (allow3d && tier === "3d")
        return (
          <ThreeBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <div className="h-full w-full min-h-48"><CountingScene3D object={v.object} groups={v.groups} op={v.op} remove={v.remove} phase={phase} speaker={speaker} /></div>
            </Suspense>
          </ThreeBoundary>
        );
      return fallback;
    }
    case "bundles":
      return flat(<Bundles2D tens={v.tens} ones={v.ones} remove={v.remove} phase={phase} />);
    case "bundles_add":
      return flat(
        <div className="flex h-full w-full items-center justify-center gap-3">
          <div className="h-full flex-1"><Bundles2D tens={v.a[0]} ones={v.a[1]} phase="question" /></div>
          <span className="text-4xl font-extrabold text-slate-800">+</span>
          <div className="h-full flex-1"><Bundles2D tens={v.b[0]} ones={v.b[1]} phase="question" /></div>
        </div>,
      );
    case "number_line":
      return flat(<NumberLine2D {...v} answer={question.expected_answer} phase={phase} />);
    case "compare":
      return flat(
        <div className="flex h-full items-center justify-center gap-6">
          {v.values.map((n) => {
            const big = phase === "reveal" && n === Math.max(...v.values);
            return (
              <div key={n} className={`grid size-28 place-items-center rounded-[var(--radius-lg)] border-4 font-chalk text-[52px] transition-colors ${big ? "border-success-700 bg-success-100 text-success-700" : "border-wood-500 bg-wood-100 text-slate-800"}`}>
                {n}
              </div>
            );
          })}
        </div>,
      );
  }
}
