"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "motion/react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

interface ScrubSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value reads inside the track: `prefix` + number + `suffix`, e.g. "±", 1, "%". */
  prefix?: string;
  suffix?: string;
  /** Most decimal places shown. */
  digits?: number;
  /** Fewest decimal places shown (defaults to `digits`): 0 lets whole values drop the decimal. */
  minDigits?: number;
  onChange: (value: number) => void;
  /** Tick marks between the ends. */
  ticks?: number;
  className?: string;
}

/** How far the handle stays inside the track at either end, so it never sits on the rounded edge. */
const HANDLE_INSET = 5;

/** Matches the handle's 0.32s glide: a strong ease-out, so digits land with the handle. */
const DIGIT_TIMING: EffectTiming = { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
/** While dragging, values arrive every frame: a shorter roll keeps the digits up with the pointer. */
const DRAG_DIGIT_TIMING: EffectTiming = { duration: 160, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
const FADE_TIMING: EffectTiming = { duration: 160, easing: "ease-out" };

const TICKS_CLEAR_LEFT = "linear-gradient(to right, transparent 0 46px, black 58px)";
const TICKS_CLEAR_RIGHT = "linear-gradient(to left, transparent 0 46px, black 58px)";

/**
 * A wide track you scrub across: tick marks, a handle, the value set inside.
 *
 * Base UI owns the value, keyboard and screen-reader behaviour; this only draws it.
 * The track is drawn twice: a grey base, and a green filled copy clipped to the
 * value. Wherever the fill passes under a tick or the number, that part turns
 * white, with no colour logic. At 100% the fill reaches the very end.
 *
 * The drawing follows a spring rather than the raw value, because the value moves
 * in steps: while dragging a stiff spring smooths them without visibly lagging, a
 * click or an arrow key glides there, and every move starts from where the handle
 * is now, so it can be interrupted. With reduced motion it jumps.
 */
export function ScrubSlider({ label, value, min, max, step, prefix = "", suffix = "", digits = 0, minDigits = digits, onChange, ticks = 9, className }: ScrubSliderProps) {
  const labelId = useId();
  const target = ((value - min) / (max - min)) * 100;
  const shown = useMotionValue(target);
  const clip = useTransform(shown, (v) => `inset(0 ${100 - v}% 0 0)`);
  // translate % is relative to the full-width wrapper, so this is the fill edge, held inside the ends.
  const handleX = useTransform(shown, (v) => `clamp(${HANDLE_INSET}px, ${v}%, calc(100% - ${HANDLE_INSET}px))`);
  const reduceMotion = useReducedMotion();
  const reason = useRef<string>("none");
  const [dragging, setDragging] = useState(false);
  const running = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    running.current?.stop();
    if (reduceMotion) {
      shown.set(target);
      return;
    }
    const dragging = reason.current === "drag";
    running.current = animate(shown, target, { type: "spring", bounce: 0, duration: dragging ? 0.14 : 0.32 });
  }, [target, reduceMotion, shown]);

  useEffect(() => () => running.current?.stop(), []);

  // Near the right end the handle would run into the value, so the value moves to the left end.
  const valueOnLeft = target > 58;
  const numberFormat = { minimumFractionDigits: minDigits, maximumFractionDigits: digits };
  const valueText = `${prefix}${value.toLocaleString(undefined, numberFormat)}${suffix}`;

  /** One copy of the track's contents, in either the base or the filled colours. */
  const layer = (tick: string, text: string): ReactNode => (
    <>
      <div className="absolute inset-y-0 right-3 left-3" style={{ maskImage: valueOnLeft ? TICKS_CLEAR_LEFT : TICKS_CLEAR_RIGHT }}>
        {Array.from({ length: ticks }, (_, i) => (
          <span key={i} className={cn("absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2", tick)} style={{ left: `${((i + 1) / (ticks + 1)) * 100}%` }} />
        ))}
      </div>
      <span className={cn("absolute top-1/2 -translate-y-1/2 text-[13px] font-medium tabular-nums", text, valueOnLeft ? "left-3" : "right-3")}>
        {/* Digits roll on the same rhythm as the handle: the full glide for a click or a
            key, a quicker roll while dragging so they keep up. Each roll picks up from
            the last, so a drag reads as one continuous count. */}
        <NumberFlow
          value={value}
          prefix={prefix}
          suffix={suffix}
          format={numberFormat}
          transformTiming={dragging ? DRAG_DIGIT_TIMING : DIGIT_TIMING}
          spinTiming={dragging ? DRAG_DIGIT_TIMING : DIGIT_TIMING}
          opacityTiming={FADE_TIMING}
        />
      </span>
    </>
  );

  return (
    <div className={cn("grid gap-2", className)}>
      <span id={labelId} className="text-[13px] text-muted-foreground">
        {label}
      </span>
      <SliderPrimitive.Root
        value={value}
        min={min}
        max={max}
        step={step}
        aria-labelledby={labelId}
        onValueChange={(v, details) => {
          reason.current = details.reason;
          if (details.reason === "drag" && !dragging) setDragging(true);
          onChange(Array.isArray(v) ? v[0] : (v as number));
        }}
        onValueCommitted={() => setDragging(false)}
        className="group/scrub"
      >
        {/* No padding: Base UI maps the pointer across the full width, so the fill edge sits under the pointer. */}
        <SliderPrimitive.Control className="relative h-10 cursor-ew-resize touch-pan-y overflow-hidden rounded-[10px] bg-black/[0.05] transition-[background-color,box-shadow] duration-150 ease-out select-none hover:bg-black/[0.07] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 pointer-coarse:h-11">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {layer("bg-black/12", "text-foreground/70")}
          </div>

          <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-green" style={{ clipPath: clip }}>
            {layer("bg-white/30", "text-white")}
          </motion.div>

          <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ x: handleX }}>
            <span className="absolute top-1/2 left-0 h-[18px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.28),0_1px_2px_rgb(0_0_0/0.25)] transition-[scale] duration-150 ease-out group-data-[dragging]/scrub:scale-y-[1.3] motion-reduce:transition-none" />
          </motion.div>

          <SliderPrimitive.Track className="absolute inset-0">
            <SliderPrimitive.Thumb className="size-px opacity-0" getAriaValueText={() => valueText} />
          </SliderPrimitive.Track>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}
