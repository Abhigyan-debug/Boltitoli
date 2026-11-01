/**
 * Decide whether this device should render 3D at all.
 * Low-cost school phones get the 2D illustration: 3D is never required to run a lesson.
 */
export type RenderTier = "3d" | "2d";

let cached: RenderTier | null = null;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function renderTier(): RenderTier {
  if (cached) return cached;
  if (typeof window === "undefined") return "2d";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const forced = new URLSearchParams(window.location.search).get("render");
  if (forced === "2d" || forced === "3d") return (cached = forced);
  try {
    const pref = localStorage.getItem("bt-render");
    if (pref === "2d" || pref === "3d") return (cached = pref);
  } catch {
    /* storage blocked */
  }
  // slow networks also get 2D: the 3D library is ~245 KB compressed, seconds of waiting on 3G
  const slowNet = ["slow-2g", "2g", "3g"].includes(nav.connection?.effectiveType ?? "");
  const lowEnd =
    (nav.hardwareConcurrency ?? 4) <= 2 || (nav.deviceMemory ?? 4) <= 2 || nav.connection?.saveData === true || slowNet;
  cached = !lowEnd && webglAvailable() ? "3d" : "2d";
  return cached;
}

export function setRenderPreference(tier: RenderTier | null) {
  try {
    if (tier) localStorage.setItem("bt-render", tier);
    else localStorage.removeItem("bt-render");
  } catch {
    /* ignore */
  }
  cached = null;
}
