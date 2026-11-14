"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { animate, type AnimationPlaybackControls } from "motion";
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Cloud, CloudDrizzle, CloudSun, Compass, Library, MapPin, Pause, Play, Radio as RadioIcon, Search, SkipBack, SkipForward, Sun } from "lucide-react";
import { Glass, GlassProvider, Ink } from "@/components/liquid-glass";
import { ScrubSlider } from "@/components/ui/scrub-slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { useImage, usePageFonts, useWallpaper } from "@/hooks/use-wallpaper";
import { CARD_WALLPAPERS, paintWallpaper, poster, type Wallpaper } from "@/lib/wallpapers";
import { buildPrompt, type PromptSettings } from "@/lib/prompt";

/* ---------- Motion: projection, springs, rubber-banding ---------- */

/** Apple's scroll-deceleration projection: where a flick would come to rest. */
const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

/** Progressive resistance past an edge: the further out, the less it follows. */
const rubberband = (over: number, dimension: number, c = 0.55) => (over * dimension * c) / (dimension + c * Math.abs(over));

const MARGIN = 20;
const DRAG_SLOP = 4;

type Point = { x: number; y: number };

/** Four corners and the centre. */
function snapPoints(sw: number, sh: number, cw: number, ch: number): Point[] {
  const left = MARGIN;
  const right = Math.max(MARGIN, sw - cw - MARGIN);
  const top = MARGIN;
  const bottom = Math.max(MARGIN, sh - ch - MARGIN);
  return [
    { x: (sw - cw) / 2, y: (sh - ch) / 2 },
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
  ];
}

const nearest = (points: Point[], p: Point) =>
  points.reduce((best, q, i) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(points[best].x - p.x, points[best].y - p.y) ? i : best), 0);

/* ---------- The card ---------- */

const HOURS = [
  { t: "Now", icon: CloudSun, deg: 19 },
  { t: "14", icon: Sun, deg: 21 },
  { t: "15", icon: Sun, deg: 22 },
  { t: "16", icon: Cloud, deg: 20 },
  { t: "17", icon: CloudDrizzle, deg: 17 },
];

function WeatherCard() {
  return (
    <Glass radius={34}>
      <div className="p-6">
        <Ink tone={2} className="flex items-center gap-1 text-[13px] font-medium tracking-[0.005em]">
          <MapPin className="size-3.5" aria-hidden />
          Sintra
        </Ink>
        <div className="mt-1 flex items-end justify-between">
          <Ink className="display text-[84px] leading-[0.9] tracking-[-0.035em]">19°</Ink>
          <Ink icon className="mb-2">
            <CloudSun className="size-10" strokeWidth={1.5} aria-hidden />
          </Ink>
        </div>
        <Ink className="mt-2 text-[15px] font-semibold">Partly sunny</Ink>
        <Ink tone={2} className="text-[13px]">
          H 22° · L 13°
        </Ink>
        <Ink tone={3} className="my-4" style={{ height: 1 }}>
          <div className="h-px bg-current" />
        </Ink>
        <ul className="grid grid-cols-5 text-center" aria-label="Next five hours">
          {HOURS.map(({ t, icon: Icon, deg }) => (
            <li key={t} className="grid justify-items-center gap-1.5">
              <Ink tone={2} className="text-[12px] font-medium tabular-nums">
                {t}
              </Ink>
              <Ink icon>
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </Ink>
              <Ink className="text-[14px] font-medium tabular-nums">{deg}°</Ink>
            </li>
          ))}
        </ul>
      </div>
    </Glass>
  );
}

/* ---------- Tab bar ---------- */

const TABS = [
  { label: "Library", icon: Library },
  { label: "Explore", icon: Compass },
  { label: "Radio", icon: RadioIcon },
  { label: "Search", icon: Search },
];

const TAB_PAD = 6;

/**
 * The floating tab bar. The selection is a lighter layer of the same glass that glides
 * on a spring. Above it, a copy of the tabs in full-strength ink is clipped to the pill,
 * so a tab brightens progressively as the pill passes under it instead of switching.
 */
function TabBarCard() {
  const [active, setActive] = useState(0);
  const pos = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      pos.set(active);
      return;
    }
    const glide = animate(pos, active, { type: "spring", bounce: 0, duration: 0.35 });
    return () => glide.stop();
  }, [active, reduceMotion, pos]);

  const seg = `(100% - ${TAB_PAD * 2}px) / ${TABS.length}`;
  const pill = useTransform(pos, (v) => `translateX(${v * 100}%)`);
  const clip = useTransform(
    pos,
    (v) => `inset(${TAB_PAD}px calc(100% - ${TAB_PAD}px - ${v + 1} * ${seg}) ${TAB_PAD}px calc(${TAB_PAD}px + ${v} * ${seg}) round 26px)`,
  );
  const tab = "grid place-content-center justify-items-center gap-0.5 rounded-[26px]";
  const face = (tone: 1 | 2, Icon: (typeof TABS)[number]["icon"], label: string) => (
    <>
      <Ink icon tone={tone}>
        <Icon className="size-[21px]" strokeWidth={2} aria-hidden />
      </Ink>
      <Ink tone={tone} className="text-[10.5px] font-semibold">
        {label}
      </Ink>
    </>
  );

  return (
    <Glass radius={32}>
      <nav aria-label="Tab bar" className="relative grid h-16 grid-cols-4" style={{ padding: TAB_PAD }}>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-[26px] bg-(--lg-row-on) shadow-(--lg-row-stroke)"
          style={{ top: TAB_PAD, bottom: TAB_PAD, left: TAB_PAD, width: `calc(${seg})`, transform: pill }}
        />
        {TABS.map(({ label, icon }, i) => (
          <button
            key={label}
            type="button"
            aria-current={i === active ? "page" : undefined}
            onClick={() => setActive(i)}
            className={`${tab} relative outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60`}
          >
            {face(2, icon, label)}
          </button>
        ))}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-4" style={{ padding: TAB_PAD, clipPath: clip }}>
          {TABS.map(({ label, icon }) => (
            <span key={label} className={tab}>
              {face(1, icon, label)}
            </span>
          ))}
        </motion.div>
      </nav>
    </Glass>
  );
}

/* ---------- Player ---------- */

const TRACK_SECONDS = 214;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Now playing: artwork on a solid layer, everything else in glass ink. */
function PlayerCard() {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(73);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setAt((t) => (t + 1) % TRACK_SECONDS), 1000);
    return () => window.clearInterval(id);
  }, [playing]);
  const skip = (by: number) => setAt((t) => Math.max(0, Math.min(TRACK_SECONDS - 1, t + by)));
  const control = "grid size-11 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60";

  return (
    <Glass radius={30}>
      <div className="grid gap-4 p-4">
        <div className="flex items-center gap-3.5">
          <div
            aria-hidden
            className="size-14 shrink-0 rounded-[12px] shadow-[0_2px_10px_rgb(0_0_0/0.25)]"
            style={{ background: "conic-gradient(from 210deg at 60% 40%, #0a6e4a, #7fd1a6, #f2b33d, #e0563c, #0a6e4a)" }}
          />
          <div className="min-w-0">
            <Ink className="truncate text-[15px] font-semibold">Evergreen</Ink>
            <Ink tone={2} className="truncate text-[13px]">
              Field Notes
            </Ink>
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="relative h-1">
            <Ink tone={3} className="absolute inset-0">
              <div className="h-1 rounded-full bg-current" />
            </Ink>
            <Ink className="absolute inset-y-0 left-0" style={{ width: `${(at / TRACK_SECONDS) * 100}%` }}>
              <div className="h-1 rounded-full bg-current" />
            </Ink>
          </div>
          <div className="flex justify-between text-[11px] tabular-nums">
            <Ink tone={2}>{clock(at)}</Ink>
            <Ink tone={2}>-{clock(TRACK_SECONDS - at)}</Ink>
          </div>
        </div>
        <div className="flex items-center justify-center gap-5">
          <button type="button" aria-label="Back 15 seconds" onClick={() => skip(-15)} className={control}>
            <Ink icon>
              <SkipBack className="size-5" fill="currentColor" aria-hidden />
            </Ink>
          </button>
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((v) => !v)} className={control}>
            <Ink icon>{playing ? <Pause className="size-7" fill="currentColor" aria-hidden /> : <Play className="size-7 translate-x-0.5" fill="currentColor" aria-hidden />}</Ink>
          </button>
          <button type="button" aria-label="Forward 15 seconds" onClick={() => skip(15)} className={control}>
            <Ink icon>
              <SkipForward className="size-5" fill="currentColor" aria-hidden />
            </Ink>
          </button>
        </div>
      </div>
    </Glass>
  );
}

/** What floats on the glass: three surfaces Liquid Glass is used for. */
const VARIANTS = [
  { v: "player", label: "Player", name: "Now playing", width: "w-[min(300px,calc(100%-40px))]", radius: "rounded-[30px]", Card: PlayerCard },
  { v: "weather", label: "Widget", name: "Weather widget", width: "w-[min(300px,calc(100%-40px))]", radius: "rounded-[34px]", Card: WeatherCard },
  { v: "tabs", label: "Tab bar", name: "Tab bar", width: "w-[min(340px,calc(100%-40px))]", radius: "rounded-[32px]", Card: TabBarCard },
] as const;

/* ---------- Panel ---------- */

const CONTRAST = [
  { v: "0", label: "Off" },
  { v: "3", label: "3:1" },
  { v: "4.5", label: "AA" },
  { v: "7", label: "AAA" },
];

const DEFAULTS: PromptSettings & { wallpaper: string } = {
  wallpaper: "glow",
  tint: 0,
  contrast: "4.5",
  edge: 44,
  offset: 0.6,
  dispersion: 0.01,
  blur: 0,
  refraction: true,
  rim: true,
  blend: true,
  shadow: true,
};

/* ---------- Segmented control ---------- */

const SEGMENT_PAD = 3;

/**
 * A single-choice setting: radio semantics (arrow keys move the choice), drawn as a segmented control.
 *
 * The selection is a white pill that glides between options on a spring. Over it sits a
 * second copy of the labels in the selected colour, clipped to the pill's exact shape, so
 * as the pill passes under a label the text changes colour progressively across the letters
 * instead of fading. The glide starts from wherever the pill is, so it can be interrupted.
 */
function Segmented({ labelledBy, value, options, onChange }: { labelledBy: string; value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.v === value));
  const pos = useMotionValue(index);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      pos.set(index);
      return;
    }
    const glide = animate(pos, index, { type: "spring", bounce: 0, duration: 0.3 });
    return () => glide.stop();
  }, [index, reduceMotion, pos]);

  // One segment's width, and the pill's edges, all in the control's own coordinates.
  const seg = `(100% - ${SEGMENT_PAD * 2}px) / ${n}`;
  const pill = useTransform(pos, (p) => `translateX(${p * 100}%)`);
  const clip = useTransform(
    pos,
    (p) => `inset(${SEGMENT_PAD}px calc(100% - ${SEGMENT_PAD}px - ${p + 1} * ${seg}) ${SEGMENT_PAD}px calc(${SEGMENT_PAD}px + ${p} * ${seg}) round 6px)`,
  );

  const grid = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const cell = "grid place-items-center rounded-md text-[13px] font-medium";

  return (
    <div className="relative h-10 rounded-lg bg-black/[0.05]">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-md bg-background shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.06)]"
        style={{ top: SEGMENT_PAD, bottom: SEGMENT_PAD, left: SEGMENT_PAD, width: `calc(${seg})`, transform: pill }}
      />
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as string)}
        aria-labelledby={labelledBy}
        className="relative grid h-full p-[3px]"
        style={grid}
      >
        {options.map((o) => (
          <Radio.Root
            key={o.v}
            value={o.v}
            className={`${cell} cursor-pointer text-foreground/60 transition-[color,box-shadow] duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50`}
          >
            {o.label}
          </Radio.Root>
        ))}
      </RadioGroup>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 grid p-[3px]" style={{ ...grid, clipPath: clip }}>
        {options.map((o) => (
          <span key={o.v} className={`${cell} text-foreground`}>
            {o.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * A settings section. The type does the separating: headings are 14px semibold,
 * control labels below them 13px regular and quieter.
 */
function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 id={id} className="text-[14px] font-semibold tracking-[-0.005em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A control label: the quieter half of the heading/label pair. */
function ControlLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-[13px] text-muted-foreground">
      {children}
    </span>
  );
}

const LAYER_CONTROLS = [
  { key: "refraction", label: "Refraction" },
  { key: "rim", label: "Edge light" },
  { key: "blend", label: "Ink blending" },
  { key: "shadow", label: "Shadow" },
] as const;

/* ---------- Wallpaper picker ---------- */

/** A miniature of a wallpaper, painted the same way as the stage, from its small photo. */
function Thumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fonts = usePageFonts();
  const image = useImage(wallpaper.thumb);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintWallpaper(ctx, w, h, wallpaper, image, fonts ?? undefined);
  }, [wallpaper, image, fonts]);
  return <canvas ref={ref} className="pointer-events-none block aspect-[4/3] w-full" aria-hidden />;
}

/** Like the wallpaper picker in Settings: the picture is the label. */
function WallpaperPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <section className="grid gap-2.5">
      <h2 id="backdrop-label" className="text-[14px] font-semibold tracking-[-0.005em]">
        Backdrop
      </h2>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as string)} aria-labelledby="backdrop-label" className="grid grid-cols-3 gap-3">
        {CARD_WALLPAPERS.map((w) => (
          <Radio.Root
            key={w.id}
            value={w.id}
            aria-label={w.name}
            className="group pressable grid cursor-pointer rounded-[16px] outline-none"
          >
            <span className="overflow-hidden rounded-[14px] ring-1 ring-black/[0.06] transition-shadow duration-200 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50 group-data-[checked]:ring-[2.5px] group-data-[checked]:ring-green group-data-[checked]:ring-offset-2 group-data-[checked]:ring-offset-background">
              <Thumb wallpaper={w} />
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>
    </section>
  );
}

/* ---------- Copy prompt ---------- */

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page without clipboard permission.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** If the clipboard refuses, the prompt appears in a selected text box to copy by hand. */
function CopyPrompt({ settings }: { settings: PromptSettings }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [fallback, setFallback] = useState("");
  const timer = useRef<number>(0);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback) area.current?.select();
  }, [fallback]);

  const copy = async () => {
    const text = buildPrompt(settings);
    window.clearTimeout(timer.current);
    if (await writeClipboard(text)) {
      setFallback("");
      setStatus("copied");
    } else {
      setFallback(text);
      setStatus("failed");
    }
    timer.current = window.setTimeout(() => setStatus("idle"), 1800);
  };

  const label = status === "copied" ? "Copied" : status === "failed" ? "Couldn\u2019t copy" : "Copy prompt";
  return (
    <div className="grid justify-items-start gap-3 sm:justify-items-end">
      <Button onClick={copy} className="h-11 min-w-[8.5rem] rounded-full px-5 text-[14px] hover:bg-green-strong sm:h-10">
        {label}
      </Button>
      {fallback && (
        <textarea
          ref={area}
          readOnly
          value={fallback}
          aria-label="Prompt to copy"
          rows={8}
          className="w-[min(26rem,calc(100vw-2.5rem))] resize-y rounded-xl border border-black/10 bg-white p-3 font-mono text-[16px] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-[13px]"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {status === "copied" ? "Prompt copied to clipboard" : status === "failed" ? "Couldn\u2019t copy. The prompt is selected in the text box below." : ""}
      </span>
    </div>
  );
}

/* ---------- Demo ---------- */

/** The page header sits in a row with the Copy prompt button, which needs the live settings. */
export function CardDemo({ header }: { header: ReactNode }) {
  const [s, setS] = useState(DEFAULTS);
  const [variant, setVariant] = useState<(typeof VARIANTS)[number]["v"]>("player");
  const current = VARIANTS.find((x) => x.v === variant) ?? VARIANTS[0];
  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) => setS((p) => ({ ...p, [k]: v }));

  const wallpaper = CARD_WALLPAPERS.find((w) => w.id === s.wallpaper) ?? CARD_WALLPAPERS[0];
  const { canvasRef, backdrop } = useWallpaper(wallpaper);

  const options = useMemo(
    () => ({
      tint: { light: s.tint },
      contrast: Number(s.contrast),
      edge: s.edge,
      offset: s.offset,
      dispersion: s.dispersion,
      blur: s.blur,
      layers: { refraction: s.refraction, rim: s.rim, blend: s.blend, shadow: s.shadow },
    }),
    [s],
  );

  /* Drag: 1:1 while held, then project the flick and spring to the nearest snap point. */
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const pos = useRef<Point>({ x: 0, y: 0 });
  const running = useRef<AnimationPlaybackControls[]>([]);
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; active: boolean; history: { x: number; y: number; t: number }[] } | null>(null);
  const [snap, setSnap] = useState(0);
  const [placed, setPlaced] = useState(false);
  const reduceMotion = useReducedMotion();

  const geometry = useCallback(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    if (!stage || !card) return null;
    return { sw: stage.clientWidth, sh: stage.clientHeight, cw: card.offsetWidth, ch: card.offsetHeight };
  }, []);

  // Placed with left/top, not transform: a transform would cut the ink blend off from the wallpaper.
  const place = useCallback(
    (p: Point) => {
      const el = cardRef.current;
      if (!el) return;
      pos.current = p;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      backdrop.moved();
    },
    [backdrop],
  );

  const stop = () => {
    running.current.forEach((a) => a.stop());
    running.current = [];
  };

  // Keep the card on its snap point as the stage or card resizes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    if (!stage || !card) return;
    const fit = () => {
      const g = geometry();
      if (!g || drag.current) return;
      stop();
      place(snapPoints(g.sw, g.sh, g.cw, g.ch)[snap]);
      setPlaced(true);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(card);
    return () => ro.disconnect();
  }, [geometry, place, snap]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || e.button !== 0) return; // one pointer at a time
    if ((e.target as Element).closest("button, a, input")) return; // the card's own controls stay clicks
    stop(); // grab it mid-flight: it continues from where it is on screen
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      dx: e.clientX - pos.current.x,
      dy: e.clientY - pos.current.y,
      sx: e.clientX,
      sy: e.clientY,
      active: false,
      history: [{ x: pos.current.x, y: pos.current.y, t: performance.now() }],
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const g = geometry();
    if (!d || !g || e.pointerId !== d.id) return;
    if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return;
    d.active = true;
    const maxX = g.sw - g.cw;
    const maxY = g.sh - g.ch;
    let x = e.clientX - d.dx;
    let y = e.clientY - d.dy;
    if (x < 0) x = rubberband(x, g.sw);
    else if (x > maxX) x = maxX + rubberband(x - maxX, g.sw);
    if (y < 0) y = rubberband(y, g.sh);
    else if (y > maxY) y = maxY + rubberband(y - maxY, g.sh);
    place({ x, y });
    const now = performance.now();
    d.history.push({ x, y, t: now });
    while (d.history.length > 2 && now - d.history[0].t > 100) d.history.shift();
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const g = geometry();
    if (!g || !d.active) return;

    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const vx = ((last.x - first.x) / dt) * 1000;
    const vy = ((last.y - first.y) / dt) * 1000;

    const points = snapPoints(g.sw, g.sh, g.cw, g.ch);
    const target = nearest(points, { x: pos.current.x + project(vx), y: pos.current.y + project(vy) });
    const to = points[target];

    if (reduceMotion) {
      place(to);
    } else {
      // Bounce only when the release carried momentum; X and Y spring independently.
      const flicked = Math.hypot(vx, vy) > 400;
      const spring = { type: "spring" as const, bounce: flicked ? 0.2 : 0, duration: 0.45 };
      running.current = [
        animate(pos.current.x, to.x, { ...spring, velocity: vx, onUpdate: (x) => place({ x, y: pos.current.y }) }),
        animate(pos.current.y, to.y, { ...spring, velocity: vy, onUpdate: (y) => place({ x: pos.current.x, y }) }),
      ];
    }
    setSnap(target);
  };

  // Keyboard: arrows jump between snap points, without animation.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // keys on the card's own controls are theirs
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const g = geometry();
    if (!dir || !g) return;
    e.preventDefault();
    stop();
    const points = snapPoints(g.sw, g.sh, g.cw, g.ch);
    const here = points[snap];
    let best = -1;
    let bestScore = Infinity;
    points.forEach((p, i) => {
      const along = (p.x - here.x) * dir[0] + (p.y - here.y) * dir[1];
      if (i === snap || along <= 1) return;
      const across = Math.abs((p.x - here.x) * dir[1]) + Math.abs((p.y - here.y) * dir[0]);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      place(points[best]);
      setSnap(best);
    }
  };

  return (
    <>
    <div className="mb-14 flex flex-col gap-6 sm:mb-20 sm:flex-row sm:items-start sm:justify-between">
      {header}
      <div className="shrink-0 sm:pt-0.5">
        <CopyPrompt settings={s} />
      </div>
    </div>
    <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
      {/* Stays in view while the settings scroll past on large screens. */}
      <div className="grid content-start gap-6 lg:sticky lg:top-12 lg:self-start">
        {/* The stage sits inset in a white card, the way a preview sits in a gallery. */}
        <div className="rounded-[30px] border border-black/6 bg-white p-2.5 sm:p-3">
        <div ref={stageRef} className="relative h-[520px] overflow-hidden rounded-[20px] sm:rounded-[18px] select-none sm:h-[560px] lg:h-[clamp(400px,calc(100dvh-240px),560px)]" style={{ background: poster(wallpaper) }}>
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
          <GlassProvider theme="light" options={options} backdrop={backdrop}>
            <div
              ref={cardRef}
              role="group"
              tabIndex={0}
              aria-label={`${current.name}. Drag it, or use the arrow keys to move it between corners.`}
              className={`absolute ${current.width} ${current.radius} cursor-grab touch-none pointer-coarse:touch-pan-y outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 active:cursor-grabbing`}
              style={{ visibility: placed ? "visible" : "hidden" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            >
              <current.Card />
            </div>
          </GlassProvider>
        </div>
        </div>
        <div className="grid gap-2">
          <ControlLabel id="variant-label">Preview</ControlLabel>
          <Segmented labelledBy="variant-label" value={variant} options={VARIANTS.map(({ v, label }) => ({ v, label }))} onChange={(v) => setVariant(v as typeof variant)} />
        </div>
      </div>

      <aside className="grid content-start gap-12 lg:pt-1" aria-label="Glass settings">
        <WallpaperPicker value={s.wallpaper} onChange={(v) => set("wallpaper", v)} />

        <Section title="Material">
          <div className="grid gap-y-5">
            <ScrubSlider label="Tint" value={s.tint} suffix="×" digits={2} min={0} max={1.5} step={0.05} onChange={(v) => set("tint", v)} />
            <div className="grid gap-2">
              <ControlLabel id="contrast-label">Text contrast</ControlLabel>
              <Segmented labelledBy="contrast-label" value={s.contrast} options={CONTRAST} onChange={(v) => set("contrast", v)} />
            </div>
          </div>
        </Section>

        {/* Two to a row: the lens settings are read and tuned together. */}
        <Section title="Lens">
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            <ScrubSlider label="Rim width" value={s.edge} suffix="px" min={0} max={72} step={1} onChange={(v) => set("edge", v)} />
            <ScrubSlider label="Bend" value={s.offset} suffix="×" digits={2} min={0} max={2} step={0.05} onChange={(v) => set("offset", v)} />
            <ScrubSlider label="Colour split" value={Math.round(s.dispersion * 100)} prefix="±" suffix="%" min={0} max={40} step={1} onChange={(v) => set("dispersion", v / 100)} />
            <ScrubSlider label="Blur" value={s.blur} suffix="px" digits={1} minDigits={0} min={0} max={10} step={0.5} onChange={(v) => set("blur", v)} />
          </div>
        </Section>

        <Section title="Layers">
          <div className="grid grid-cols-2 gap-3">
            {LAYER_CONTROLS.map(({ key, label }) => (
              // Each layer is a small card on the same grey as the slider tracks; the whole card toggles it.
              <label
                key={key}
                className="grid cursor-pointer justify-items-start gap-2.5 rounded-[12px] bg-black/[0.045] p-3 transition-[background-color,box-shadow] duration-150 ease-out hover:bg-black/[0.065] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
              >
                <span className="text-[13px] text-muted-foreground">{label}</span>
                <Switch checked={s[key]} onCheckedChange={(v) => set(key, v)} />
              </label>
            ))}
          </div>
        </Section>

        <button
          type="button"
          className="relative justify-self-center text-[13px] text-muted-foreground underline decoration-black/15 underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out before:absolute before:-inset-x-2 before:-inset-y-3 hover:text-foreground hover:decoration-black/40 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setS({ ...DEFAULTS, wallpaper: s.wallpaper })}
        >
          Reset to defaults
        </button>
      </aside>
    </div>
    </>
  );
}
