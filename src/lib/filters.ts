// ---- AUD FX beauty engine ----
// A genuine skin-smoothing "glow", not a dumb full-frame blur.
//
// Technique (frequency-separation style, done cheaply):
//   sharp base  +  a blurred, slightly-brightened copy blended with SOFT-LIGHT.
// Soft-light of an image with a blurred version of itself reduces LOCAL contrast
// on flat areas (skin -> marks/spots/pores fade & tone evens out) while high-
// contrast edges (eyes, lashes, hair, outline) are barely touched, so the face
// stays crisp. A whisper of a brightened "screen" pass adds a healthy radiance.
//
// For live PREVIEW this is done with two GPU-composited <video> layers (see
// BeautyVideo) => zero per-frame JS => perfectly smooth.
// For EXPORT the identical look is baked with drawBeauty() on a canvas.

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---- shared parameters so preview & export match exactly ----
export function beautyParams(intensity: number) {
  const i = clamp01(intensity);
  return {
    i,
    blurPx: 2 + i * 6, // softening radius
    bright: 1 + i * 0.08, // gentle lift
    sat: 1 + i * 0.1, // healthy color
    softAlpha: i * 0.72, // skin-smoothing strength
    glowAlpha: i * 0.16, // radiance
  };
}

// CSS filter string for the blurred overlay layer (preview)
export function beautyOverlayFilter(intensity: number): string {
  const p = beautyParams(intensity);
  return `blur(${p.blurPx.toFixed(2)}px) brightness(${p.bright.toFixed(3)}) saturate(${p.sat.toFixed(3)})`;
}

// ---- export baking ----
// The blurred overlay is rendered at a DOWNSCALED resolution: a gaussian blur's
// cost grows with pixel-count * radius, so blurring a small canvas and scaling it
// up is dramatically cheaper (and looks identical since it's blurred anyway).
// This keeps the export main-thread light so captured audio never crackles.
const DS = 0.4; // downscale factor for the blur pass
let scratch: HTMLCanvasElement | null = null;
let sctx: CanvasRenderingContext2D | null = null;
function getScratch(w: number, h: number) {
  if (!scratch) {
    scratch = document.createElement("canvas");
    sctx = scratch.getContext("2d");
  }
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return sctx!;
}

export function drawBeauty(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
  intensity: number
) {
  const p = beautyParams(intensity);

  // sharp base
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.drawImage(source, 0, 0, w, h);

  if (p.i < 0.02) return;

  // blurred copy at low res
  const sw = Math.max(2, Math.round(w * DS));
  const sh = Math.max(2, Math.round(h * DS));
  const s = getScratch(sw, sh);
  s.globalAlpha = 1;
  s.globalCompositeOperation = "source-over";
  s.filter = `blur(${(p.blurPx * DS).toFixed(2)}px) brightness(${p.bright.toFixed(3)}) saturate(${p.sat.toFixed(3)})`;
  s.drawImage(source, 0, 0, sw, sh);
  s.filter = "none";

  ctx.imageSmoothingEnabled = true;

  // soft-light smoothing pass (upscaled)
  ctx.filter = "none";
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = p.softAlpha;
  ctx.drawImage(scratch as HTMLCanvasElement, 0, 0, sw, sh, 0, 0, w, h);

  // subtle radiance
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = p.glowAlpha;
  ctx.drawImage(scratch as HTMLCanvasElement, 0, 0, sw, sh, 0, 0, w, h);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
}
