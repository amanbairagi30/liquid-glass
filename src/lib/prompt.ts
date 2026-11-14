/**
 * Turns the settings on the page into a prompt someone can paste into their AI
 * coding tool to build the same material in their own project.
 */

export interface PromptSettings {
  tint: number;
  /** WCAG ratio as a string, "0" for off. */
  contrast: string;
  edge: number;
  offset: number;
  dispersion: number;
  blur: number;
  refraction: boolean;
  rim: boolean;
  blend: boolean;
  shadow: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const range = (thin: number, dense: number, scale: number) => `${pct(Math.min(1, thin * scale))}–${pct(Math.min(1, dense * scale))}`;
const bright = (b: number, scale: number) => (1 + (b - 1) * Math.min(1, scale)).toFixed(2);

export function buildPrompt(s: PromptSettings): string {
  const ratio = Number(s.contrast);
  const lens = s.refraction && s.edge > 0 && s.offset > 0;
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);

  add(
    "Give the cards and panels in my web app a liquid glass material: clear glass that takes its colour from what is behind it, bends the backdrop at its rim like a thick slab, adapts to light and dark backgrounds, and keeps its text readable.",
    "",
    "Work inside my existing design system. This changes surfaces only: keep my markup, layout, spacing, radii, fonts, icons and copy. If a surface would need a new component to work as glass, stop and ask me first.",
    "",
    "## Settings to use",
    `- Tint strength: ${s.tint.toFixed(2)}× (1 is the material as designed)`,
    `- Text contrast floor: ${ratio > 0 ? `${ratio}:1 (WCAG ${ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "AA large text"})` : "off"}`,
    `- Backdrop blur: ${s.blur}px`,
    lens ? `- Rim lens: ${s.edge}px wide, bend ${s.offset.toFixed(2)}× the rim width, colour split ±${pct(s.dispersion)}` : "- Rim lens: off",
    `- Edge light: ${s.rim ? "on" : "off"} · Ink blending: ${s.blend ? "on" : "off"} · Shadow: ${s.shadow ? "on" : "off"}`,
    "",
    "## 1. Find the surfaces",
    "List every surface that sits over an image, video, wallpaper or busy background (cards, players, search bars, toolbars, menus, popovers). Leave surfaces over a plain background solid: glass over a flat colour just looks grey. Show me the list before changing anything.",
    "",
    "## 2. Material tokens",
    "Put the material in CSS variables, one set per state, so a surface opts in by using them. Register the numeric ones with @property so surfaces glide between states.",
    `- Light glass, dark text (light mode, default): tint white at ${range(0.06, 0.22, s.tint)}; backdrop-filter: blur(${s.blur}px) saturate(180%) brightness(${bright(1.06, s.tint)}).`,
    `- Shaded glass, light text (light mode over a dark area): tint rgb(16 18 22) at ${range(0.1, 0.3, s.tint)}; blur(${s.blur}px) saturate(170%) brightness(${bright(0.85, s.tint)}).`,
    `- Dark glass (dark mode, always light text): tint rgb(20 20 24) at ${range(0.16, 0.38, s.tint)}; blur(${s.blur}px) saturate(160%) brightness(${bright(0.8, s.tint)}).`,
    "The tint moves between its low and high value with the backdrop's density (step 6).",
  );

  if (s.shadow) {
    add("", "## 3. Shadow", "Light glass: 0 0 0 0.5px black at 6%, 0 6px 24px black at 8%. Shaded and dark glass: a 0.5px black outline at 35–40% and 0 6px 24px black at 16–30%.");
  }
  if (s.rim) {
    add(
      "",
      "## 4. Edge light",
      "Inset highlights on the surface: 1.5px 1.5px 1px -1px white at 95% (top left), -1.5px -1.5px 1px -1px white at 55% (bottom right), and a 0.5px inset white ring at 30%.",
      "On a layer inside the surface: a radial highlight from the top-left corner (white 30%, gone by 55%), and soft inset glows just inside the rim, brighter at the top and left with a little shade at the bottom. Use about a third of this strength on shaded and dark glass.",
    );
  }

  add(
    "",
    "## 5. Ink",
    "One ink colour in fixed steps for everything drawn on the glass. On light glass: black at 86% for primary, rgb(60 60 67) at 70% for secondary. On shaded and dark glass: white at 94%, rgb(235 235 245) at 64%.",
    s.blend
      ? "Blend it into the glass: mix-blend-mode multiply on light glass, plus-lighter on shaded and dark glass (fall back to screen where plus-lighter is unsupported). Draw icons in the opaque colour and fade the whole icon with opacity, so overlapping strokes don't darken. Use no blend on long lists to save compositing layers."
      : "Draw it without a blend mode.",
    "Highlighted rows and selected segments are a lighter layer of the same glass (white 42% on hover, 76% selected, with a white stroke), never a grey wash.",
  );

  if (lens) {
    add(
      "",
      "## 6. Rim lens",
      `- Rim width per surface: min(${s.edge}px, short side / 3.5), never under 4px. Skip the lens on surfaces under 32px.`,
      `- A point d pixels in from the edge looks further inward by ${s.offset.toFixed(2)} × rim × (1 − d / rim)^2.6: hard at the edge, nothing past the rim, flat in the middle. Use the surface's own corner radius (at least the rim width) for the field so the bend follows the corners.`,
      "- Chromium: bake that into a displacement map (red = horizontal push, green = vertical, 128 = none), load it with feImage and apply feDisplacementMap with scale = 2 × the largest push, as url(#id) at the end of backdrop-filter, after the colour steps. Wait for the map image to decode before attaching it. Build maps per size, radius and rim and cache them. Give each filter a unique id.",
      s.dispersion > 0
        ? `- Colour split: three displacement passes, red ${pct(s.dispersion)} stronger and blue ${pct(s.dispersion)} weaker, each isolated with feColorMatrix and recombined with screen blends. Drop to one pass on surfaces over 200,000px² and on touch devices.`
        : "- No colour split: one displacement pass.",
      "- Safari and Firefox can't run an SVG filter in backdrop-filter (Firefox parses it and draws nothing, so check the engine, not just CSS.supports). Where the backdrop is an image, canvas or video I can hand you, draw the same bend, split and blur with a small WebGL shader into a canvas under the tint, from one shared WebGL context. Otherwise use a deeper blur (4×) and add 8% to the tint instead.",
    );
  } else {
    add("", "## 6. Rim lens", "Skip the refraction. Use only the blur, tint, edge and ink.");
  }

  add(
    "",
    "## 7. Adapt to the backdrop",
    "- When the backdrop is a readable image, canvas or video: sample it under each surface at a 5 × 3 grid, drop the two darkest and two brightest points, and average. Luminance = (0.299 R + 0.587 G + 0.114 B) / 255. Texture = brightest − darkest point. Chroma = average of (max − min channel).",
    "- Ink: in light mode, use shaded glass (light text) when luminance is under 0.5, and keep the current ink within ±0.05 of that line so it never flickers. Dark mode always uses light text.",
    "- Density (0 thin, 1 dense) = 0.55 × how close the backdrop is to the ink's own brightness + 0.7 × texture + 0.3 × chroma, clamped. It moves the tint between its low and high value.",
    "- Keep 1 − 0.75 × chroma of the saturation boost, at least 45%, so vivid backdrops don't stain the glass.",
    "- Re-sample at most once a frame, only when the backdrop, theme or a surface's position changes, and not while a surface is off screen.",
    "- If the backdrop can't be read (live video, cross-origin, plain page content), take the ink from the theme and use the dense tint.",
  );

  if (ratio > 0) {
    add(
      "",
      "## 8. Contrast floor",
      `Primary text must keep ${ratio}:1 against the glass (WCAG contrast). Find the darkest spot under a surface with dark ink, or the brightest with light ink, and raise the tint opacity until primary ink over that spot meets ${ratio}:1. Never make the glass fully opaque (cap the tint at 92%). Treat an unreadable backdrop as the worst case. Raise the tint, never the ink's opacity.`,
    );
  }

  add(
    "",
    "## 9. Accessibility and constraints",
    "- prefers-reduced-transparency and forced-colors: drop the backdrop filter and make the surface solid in the same tint; turn the ink blend off.",
    "- prefers-reduced-motion: no transitions between states.",
    "- Keep focus rings, disabled states and error colours as they are.",
    "- Keep transform, opacity, filter, z-index and will-change off glass surfaces and their ancestors up to the backdrop: they isolate the ink blend from what is behind it. Position moving glass with left/top. Where a layout needs one of those properties, switch the blend off for that surface.",
    "",
    "## 10. Deliver",
    "First list the surfaces you will change and which get the lens. Then add the tokens and helpers, switch the surfaces over, and list every file you touched. Don't change layout, fonts, radii or copy.",
  );

  return lines.join("\n");
}
