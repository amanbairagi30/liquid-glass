# Liquid glass

A React glass surface that takes its colour from what is behind it, bends the backdrop at its rim, and keeps its text readable in light and dark mode.

Needs React 18 or newer. No other dependencies. Copy this folder into a project and import from it. In Next.js it is a client component; it renders on the server without errors.

## Use

```tsx
import { Glass, Ink } from './glass';
import './glass/glass.css'; // or @import it from your global CSS

<Glass radius={24}>
  <div style={{ padding: 20 }}>
    <Ink>Title</Ink>
    <Ink tone={2}>Secondary line</Ink>
  </div>
</Glass>
```

That works on its own: it follows the system light/dark setting and uses a tint thick enough to keep text readable over anything.

To make the glass adapt to its backdrop, and to get the rim lens in Safari and Firefox, tell it what it sits on:

```tsx
import { Glass, GlassProvider, Ink, useBackdrop } from './glass';

const { backdrop, ref } = useBackdrop<HTMLImageElement>();

<div style={{ position: 'relative' }}>
  <img ref={ref} src="/hero.jpg" onLoad={backdrop.changed} />
  <GlassProvider backdrop={backdrop}>
    <Glass style={{ position: 'absolute', left: 40, top: 40, width: 320 }}>…</Glass>
  </GlassProvider>
</div>
```

Call `backdrop.changed()` when the picture's pixels change, and `backdrop.moved()` when glass moves over it (scroll, drag, layout change). Pass one surface's root element to `moved(el)` when only that surface moved.

The backdrop element can be a canvas, an image or a video. It must be readable (same origin, or served with CORS and loaded with `crossOrigin`), and it must show its picture edge to edge, with no `object-fit` cropping.

## API

| | |
|---|---|
| `<Glass radius remember>` | The surface. Takes any `div` props. `remember="name"` stores its last text colour so the next load opens in it. Children can be a function receiving the current state. |
| `<Ink tone icon flat as>` | Text and icons on the glass. `tone` 1–3 is emphasis. `icon` for icons. `flat` skips the blend, for long lists. |
| `<GlassProvider theme options backdrop>` | Optional. `theme` is `'system'`, `'light'` or `'dark'`. |
| `useBackdrop()` | A backdrop for a canvas, image or video, and the `ref` to put on that element. |
| `createBackdrop(getElement)` | The same, outside React. |
| `GlassBackdrop` | The interface to implement for any other kind of backdrop. |

Options, with defaults:

| Option | Default | |
|---|---|---|
| `contrast` | `4.5` | WCAG ratio the primary ink keeps against the glass. `0` turns it off. |
| `tint` | `{ light: 1, dark: 1 }` | Tint strength per theme, 0–1.5. |
| `edge` | `44` | Rim lens width, px. |
| `offset` | `1.1` | Largest bend, as a multiple of the rim. |
| `dispersion` | `0.15` | Colour split at the rim. |
| `blur` | `2` | Backdrop blur, px. |
| `layers` | all on | Switches for single layers, for debugging. |

Colours, edges and ink are CSS variables in `glass.css`, one set per state (`light`, `shaded`, `dark`). Override them there.

## Accessibility

- **Contrast.** The tint thickens until primary ink meets `options.contrast` over the brightest or darkest spot behind the surface. When the backdrop can't be read, it assumes the worst case. This is calculated from brightness and from what the sampler saw, so it is a safeguard and not a proof: check real screens with a contrast tool. Secondary ink (`tone={2}`) is lower emphasis and is not covered; use `tone={1}` for text that must meet AA.
- **Reduced transparency and forced colours.** The surface becomes solid and the ink stops blending.
- **Reduced motion.** State changes stop animating.
- **Focus.** The component adds no focus handling of its own; style focus rings for controls you place on the glass.

## Browsers

| | Lens | How |
|---|---|---|
| Chrome, Edge and other Chromium | Yes | SVG filter in `backdrop-filter`. Bends anything behind the glass. |
| Safari, Firefox | Yes, with a backdrop | WebGL, drawn from the backdrop picture. Bends only that picture: other page content behind the glass, including other glass, does not show through. |
| Safari, Firefox without a backdrop | No | Deeper blur and denser tint instead. |

Safe to import on a server: nothing touches `window` at import time, and the first render is the same on server and client.

## Limits

- **No `transform`, `opacity`, `filter`, `z-index` or `will-change`** on a `<Glass>` or its ancestors up to the backdrop. Any of them cuts the ink blend off from the backdrop. If a layout needs one (an animated modal, say), set `options.layers.blend` to `false`.
- **Cost grows with area.** It is built for card-sized surfaces over a still or slowly changing backdrop. A surface over 200,000px², or any surface on a touch device, drops the colour split. Glass over video or fast scrolling redraws every frame; test that on your slowest target device.
- **Adaptive ink needs a readable backdrop.** Over plain DOM content there is nothing to sample, so the glass uses the theme's ink and the worst-case tint.
