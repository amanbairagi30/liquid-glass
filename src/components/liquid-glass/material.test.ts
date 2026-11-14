import { describe, expect, it } from 'vitest';
import { readBackdrop, type SampleMap } from './backdrop';
import {
  contrastFloor,
  contrastRatio,
  decideInk,
  densityFor,
  fieldRadius,
  glassLimit,
  inkOver,
  MATERIAL,
  rimWidth,
  saturationKept,
  stateFor,
  type GlassState,
  type Reading,
} from './material';

const reading = (over: Partial<Reading> = {}): Reading => ({ luma: 0.5, texture: 0, chroma: 0, min: 0.5, max: 0.5, ...over });
const STATES: GlassState[] = ['light', 'shaded', 'dark'];

describe('ink', () => {
  it('takes light text on a dark backdrop and dark text on a bright one', () => {
    expect(decideInk(0.2, null)).toBe('light');
    expect(decideInk(0.8, null)).toBe('dark');
  });
  it('holds the current ink inside the dead zone', () => {
    expect(decideInk(0.48, 'dark')).toBe('dark');
    expect(decideInk(0.52, 'light')).toBe('light');
    expect(decideInk(0.44, 'dark')).toBe('light');
    expect(decideInk(0.56, 'light')).toBe('dark');
  });
  it('always uses light text in dark mode', () => {
    expect(stateFor('dark', 'dark')).toBe('dark');
    expect(stateFor('light', 'light')).toBe('shaded');
    expect(stateFor('light', 'dark')).toBe('light');
  });
});

describe('tint', () => {
  it('is dense when the backdrop cannot be read', () => {
    expect(densityFor('light', null)).toBe(1);
  });
  it('thickens with texture and colour, within 0–1', () => {
    const calm = densityFor('light', reading({ luma: 0.9 }));
    const busy = densityFor('light', reading({ luma: 0.9, texture: 0.8, chroma: 0.5 }));
    expect(busy).toBeGreaterThan(calm);
    expect(densityFor('dark', reading({ luma: 1, texture: 1, chroma: 1 }))).toBe(1);
  });
  it('keeps at least 45% of the saturation boost', () => {
    expect(saturationKept(reading({ chroma: 1 }))).toBe(0.45);
    expect(saturationKept(reading({ chroma: 0 }))).toBe(1);
  });
});

describe('contrast', () => {
  it('matches WCAG reference ratios', () => {
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 1);
    expect(contrastRatio(1, 1)).toBeCloseTo(1, 5);
    // #777 on white is the well-known 4.48:1 near miss.
    expect(contrastRatio(0x77 / 255, 1)).toBeCloseTo(4.48, 1);
  });

  it('asks for nothing when the backdrop already suits the ink', () => {
    expect(contrastFloor('light', reading({ min: 0.9, max: 1 }), 1.06, 4.5)).toBe(0);
    expect(contrastFloor('dark', reading({ min: 0, max: 0.1 }), 0.8, 4.5)).toBe(0);
  });

  it('is off at a ratio of 0', () => {
    expect(contrastFloor('light', reading({ min: 0 }), 1.06, 0)).toBe(0);
  });

  // The guarantee itself: with the floor applied, ink over the worst spot meets the ratio.
  for (const state of STATES) {
    for (const ratio of [3, 4.5, 7]) {
      it(`${state} glass meets ${ratio}:1 over the worst backdrop`, () => {
        const { brightness, tintLuma } = MATERIAL[state];
        for (let worst = 0; worst <= 1; worst += 0.05) {
          const r = reading({ min: worst, max: worst });
          const floor = contrastFloor(state, r, brightness, ratio);
          const seen = Math.min(1, worst * brightness);
          const glass = seen + (tintLuma - seen) * floor;
          expect(contrastRatio(inkOver(state, glass), glass)).toBeGreaterThanOrEqual(ratio - 0.01);
        }
      });
    }
    it(`${state} glass assumes the worst when the backdrop cannot be read`, () => {
      expect(contrastFloor(state, null, MATERIAL[state].brightness, 4.5)).toBeGreaterThan(0.3);
    });
  }

  it('finds a limit that sits exactly on the ratio', () => {
    for (const state of STATES) {
      const limit = glassLimit(state, 4.5);
      expect(contrastRatio(inkOver(state, limit), limit)).toBeCloseTo(4.5, 2);
    }
  });
});

describe('lens geometry', () => {
  it('narrows the rim on small surfaces and never goes under 4px', () => {
    expect(rimWidth(44, 300, 230)).toBe(44);
    expect(rimWidth(44, 420, 56)).toBe(16);
    expect(rimWidth(44, 10, 10)).toBe(4);
  });
  it('keeps the field radius at least as large as the rim and inside the surface', () => {
    expect(fieldRadius(8, 44, 300, 230)).toBe(44);
    expect(fieldRadius(28, 16, 420, 56)).toBe(28);
    expect(fieldRadius(100, 44, 60, 60)).toBe(30);
  });
});

describe('readBackdrop', () => {
  // A 4 x 2 map: left half black, right half white.
  const map: SampleMap = { w: 4, h: 2, data: new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255].flatMap((v) => [v, v, v, 255])) };
  const area = { left: 0, top: 0, width: 400, height: 200 };

  it('reads a dark area as dark and a bright one as bright', () => {
    expect(readBackdrop(map, area, { left: 0, top: 0, width: 190, height: 200 })?.luma).toBe(0);
    expect(readBackdrop(map, area, { left: 210, top: 0, width: 190, height: 200 })?.luma).toBe(1);
  });
  it('reports both extremes and full texture across the split', () => {
    const r = readBackdrop(map, area, { left: 100, top: 0, width: 200, height: 200 })!;
    expect(r.min).toBe(0);
    expect(r.max).toBe(1);
    expect(r.texture).toBe(1);
    expect(r.chroma).toBe(0);
  });
  it('returns null for an empty rectangle', () => {
    expect(readBackdrop(map, area, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
  });
});
