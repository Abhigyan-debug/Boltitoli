import { animate, motion, type HTMLMotionProps, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared motion building blocks. All of them respect "reduce motion" (via <MotionConfig> in App
 * and the explicit checks below), so content is always visible and readable without animation.
 */

/** Fades and rises into place the first time it scrolls into view. `delay` staggers siblings. */
export function Reveal({ delay = 0, y = 24, className, children, ...p }: { delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...p}
    >
      {children}
    </motion.div>
  );
}

/**
 * A card that tilts toward the pointer in 3D, with a soft glare following the cursor.
 * Springs keep the motion smooth; on touch screens nothing tilts (no hover) and the card stays flat.
 */
export function TiltCard({ className, children, max = 8, glare = true }: { className?: string; children: ReactNode; max?: number; glare?: boolean }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 18 });
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glareBg = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgb(255 255 255 / 0.35), transparent 45%)`;
  return (
    <motion.div
      className={cn("relative [transform-style:preserve-3d]", className)}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      {children}
      {glare && !reduce && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light" style={{ background: glareBg }} />}
    </motion.div>
  );
}

/** Counts from 0 up to `value` once it scrolls into view. Screen readers get the final value. */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) {
      setShown(value);
      return;
    }
    const c = animate(0, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{shown}{suffix}</span>
      <span className="sr-only">{value}{suffix}</span>
    </span>
  );
}
