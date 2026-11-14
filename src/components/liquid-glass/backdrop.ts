import type { Reading } from './material';

/**
 * What a glass surface needs from the thing behind it. Pass one to <GlassProvider>.
 * Use createBackdrop() when the backdrop is a canvas, an image or a video; write
 * your own for anything else.
 */
export interface GlassBackdrop {
  /**
   * Reads the backdrop behind a viewport rectangle. Return null when it can't be
   * read: the surface then takes its ink from the theme and a tint dense enough
   * for any backdrop.
   */
  sample: (rect: Box) => Reading | null;
  /**
   * Subscribes a surface to "something changed" signals and returns an unsubscribe.
   * Listeners are called with no argument when the backdrop changed, or with one
   * surface's root element when only that surface moved.
   */
  watch?: (listener: (target?: Element) => void) => () => void;
  /**
   * The backdrop as a picture, for browsers that can't bend it with a filter
   * (Safari, Firefox): there the lens is drawn from this picture with WebGL.
   * `version` must change whenever the picture's pixels do.
   */
  picture?: () => { image: TexImageSource; rect: Box; version: number } | null;
}

/** The parts of a DOMRect this module uses. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/* ---------- Sampling ---------- */

export interface SampleMap {
  w: number;
  h: number;
  /** RGBA bytes. */
  data: Uint8ClampedArray;
}

/** An element a backdrop can be read from. */
export type BackdropElement = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
type Picture = BackdropElement;

function pictureSize(el: Picture): [number, number] {
  if (el instanceof HTMLImageElement) return [el.naturalWidth, el.naturalHeight];
  if (el instanceof HTMLVideoElement) return [el.videoWidth, el.videoHeight];
  return [el.width, el.height];
}

/** A small copy of the backdrop. Surfaces read this instead of the full picture. */
export function buildSampleMap(source: Picture): SampleMap | null {
  const [sw, sh] = pictureSize(source);
  if (!sw || !sh) return null;
  const w = 160;
  const h = Math.max(1, Math.round((w * sh) / sw));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  } catch {
    // A picture holding cross-origin pixels can't be read.
    return null;
  }
}

const COLS = 5;
const ROWS = 3;
/** Points dropped from each end before averaging, so one glint or one black bar doesn't decide the ink. */
const TRIM = 2;
/** The darkest and brightest spot are found by scanning the whole area, at most this many cells a side. */
const SCAN = 32;

const lumaAt = (map: SampleMap, x: number, y: number) => {
  const k = (y * map.w + x) * 4;
  return (0.299 * map.data[k] + 0.587 * map.data[k + 1] + 0.114 * map.data[k + 2]) / 255;
};

/**
 * Reads what is behind `rect`. `area` is where the backdrop sits on screen, and it
 * must show the whole picture edge to edge (no object-fit cropping).
 */
export function readBackdrop(map: SampleMap, area: Box, rect: Box): Reading | null {
  if (!area.width || !area.height || !rect.width || !rect.height) return null;
  const col = (u: number) => Math.max(0, Math.min(map.w - 1, Math.floor(u * map.w)));
  const row = (v: number) => Math.max(0, Math.min(map.h - 1, Math.floor(v * map.h)));
  const u0 = (rect.left - area.left) / area.width;
  const v0 = (rect.top - area.top) / area.height;
  const du = rect.width / area.width;
  const dv = rect.height / area.height;

  // Ink and density: a 5 x 3 grid with the two darkest and two brightest points dropped.
  const lumas: number[] = [];
  let chroma = 0;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const x = col(u0 + (du * (i + 0.5)) / COLS);
      const y = row(v0 + (dv * (j + 0.5)) / ROWS);
      const k = (y * map.w + x) * 4;
      const r = map.data[k];
      const g = map.data[k + 1];
      const b = map.data[k + 2];
      lumas.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
      chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    }
  }
  lumas.sort((a, b) => a - b);
  const kept = lumas.slice(TRIM, lumas.length - TRIM);

  // Contrast: the true extremes, from every cell under the surface.
  const x0 = col(u0);
  const x1 = col(u0 + du);
  const y0 = row(v0);
  const y1 = row(v0 + dv);
  const sx = Math.max(1, Math.ceil((x1 - x0 + 1) / SCAN));
  const sy = Math.max(1, Math.ceil((y1 - y0 + 1) / SCAN));
  let min = 1;
  let max = 0;
  for (let y = y0; y <= y1; y += sy) {
    for (let x = x0; x <= x1; x += sx) {
      const l = lumaAt(map, x, y);
      if (l < min) min = l;
      if (l > max) max = l;
    }
  }

  return {
    luma: kept.reduce((sum, l) => sum + l, 0) / kept.length,
    texture: lumas[lumas.length - 1] - lumas[0],
    chroma: chroma / lumas.length,
    min,
    max,
  };
}

/* ---------- A ready-made backdrop ---------- */

export interface PictureBackdrop extends Required<GlassBackdrop> {
  /** Call after the picture's pixels change (new image, canvas repaint, video frame). */
  changed: () => void;
  /**
   * Call after surfaces move or the layout shifts under them. Pass one surface's
   * root element when only it moved; pass nothing to refresh them all.
   */
  moved: (target?: Element) => void;
}

/**
 * A backdrop for a canvas, an image or a video that glass surfaces sit on top of.
 * `getPicture` returns the element (or null before it mounts). The element must be
 * readable (same-origin, or served with CORS and loaded with crossOrigin set).
 */
export function createBackdrop(getPicture: () => Picture | null): PictureBackdrop {
  const listeners = new Set<(target?: Element) => void>();
  let map: SampleMap | null = null;
  let version = 0;
  const emit = (target?: Element) => listeners.forEach((listener) => listener(target));

  return {
    sample(rect) {
      const el = getPicture();
      return el && map ? readBackdrop(map, el.getBoundingClientRect(), rect) : null;
    },
    watch(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    picture() {
      const el = getPicture();
      return el && map ? { image: el, rect: el.getBoundingClientRect(), version } : null;
    },
    changed() {
      const el = getPicture();
      map = el ? buildSampleMap(el) : null;
      version += 1;
      emit();
    },
    moved: emit,
  };
}
