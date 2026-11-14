"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createBackdrop, type BackdropElement, type GlassBackdrop } from './backdrop';
import { loadDisplacementMap, MAP_SCALE } from './displacement';
import { coarsePointer, supportsFilterLens } from './env';
import { canDrawLens, drawLens } from './lensgl';
import {
  contrastFloor,
  decideInk,
  densityFor,
  fieldRadius,
  MATERIAL,
  MIN_LENS_SIDE,
  rimWidth,
  saturationKept,
  SPLIT_MAX_AREA,
  stateFor,
  type GlassState,
  type InkTone,
  type Reading,
  type Theme,
} from './material';

/** Layout effects warn on a server in older React; there the plain effect does nothing either way. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ---------- Options and provider ---------- */

export const LAYERS = ['shadow', 'blur', 'refraction', 'tint', 'rim', 'blend'] as const;
export type Layer = (typeof LAYERS)[number];

export interface GlassOptions {
  /** Tint strength per theme, 0–1.5. 1 is the material as designed. */
  tint: Record<Theme, number>;
  /**
   * Contrast the primary ink must keep against the glass, as a WCAG ratio. The tint
   * thickens where the backdrop would otherwise break it. 4.5 is WCAG AA for body
   * text, 3 is AA for large text, 7 is AAA, 0 turns the safeguard off.
   */
  contrast: number;
  /** Width of the rim lens on a card, px. Small surfaces get a narrower one. */
  edge: number;
  /** Largest bend, as a multiple of the rim width. */
  offset: number;
  /** Red bends this much more than green, blue this much less (0.15 = ±15%). */
  dispersion: number;
  /** Backdrop blur, px. */
  blur: number;
  /** Switches for the individual layers, mostly for demos and debugging. */
  layers: Record<Layer, boolean>;
}

export const DEFAULT_OPTIONS: GlassOptions = {
  tint: { light: 1, dark: 1 },
  contrast: 4.5,
  edge: 44,
  offset: 1.1,
  dispersion: 0.15,
  blur: 2,
  layers: { shadow: true, blur: true, refraction: true, tint: true, rim: true, blend: true },
};

type ThemeSetting = 'system' | Theme;

interface Env {
  options: GlassOptions;
  theme: ThemeSetting;
  backdrop: GlassBackdrop | null;
}

const DEFAULT_ENV: Env = { options: DEFAULT_OPTIONS, theme: 'system', backdrop: null };
const GlassContext = createContext<Env>(DEFAULT_ENV);

interface ProviderProps {
  /** 'system' follows the visitor's light/dark setting. */
  theme?: ThemeSetting;
  options?: Partial<Omit<GlassOptions, 'tint' | 'layers'>> & { tint?: Partial<Record<Theme, number>>; layers?: Partial<Record<Layer, boolean>> };
  /** What the glass sits on. Without one, surfaces can't adapt to the backdrop and Safari/Firefox get no lens. */
  backdrop?: GlassBackdrop | null;
  children: ReactNode;
}

/**
 * Optional. <Glass> works without it, using the defaults and the system theme.
 * Wrap a region in it to set the theme, change the options or connect a backdrop.
 */
export function GlassProvider({ theme = 'system', options, backdrop = null, children }: ProviderProps) {
  const env = useMemo<Env>(
    () => ({
      theme,
      backdrop,
      options: {
        ...DEFAULT_OPTIONS,
        ...options,
        tint: { ...DEFAULT_OPTIONS.tint, ...options?.tint },
        layers: { ...DEFAULT_OPTIONS.layers, ...options?.layers },
      },
    }),
    [theme, backdrop, options],
  );
  return <GlassContext.Provider value={env}>{children}</GlassContext.Provider>;
}

const subscribeScheme = (onChange: () => void) => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

/**
 * A backdrop for a canvas, image or video, plus the ref to put on that element.
 * Call `backdrop.changed()` when its pixels change and `backdrop.moved()` when
 * glass moves over it.
 */
export function useBackdrop<T extends BackdropElement>() {
  const [state] = useState(() => {
    let element: T | null = null;
    return {
      backdrop: createBackdrop(() => element),
      ref: (node: T | null) => {
        element = node;
      },
    };
  });
  return state;
}

/** Follows the system light/dark setting. Renders 'light' on a server. */
export function useSystemTheme(): Theme {
  const dark = useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );
  return dark ? 'dark' : 'light';
}

/** How this browser will draw the rim lens, given whether a backdrop picture is available. */
export type LensMode = 'filter' | 'gl' | 'none';
export const lensMode = (hasPicture: boolean): LensMode => (supportsFilterLens() ? 'filter' : hasPicture && canDrawLens() ? 'gl' : 'none');

/**
 * Without the lens, a 2px blur and a thin tint barely read as glass. Browsers that
 * can't draw the lens get a deeper blur and a slightly denser tint instead.
 */
const FALLBACK_BLUR = 4;
const FALLBACK_TINT = 0.08;

/** A reading has to move this far before the tint follows it. */
const READ_STEP = 0.02;

const moved = (a: Reading, b: Reading) =>
  Math.abs(a.luma - b.luma) > READ_STEP ||
  Math.abs(a.texture - b.texture) > READ_STEP ||
  Math.abs(a.chroma - b.chroma) > READ_STEP ||
  Math.abs(a.min - b.min) > READ_STEP ||
  Math.abs(a.max - b.max) > READ_STEP;

function recall(key: string): InkTone | null {
  try {
    const v = window.localStorage.getItem(`lg-ink:${key}`);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

/* ---------- Glass ---------- */

export interface GlassInfo {
  state: GlassState;
  /** null when the backdrop could not be read. */
  reading: Reading | null;
  /** 0 thin, 1 dense. */
  density: number;
  /** Tint opacity in use, 0–1. */
  tint: number;
  /** The tint opacity the contrast safeguard asked for, 0 when it had nothing to do. */
  floor: number;
}

export interface GlassProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Corner radius, px. */
  radius?: number;
  /** Remembers this surface's last ink under this name, so the next load opens in it. */
  remember?: string;
  children?: ReactNode | ((info: GlassInfo) => ReactNode);
}

/**
 * A piece of liquid glass. Markup is two siblings: the glass surface (tint,
 * backdrop filter, edge, inner light) and the content on top of it.
 *
 * Keep `transform`, `opacity`, `filter`, `z-index` and `will-change` off this
 * element and off its ancestors up to the backdrop. Any of them cuts <Ink> off
 * from the picture behind the glass, and in Chrome can break the lens. If you
 * can't avoid one, switch the blend off with `options.layers.blend = false`.
 */
export function Glass({ radius = 32, remember, className, style, children, ...rest }: GlassProps) {
  const { options, theme: setting, backdrop } = useContext(GlassContext);
  const system = useSystemTheme();
  const theme = setting === 'system' ? system : setting;

  const ref = useRef<HTMLDivElement>(null);
  const lensCanvas = useRef<HTMLCanvasElement>(null);
  const filterId = `lg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [reading, setReading] = useState<Reading | null>(null);
  const [ink, setInk] = useState<InkTone>('dark');
  const [map, setMap] = useState('');
  // Decided after mount, so server and client render the same first markup.
  const [mode, setMode] = useState<LensMode>('none');
  const [split, setSplit] = useState(false);
  const last = useRef<Reading | null>(null);
  const settled = useRef(false);
  const onScreen = useRef(true);
  const stale = useRef(false);
  // Latest values for the WebGL lens, read when it draws.
  const frame = useRef({ radius: 0, rim: 0, push: 0, split: 0, blur: 0 });

  const hasPicture = !!backdrop?.picture;
  useIsoLayoutEffect(() => {
    setMode(lensMode(hasPicture));
    setSplit(!coarsePointer());
  }, [hasPicture]);

  useIsoLayoutEffect(() => {
    const remembered = remember ? recall(remember) : null;
    if (remembered) {
      settled.current = true;
      setInk(remembered);
    }
  }, [remember]);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reads the backdrop behind this surface.
  const read = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    stale.current = false;
    const next = backdrop?.sample(el.getBoundingClientRect()) ?? null;
    const prev = last.current;
    if (!next) {
      if (prev) {
        last.current = null;
        setReading(null);
      }
      return;
    }
    // The ink decision looks at every read. React skips the render when it doesn't change.
    const first = !settled.current;
    settled.current = true;
    setInk((current) => decideInk(next.luma, first ? null : current));
    // The tint only follows changes large enough to see, so a drag doesn't re-render every frame.
    if (!prev || moved(next, prev)) {
      last.current = next;
      setReading(next);
    }
  }, [backdrop]);

  // Safari and Firefox: draw the bent backdrop with WebGL.
  const draw = useCallback(() => {
    const el = ref.current;
    const canvas = lensCanvas.current;
    const source = mode === 'gl' ? backdrop?.picture?.() : null;
    if (!el || !canvas || !source) return;
    const box = el.getBoundingClientRect();
    drawLens(canvas, {
      image: source.image,
      version: source.version,
      backW: source.rect.width,
      backH: source.rect.height,
      x: box.left - source.rect.left,
      y: box.top - source.rect.top,
      w: box.width,
      h: box.height,
      ...frame.current,
    });
  }, [mode, backdrop]);

  // Read on mount and when the surface's size changes.
  useIsoLayoutEffect(read, [read, size.w, size.h]);

  // Read again when told the backdrop or this surface's position changed: at most
  // once a frame, and not at all while off screen.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pending = 0;
    const schedule = () => {
      if (!onScreen.current) {
        stale.current = true;
        return;
      }
      if (!pending)
        pending = requestAnimationFrame(() => {
          pending = 0;
          read();
          draw();
        });
    };
    const stop = backdrop?.watch?.((target) => {
      if (!target || target === el) schedule();
    });
    // The margin wakes a surface a little before it scrolls into view, so it never
    // arrives showing an old reading or an old lens.
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry.isIntersecting;
        if (entry.isIntersecting && stale.current) schedule();
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => {
      stop?.();
      io.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [backdrop, read, draw]);

  useEffect(() => {
    if (!remember || !settled.current) return;
    try {
      window.localStorage.setItem(`lg-ink:${remember}`, ink);
    } catch {
      // Storage unavailable: the glass still works, it just starts from the default.
    }
  }, [remember, ink]);

  const { layers } = options;
  const state = stateFor(theme, ink);
  const material = MATERIAL[state];
  const scale = options.tint[theme];
  // Below a tint strength of 1 the brightness shift thins out with it.
  const brightness = 1 + (material.brightness - 1) * Math.min(1, scale);
  const saturate = 1 + (material.saturate - 1) * saturationKept(reading);

  const density = densityFor(state, reading);
  const designed = (material.thin + (material.dense - material.thin) * density + (mode === 'none' ? FALLBACK_TINT : 0)) * scale;
  // Contrast wins over the tint setting: the glass thickens where text would otherwise be lost.
  const floor = contrastFloor(state, reading, layers.blur ? brightness : 1, options.contrast);
  const tint = layers.tint ? Math.min(1, Math.max(designed, floor)) : 0;
  const blur = mode === 'none' ? options.blur * FALLBACK_BLUR : options.blur;

  const bends = layers.refraction && options.edge > 0 && options.offset > 0 && Math.min(size.w, size.h) >= MIN_LENS_SIDE;
  const rim = rimWidth(options.edge, size.w, size.h);
  const dispersion = split && size.w * size.h <= SPLIT_MAX_AREA ? options.dispersion : 0;

  // Chromium: the lens is an SVG filter fed by a displacement map.
  const filterLens = mode === 'filter' && bends;
  useEffect(() => {
    if (!filterLens) return;
    let alive = true;
    void loadDisplacementMap(size.w, size.h, radius, rim).then((url) => alive && setMap(url));
    return () => {
      alive = false;
    };
  }, [filterLens, size.w, size.h, radius, rim]);
  const filterReady = filterLens && map !== '';

  // The WebGL lens draws the blur and the bend itself. Its canvas takes saturation
  // and brightness from the same variables, through a CSS filter.
  const lensRadius = fieldRadius(radius, rim, size.w, size.h);
  const lensPush = bends ? rim * options.offset : 0;
  const lensSplit = bends ? dispersion : 0;
  const lensBlur = layers.blur ? options.blur : 0;
  useIsoLayoutEffect(() => {
    frame.current = { radius: lensRadius, rim, push: lensPush, split: lensSplit, blur: lensBlur };
    draw();
  }, [draw, size.w, size.h, lensRadius, rim, lensPush, lensSplit, lensBlur]);

  // The colour steps first, the lens last: they fold into one pass and the bend stays crisp.
  const filters = [
    layers.blur ? `blur(${blur}px) saturate(var(--lg-sat)) brightness(var(--lg-bri))` : '',
    filterReady ? `url(#${filterId})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const backdropFilter = mode === 'gl' || !filters ? 'none' : filters;

  const vars = {
    '--lg-radius': `${radius}px`,
    '--lg-a': tint.toFixed(3),
    '--lg-sat': layers.blur ? saturate.toFixed(3) : '1',
    '--lg-bri': layers.blur ? brightness.toFixed(3) : '1',
  } as CSSProperties;

  const info: GlassInfo = { state, reading, density, tint, floor };

  return (
    <div
      ref={ref}
      className={className ? `lg ${className}` : 'lg'}
      data-state={state}
      data-shadow={layers.shadow ? 'on' : 'off'}
      data-rim={layers.rim ? 'on' : 'off'}
      data-blend={layers.blend ? 'on' : 'off'}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {filterReady && (
        <svg className="lg-defs" aria-hidden="true">
          <LensFilter id={filterId} map={map} w={size.w} h={size.h} push={rim * options.offset * MAP_SCALE} dispersion={dispersion} />
        </svg>
      )}
      {mode === 'gl' && <canvas ref={lensCanvas} className="lg-lens" aria-hidden="true" />}
      <div className="lg-glass" style={{ backdropFilter, WebkitBackdropFilter: backdropFilter }} />
      <div className="lg-content">{typeof children === 'function' ? children(info) : children}</div>
    </div>
  );
}

/* ---------- The lens filter ---------- */

const ONLY_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const ONLY_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

interface LensProps {
  id: string;
  map: string;
  w: number;
  h: number;
  push: number;
  dispersion: number;
}

/**
 * Bends the backdrop through the displacement map. With dispersion on it does so
 * three times, once per colour channel at a slightly different strength, then adds
 * the channels back with screen blends: red lands a little further in than blue.
 */
function LensFilter({ id, map, w, h, push, dispersion }: LensProps) {
  const shared = { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' } as const;
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} colorInterpolationFilters="sRGB">
      <feImage href={map} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
      {dispersion > 0 ? (
        <>
          <feDisplacementMap {...shared} scale={push * (1 + dispersion)} result="dr" />
          <feColorMatrix in="dr" type="matrix" values={ONLY_R} result="r" />
          <feDisplacementMap {...shared} scale={push} result="dg" />
          <feColorMatrix in="dg" type="matrix" values={ONLY_G} result="g" />
          <feDisplacementMap {...shared} scale={push * (1 - dispersion)} result="db" />
          <feColorMatrix in="db" type="matrix" values={ONLY_B} result="b" />
          <feBlend in="r" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b" mode="screen" />
        </>
      ) : (
        <feDisplacementMap {...shared} scale={push} />
      )}
    </filter>
  );
}

/* ---------- Ink ---------- */

export interface InkProps {
  as?: ElementType;
  /** 1 = primary, 2 = secondary, 3 = faint (tracks, dividers). The contrast safeguard protects primary ink. */
  tone?: 1 | 2 | 3;
  /**
   * Set on icons. They are drawn in the opaque ink and faded as a whole, because a
   * translucent colour darkens wherever an icon's strokes and fills overlap.
   */
  icon?: boolean;
  /**
   * Same ink, no blend. Each blended element is its own compositing layer, so use
   * this for dense text (table rows, long lists) and keep the blend for titles and icons.
   */
  flat?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Anything drawn on the glass: text, icons, progress. One ink colour in fixed
 * steps, blended into the glass (multiply on light glass, plus-lighter on dark) so
 * it carries a trace of the colour behind it.
 *
 * Fade with `tone`, not with `opacity` on a parent: an ancestor with opacity,
 * transform or filter cuts the blend off from the backdrop.
 */
export function Ink({ as: Tag = 'div', tone = 1, icon, flat, className, style, children }: InkProps) {
  return (
    <Tag className={className ? `lg-ink ${className}` : 'lg-ink'} data-tone={tone} data-icon={icon ? '' : undefined} data-flat={flat ? '' : undefined} style={style}>
      {children}
    </Tag>
  );
}
