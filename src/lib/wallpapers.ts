/**
 * The pictures the glass sits on: three photos from Unsplash, drawn onto a canvas
 * the glass can read. Reading them drives the adaptive ink, the tint density and,
 * in Safari and Firefox, the refraction itself. They are served from this site
 * (public/wallpapers), so the canvas stays readable.
 */

/** Font stacks resolved from next/font, so canvas text matches the page. */
export interface Fonts {
  serif: string;
  sans: string;
}

export interface Wallpaper {
  id: string;
  name: string;
  /** The photo for the stage, and a small one for the picker. */
  full: string;
  thumb: string;
  /** Its colours, shown until the photo has decoded (and as a CSS background meanwhile). */
  stops: string[];
  ink: Ink;
}

export const CARD_WALLPAPERS: Wallpaper[] = [
  {
    id: "glow",
    name: "Glow",
    full: "/wallpapers/glow.webp",
    thumb: "/wallpapers/glow-thumb.webp",
    stops: ["#06080d", "#141c2a", "#3a0d12", "#05070b"],
    ink: { colour: "rgba(255,255,255,0.94)" },
  },
  {
    id: "neon",
    name: "Neon",
    full: "/wallpapers/neon.webp",
    thumb: "/wallpapers/neon-thumb.webp",
    stops: ["#0b0820", "#2a1a5e", "#0b0820"],
    ink: { colour: "rgba(255,255,255,0.94)" },
  },
  {
    id: "folds",
    name: "Folds",
    full: "/wallpapers/folds.webp",
    thumb: "/wallpapers/folds-thumb.webp",
    stops: ["#0a0f3a", "#1f2fa8", "#2a2f8a", "#0b1040"],
    ink: { colour: "rgba(255,255,255,0.94)", shadow: "rgba(0,0,30,0.3)" },
  },
];

/** A CSS gradient in the wallpaper's colours: shown until the photo paints, so the stage never flashes grey. */
export const poster = (wp: Wallpaper) => `linear-gradient(180deg, ${wp.stops.join(", ")})`;

/* ---------- Loading ---------- */

const images = new Map<string, Promise<HTMLImageElement>>();

/** Loads and decodes an image once; later calls share the same promise. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let hit = images.get(src);
  if (!hit) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    hit = img.decode().then(() => img);
    hit.catch(() => images.delete(src));
    images.set(src, hit);
  }
  return hit;
}

/* ---------- Painting ---------- */

/** Fills the canvas with an image, cropped to cover. */
function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const dw = image.naturalWidth * s;
  const dh = image.naturalHeight * s;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Paints the photo (or its colours while it loads) and the lock-screen clock over it. */
export function paintWallpaper(ctx: CanvasRenderingContext2D, w: number, h: number, wp: Wallpaper, image: HTMLImageElement | null, fonts?: Fonts) {
  if (image) {
    cover(ctx, image, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    wp.stops.forEach((c, i) => g.addColorStop(i / (wp.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  lockScreen(ctx, w, h, wp.ink, fonts ?? FALLBACK_FONTS);
}

/* ---------- Lock screen type ---------- */

interface Ink {
  colour: string;
  /** A soft shadow that keeps the type off busy, bright parts of the photo. */
  shadow?: string;
}

/**
 * The date and a large clock, set the way a lock screen sets them: centred, the
 * time huge with tight tracking, the date small above it. It is painted into the
 * picture, so the glass bends and blends it like everything else behind it.
 */
function lockScreen(ctx: CanvasRenderingContext2D, w: number, h: number, ink: Ink, fonts: Fonts) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[ap]\.?m\.?$/i, "");
  const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  const big = Math.round(Math.min(w * 0.24, h * 0.22));
  const small = Math.max(9, Math.round(big * 0.15));
  const top = h * 0.06;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink.colour;
  if (ink.shadow) {
    ctx.shadowColor = ink.shadow;
    ctx.shadowBlur = big * 0.25;
  }
  const track = (em: number, size: number) => {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(em * size).toFixed(2)}px`;
  };

  // Thumbnails are too small for the date: show the time alone.
  if (w >= 200) {
    ctx.font = `500 ${small}px ${fonts.sans}`;
    track(0.01, small);
    ctx.fillText(date, w / 2, top + small);
  }

  ctx.font = `400 ${big}px ${fonts.serif}`;
  track(-0.035, big);
  ctx.fillText(time, w / 2, top + small * 1.35 + big * 0.86);
  ctx.restore();
}

const FALLBACK_FONTS: Fonts = { serif: "Georgia, serif", sans: "system-ui, sans-serif" };
