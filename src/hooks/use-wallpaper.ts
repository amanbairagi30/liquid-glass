"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBackdrop } from "@/components/liquid-glass";
import { loadImage, paintWallpaper, type Fonts, type Wallpaper } from "@/lib/wallpapers";

/**
 * Paints a wallpaper onto a canvas that fills its parent, and exposes that canvas as
 * a glass backdrop. Shows the wallpaper's colours until its photo has decoded, then
 * repaints; also repaints on resize, once the fonts load, and each minute so the
 * lock-screen clock stays right.
 */
export function useWallpaper(wallpaper: Wallpaper) {
  const { backdrop, ref: attach } = useBackdrop<HTMLCanvasElement>();
  // The element lives in a ref (it gets resized and drawn into); state only says it mounted.
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasEl.current = node;
      attach(node);
      setMounted(node !== null);
    },
    [attach],
  );
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fonts = usePageFonts();
  const minute = useMinute();
  const image = useImage(wallpaper.full);

  useEffect(() => {
    const el = canvasEl.current?.parentElement;
    if (!mounted || !el) return;
    const measure = () =>
      setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  useLayoutEffect(() => {
    const canvas = canvasEl.current;
    if (!mounted || !canvas || !size.w || !size.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintWallpaper(ctx, size.w, size.h, wallpaper, image, fonts ?? undefined);
    backdrop.changed();
  }, [mounted, size.w, size.h, wallpaper, image, backdrop, fonts, minute]);

  return { canvasRef, backdrop };
}

/**
 * next/font hashes family names; read them from the variables it sets on <html>,
 * and wait until the faces have loaded so the canvas doesn't draw a fallback.
 */
export function usePageFonts(): Fonts | null {
  const [fonts, setFonts] = useState<Fonts | null>(null);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const serif = style.getPropertyValue("--font-geist-serif").trim() || "Georgia, serif";
    const sans = style.getPropertyValue("--font-geist-sans").trim() || "system-ui, sans-serif";
    let alive = true;
    Promise.all([document.fonts.load(`400 64px ${serif}`), document.fonts.load(`500 16px ${sans}`)])
      .catch(() => undefined)
      .then(() => alive && setFonts({ serif, sans }));
    return () => {
      alive = false;
    };
  }, []);
  return fonts;
}

/** Ticks on each minute boundary. */
function useMinute() {
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setMinute((m) => m + 1);
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  return minute;
}

/** The decoded image for `src`, or null until it is ready (or if it fails). */
export function useImage(src: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    let alive = true;
    loadImage(src).then(
      (image) => alive && setLoaded({ src, image }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [src]);
  // A previous wallpaper's image never paints under a new one.
  return loaded?.src === src ? loaded.image : null;
}
