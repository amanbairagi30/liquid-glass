/**
 * The rim lens.
 *
 * Builds the displacement map that an SVG <feDisplacementMap> reads: red holds the
 * sideways bend, green the vertical one, and 128 means "leave this pixel alone".
 * Only a rim bends. A point d in from the edge looks further inward by
 * offset * rim * (1 - d / rim) ^ 2.6: hard at the edge, where the scene folds back
 * on itself, easing to nothing at the rim's inner edge. The middle stays flat.
 */

import { fieldRadius } from './material';

/** feDisplacementMap moves a pixel by scale * (channel / 255 - 0.5); we write channel = 128 ± 127. */
export const MAP_SCALE = 255 / 127;

const FALLOFF = 2.6;

/**
 * The corner tile: the map for a square of side 2R + 1 with corner radius R. Its
 * four R × R quadrants are the four corners of any surface with that radius, and
 * its middle row and column are the straight edges. Built once per radius and rim.
 */
function buildTile(R: number, rim: number): HTMLCanvasElement {
  const side = 2 * R + 1;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(side, side);
  const px = img.data;

  for (let y = 0; y < side; y++) {
    const cy = y - R;
    const sy = cy < 0 ? -1 : 1;
    const qy = Math.abs(cy) - 0.5;
    for (let x = 0; x < side; x++) {
      const cx = x - R;
      const sx = cx < 0 ? -1 : 1;
      const qx = Math.abs(cx) - 0.5;

      // depth = distance in from the edge; (nx, ny) = direction pointing out of the glass.
      let depth: number;
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy);
        depth = R - len;
        nx = (qx / len) * sx;
        ny = (qy / len) * sy;
      } else if (qx > qy) {
        depth = R - qx;
        nx = sx;
      } else {
        depth = R - qy;
        ny = sy;
      }

      const t = Math.max(0, Math.min(1, 1 - depth / rim));
      const f = Math.pow(t, FALLOFF);
      const i = (y * side + x) * 4;
      // Look further inside the glass: the opposite of the outward direction.
      px[i] = 128 - Math.round(127 * nx * f);
      px[i + 1] = 128 - Math.round(127 * ny * f);
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const tiles = new Map<string, HTMLCanvasElement>();
const maps = new Map<string, Promise<string>>();
const CACHE_LIMIT = 24;

function trim<T>(cache: Map<string, T>) {
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/**
 * Lays the tile out to a surface's size: four corners copied, four edges stretched
 * from a one-pixel strip, flat grey in the middle. No per-pixel work, so a large
 * panel costs about the same as a small card.
 */
function assemble(tile: HTMLCanvasElement, R: number, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'rgb(128 128 128)';
  ctx.fillRect(0, 0, w, h);

  const far = R + 1; // start of the tile's right / bottom half
  const midW = w - 2 * R;
  const midH = h - 2 * R;
  ctx.drawImage(tile, 0, 0, R, R, 0, 0, R, R);
  ctx.drawImage(tile, far, 0, R, R, w - R, 0, R, R);
  ctx.drawImage(tile, 0, far, R, R, 0, h - R, R, R);
  ctx.drawImage(tile, far, far, R, R, w - R, h - R, R, R);
  if (midW > 0) {
    ctx.drawImage(tile, R, 0, 1, R, R, 0, midW, R);
    ctx.drawImage(tile, R, far, 1, R, R, h - R, midW, R);
  }
  if (midH > 0) {
    ctx.drawImage(tile, 0, R, R, 1, 0, R, R, midH);
    ctx.drawImage(tile, far, R, R, 1, w - R, R, R, midH);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Returns the map for a surface as a data URL, once the browser has decoded it.
 * Pointing a filter at a map that is still decoding makes Chrome draw the surface
 * without its backdrop filter for a frame.
 */
export function loadDisplacementMap(width: number, height: number, radius: number, rim: number): Promise<string> {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const R = fieldRadius(radius, rim, w, h);
  const tileKey = `${R}|${rim.toFixed(2)}`;
  const key = `${w}x${h}|${tileKey}`;
  const hit = maps.get(key);
  if (hit) return hit;

  let tile = tiles.get(tileKey);
  if (!tile) {
    tile = buildTile(R, rim);
    tiles.set(tileKey, tile);
    trim(tiles);
  }
  const url = assemble(tile, R, w, h);
  const image = new Image();
  image.src = url;
  const ready = image
    .decode()
    .catch(() => undefined)
    .then(() => url);
  maps.set(key, ready);
  trim(maps);
  return ready;
}
