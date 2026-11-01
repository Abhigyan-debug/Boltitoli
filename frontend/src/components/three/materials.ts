import * as THREE from "three";

/** Small canvas textures drawn once; no image files are downloaded. */

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Wood grain: warm base with soft darker streaks. */
export function woodTexture(tone = "#c48d58") {
  return canvasTexture(`wood-${tone}`, 512, 512, (ctx) => {
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, 512, 512);
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * 512;
      ctx.strokeStyle = `rgba(90,52,24,${0.05 + rnd() * 0.09})`;
      ctx.lineWidth = 1 + rnd() * 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 4 + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
  });
}

/** A face for a number block: chalk-coloured digit on the wood. */
export function blockFaceTexture(label: string) {
  return canvasTexture(`block-${label}`, 256, 256, (ctx) => {
    ctx.drawImage(woodTexture("#d39c63").image as HTMLCanvasElement, 0, 0, 256, 256);
    ctx.fillStyle = "#16254a";
    ctx.font = "700 170px Mukta, 'Noto Sans Devanagari', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 128, 140);
  });
}

/** Green-black classroom board with chalk writing (Kalam); optional heading and chalk-drawn apples. */
export function chalkboardTexture(text: string, heading = "", apples: [number, number] | null = null) {
  return canvasTexture(`board-${heading}-${text}-${apples}`, 1024, 640, (ctx) => {
    ctx.fillStyle = "#2b3a35";
    ctx.fillRect(0, 0, 1024, 640);
    const g = ctx.createRadialGradient(300, 200, 40, 300, 200, 700);
    g.addColorStop(0, "rgba(255,255,255,0.09)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 640);
    // faint smudges of erased chalk
    ctx.strokeStyle = "rgba(245,244,239,0.06)";
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(120, 560);
    ctx.bezierCurveTo(300, 520, 600, 600, 900, 540);
    ctx.stroke();
    ctx.fillStyle = "rgba(245,244,239,0.94)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (heading) {
      ctx.font = "700 92px Kalam, cursive";
      ctx.fillText(heading, 512, 105);
    }
    ctx.font = `700 ${heading ? 150 : 190}px Kalam, cursive`;
    ctx.fillText(text, 512, heading ? 270 : 330);
    if (apples) {
      // chalk outline apples, e.g. 3 then 2, matching the sum on the board
      ctx.strokeStyle = "rgba(245,244,239,0.9)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      const apple = (x: number, y: number) => {
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.bezierCurveTo(x - 20, y - 48, x - 58, y - 30, x - 52, y + 6);
        ctx.bezierCurveTo(x - 46, y + 44, x - 16, y + 56, x, y + 42);
        ctx.bezierCurveTo(x + 16, y + 56, x + 46, y + 44, x + 52, y + 6);
        ctx.bezierCurveTo(x + 58, y - 30, x + 20, y - 48, x, y - 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.quadraticCurveTo(x + 4, y - 50, x + 14, y - 60);
        ctx.stroke();
      };
      const [a, b] = apples;
      for (let i = 0; i < a; i++) apple(150 + i * 120, 470);
      for (let i = 0; i < b; i++) apple(640 + i * 120, 470);
    }
  });
}

/** Soft round glow, drawn once; used with additive blending as a cheap bloom. */
export function glowTexture() {
  return canvasTexture("glow", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** White wordmark on transparent, for the speaker's front. */
export function labelTexture(text: string) {
  return canvasTexture(`label-${text}`, 512, 128, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 72px Mukta, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
  });
}

/** Speaker grille: dense dot grid. */
export function grilleTexture() {
  return canvasTexture("grille", 256, 256, (ctx) => {
    ctx.fillStyle = "#16213f";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let y = 8; y < 256; y += 12) for (let x = 8 + ((y / 12) % 2) * 6; x < 256; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export const PALETTE = {
  indigo: "#16254a",
  indigoSoft: "#22345e",
  chalk: "#f7f3ec",
  teal: "#0f7f77",
  saffron: "#f28a1e",
  glow: "#3fd4ff",
  wood: "#b5804e",
  woodLight: "#e2bb86",
};
