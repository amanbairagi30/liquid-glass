/**
 * The material's numbers and decisions, as plain functions with no browser
 * dependencies. Glass.tsx applies them; material.test.ts checks them.
 */

export type Theme = 'light' | 'dark';

/**
 * light  = light mode, light glass, dark text (the default)
 * shaded = light mode over a dark area: darker glass, light text
 * dark   = dark mode: always light text
 */
export type GlassState = 'light' | 'shaded' | 'dark';

export type InkTone = 'dark' | 'light';

/** What sits behind a surface, each 0–1. */
export interface Reading {
  /** Average brightness, ignoring the extremes. */
  luma: number;
  /** Brightest sample minus darkest: how busy it is. */
  texture: number;
  /** How colourful it is. */
  chroma: number;
  /** Darkest and brightest spot behind the surface. */
  min: number;
  max: number;
}

/**
 * Tint opacity moves between thin and dense with the backdrop. `tintLuma` is the
 * brightness of the tint colour set in glass.css; keep the two in step.
 */
export const MATERIAL: Record<GlassState, { thin: number; dense: number; saturate: number; brightness: number; tintLuma: number }> = {
  light: { thin: 0.06, dense: 0.22, saturate: 1.8, brightness: 1.06, tintLuma: 1 },
  shaded: { thin: 0.1, dense: 0.3, saturate: 1.7, brightness: 0.85, tintLuma: 0.07 },
  dark: { thin: 0.16, dense: 0.38, saturate: 1.6, brightness: 0.8, tintLuma: 0.08 },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ---------- Ink ---------- */

/** Below this brightness a backdrop takes light text. */
export const INK_THRESHOLD = 0.5;
/** The current ink holds within this distance of the threshold, so a surface never flickers at it. */
export const INK_DEAD_ZONE = 0.05;

export function decideInk(luma: number, current: InkTone | null): InkTone {
  if (!current) return luma < INK_THRESHOLD ? 'light' : 'dark';
  if (luma < INK_THRESHOLD - INK_DEAD_ZONE) return 'light';
  if (luma > INK_THRESHOLD + INK_DEAD_ZONE) return 'dark';
  return current;
}

/** Dark mode is always light text. Light mode picks its ink from the backdrop. */
export const stateFor = (theme: Theme, ink: InkTone): GlassState => (theme === 'dark' ? 'dark' : ink === 'light' ? 'shaded' : 'light');

/* ---------- Tint ---------- */

/**
 * 0 thin, 1 dense. Thicker when the backdrop is close to the ink's own brightness,
 * busy, or colourful. An unreadable backdrop gets the dense tint.
 */
export function densityFor(state: GlassState, reading: Reading | null): number {
  if (!reading) return 1;
  const closeness = state === 'light' ? 1 - reading.luma : reading.luma;
  return clamp01(0.55 * closeness + 0.7 * reading.texture + 0.3 * reading.chroma);
}

/** Share of the saturation boost kept. A vivid backdrop keeps less, so it doesn't stain the glass. */
export const saturationKept = (reading: Reading | null) => (reading ? Math.max(0.45, 1 - 0.75 * reading.chroma) : 1);

/* ---------- Contrast ---------- */

/** WCAG relative luminance of a grey, 0–1. */
const luminance = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** WCAG contrast ratio between two greys, 1–21. */
export function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Brightness of primary ink once drawn over a glass of brightness `glass`:
 * black at 86% multiplied in on light glass, white at 94% added on the others.
 * Unblended ink lands on the same or a safer value.
 */
export const inkOver = (state: GlassState, glass: number) => (state === 'light' ? glass * (1 - 0.86) : Math.min(1, glass + 0.94));

const limits = new Map<string, number>();

/**
 * The glass brightness at which primary ink just meets `ratio`: the darkest
 * acceptable glass for dark ink, the brightest acceptable for light ink.
 */
export function glassLimit(state: GlassState, ratio: number): number {
  const key = `${state}|${ratio}`;
  const hit = limits.get(key);
  if (hit !== undefined) return hit;
  const passes = (v: number) => contrastRatio(inkOver(state, v), v) >= ratio;
  const darkInk = state === 'light';
  // Dark ink gains contrast as the glass brightens; light ink as it darkens.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid) === darkInk) hi = mid;
    else lo = mid;
  }
  const limit = darkInk ? hi : lo;
  limits.set(key, limit);
  return limit;
}

/** The floor never makes the glass fully opaque. */
const MAX_FLOOR = 0.92;

/**
 * The smallest tint opacity at which primary ink meets `ratio` over the worst spot
 * behind the surface: the darkest for dark ink, the brightest for light ink. An
 * unreadable backdrop is assumed to be the worst case (pure black or pure white).
 *
 * It works on brightness alone and on what the sampler saw, so treat it as a strong
 * safeguard, not a proof: check real content with a contrast tool.
 */
export function contrastFloor(state: GlassState, reading: Reading | null, brightness: number, ratio: number): number {
  if (ratio <= 1) return 0;
  const darkInk = state === 'light';
  const worst = reading ? (darkInk ? reading.min : reading.max) : darkInk ? 0 : 1;
  const seen = clamp01(worst * brightness);
  const limit = glassLimit(state, ratio);
  const tint = MATERIAL[state].tintLuma;
  if (darkInk ? seen >= limit : seen <= limit) return 0;
  return Math.min(MAX_FLOOR, clamp01((limit - seen) / (tint - seen)));
}

/* ---------- Lens ---------- */

/** Surfaces with a short side under this get no lens. */
export const MIN_LENS_SIDE = 32;

/** Above this area (px²) a surface gets one bend pass instead of three: no colour split. */
export const SPLIT_MAX_AREA = 200_000;

/** Rim width for a surface: about 44px on a card, narrower on small pieces, never under 4px. */
export const rimWidth = (edge: number, w: number, h: number) => Math.max(4, Math.min(edge, Math.min(w, h) / 3.5));

/**
 * Corner radius of the bend field: at least as large as the rim, or the bend
 * direction would flip along each corner's diagonal and show a crease.
 */
export const fieldRadius = (radius: number, rim: number, w: number, h: number) =>
  Math.max(1, Math.min(Math.round(Math.max(radius, rim)), Math.floor(w / 2), Math.floor(h / 2)));
