/**
 * The rim lens for browsers that can't run an SVG filter inside backdrop-filter
 * (Safari, Firefox). Instead of asking the browser to bend whatever is behind the
 * glass, we draw the bent backdrop ourselves: a fragment shader samples the
 * backdrop picture with the same bend, colour split and blur, and the result is
 * copied into a plain canvas that sits under the glass's tint.
 *
 * It can only bend a backdrop it is given as an image, canvas or video. Other page
 * content behind the glass (including other glass surfaces) does not show through.
 *
 * One hidden WebGL context serves every surface, so the page never runs into the
 * browser's limit on contexts.
 */

export interface LensFrame {
  /** The backdrop picture, and a number that changes whenever its pixels do. */
  image: TexImageSource;
  version: number;
  /** Backdrop size on screen, CSS px. */
  backW: number;
  backH: number;
  /** The surface's box relative to the backdrop, CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius of the bend field, rim width and largest bend, CSS px. */
  radius: number;
  rim: number;
  push: number;
  /** Colour split, 0–1. */
  split: number;
  /** Blur, CSS px. */
  blur: number;
}

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec2 uBack;
uniform float uDpr;
uniform float uRadius;
uniform float uRim;
uniform float uPush;
uniform float uSplit;
uniform float uBlur;

vec3 tap(vec2 p) {
  return texture2D(uTex, clamp((uOrigin + p) / uBack, 0.0, 1.0)).rgb;
}

// 5 x 5 binomial blur with taps one blur-radius apart.
vec3 soft(vec2 p) {
  if (uBlur <= 0.0) return tap(p);
  vec3 sum = vec3(0.0);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float wi = i == 0 ? 6.0 : (i == 1 || i == -1 ? 4.0 : 1.0);
      float wj = j == 0 ? 6.0 : (j == 1 || j == -1 ? 4.0 : 1.0);
      sum += tap(p + vec2(float(i), float(j)) * uBlur) * wi * wj;
    }
  }
  return sum / 256.0;
}

void main() {
  // p: this pixel inside the surface, CSS px from its top-left corner.
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 c = p - uSize * 0.5;
  vec2 s = vec2(c.x < 0.0 ? -1.0 : 1.0, c.y < 0.0 ? -1.0 : 1.0);
  vec2 q = abs(c) - (uSize * 0.5 - uRadius);

  // depth: distance in from the edge. n: direction pointing out of the glass.
  float depth;
  vec2 n;
  if (q.x > 0.0 && q.y > 0.0) {
    float len = length(q);
    depth = uRadius - len;
    n = q / len * s;
  } else if (q.x > q.y) {
    depth = uRadius - q.x;
    n = vec2(s.x, 0.0);
  } else {
    depth = uRadius - q.y;
    n = vec2(0.0, s.y);
  }

  // Same curve as displacement.ts: look further inside the glass, hardest at the edge.
  float t = clamp(1.0 - depth / uRim, 0.0, 1.0);
  vec2 bend = -n * pow(t, 2.6) * uPush;

  vec3 color;
  if (uSplit > 0.0 && t > 0.0) {
    color = vec3(soft(p + bend * (1.0 + uSplit)).r, soft(p + bend).g, soft(p + bend * (1.0 - uSplit)).b);
  } else {
    color = soft(p + bend);
  }
  gl_FragColor = vec4(color, 1.0);
}`;

interface Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  uniforms: Record<string, WebGLUniformLocation | null>;
  image: TexImageSource | null;
  version: number;
}

let renderer: Renderer | null | undefined;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function create(): Renderer | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One triangle that covers the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uniforms: Renderer['uniforms'] = {};
  for (const name of ['uSize', 'uOrigin', 'uBack', 'uDpr', 'uRadius', 'uRim', 'uPush', 'uSplit', 'uBlur']) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  // A lost context (tab backgrounded, GPU reset) is rebuilt on the next draw.
  canvas.addEventListener('webglcontextlost', () => {
    renderer = undefined;
  });
  return { canvas, gl, uniforms, image: null, version: -1 };
}

function get(): Renderer | null {
  if (renderer === undefined) {
    try {
      renderer = create();
    } catch {
      renderer = null;
    }
  }
  return renderer;
}

/** True when this browser can draw the lens this way. */
export const canDrawLens = () => get() !== null;

/** Draws one surface's bent backdrop into `target`. Returns false if nothing could be drawn. */
export function drawLens(target: HTMLCanvasElement, frame: LensFrame): boolean {
  const r = get();
  const out = target.getContext('2d');
  if (!r || !out || frame.w < 1 || frame.h < 1 || frame.backW < 1 || frame.backH < 1) return false;
  const { gl, canvas, uniforms } = r;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(frame.w * dpr);
  const ph = Math.round(frame.h * dpr);

  try {
    // The backdrop is uploaded once and again only when its pixels change.
    if (r.image !== frame.image || r.version !== frame.version) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.image);
      r.image = frame.image;
      r.version = frame.version;
    }
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    gl.viewport(0, 0, pw, ph);
    gl.uniform2f(uniforms.uSize, frame.w, frame.h);
    gl.uniform2f(uniforms.uOrigin, frame.x, frame.y);
    gl.uniform2f(uniforms.uBack, frame.backW, frame.backH);
    gl.uniform1f(uniforms.uDpr, dpr);
    gl.uniform1f(uniforms.uRadius, frame.radius);
    gl.uniform1f(uniforms.uRim, Math.max(frame.rim, 0.001));
    gl.uniform1f(uniforms.uPush, frame.push);
    gl.uniform1f(uniforms.uSplit, frame.split);
    gl.uniform1f(uniforms.uBlur, frame.blur);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (target.width !== pw || target.height !== ph) {
      target.width = pw;
      target.height = ph;
    }
    out.drawImage(canvas, 0, 0);
    return true;
  } catch {
    // A backdrop the browser won't let us read (cross-origin) ends up here.
    return false;
  }
}
