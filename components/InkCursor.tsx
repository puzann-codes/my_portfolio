"use client";

import { useEffect, useRef } from "react";
import { InkSim, INK_FLOATS } from "@/lib/ink-sim";
import { guitarSynth } from "@/lib/audio";

/* ------------------------------------------------------------------ *
 * Pass 1 — every ink particle is drawn as a soft metaball kernel into a
 * half-resolution float field (additive blend): R = ink density,
 * G = density weighted by "wetness".
 * Pass 2 — the field is thresholded into a crisp liquid silhouette with a
 * ragged, paper-bleed edge, then lit from its own gradient (reconstructed
 * normals) so fresh ink has glossy highlights that fade as it dries.
 *
 * The canvas sits ABOVE the page with mix-blend-mode: difference, and the
 * ink is painted white — so it reads as black ink on light areas and as
 * white ink on dark ones, with text flipping colour wherever ink covers it.
 * ------------------------------------------------------------------ */

const VERT_ACC = `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 aPos;
in float aRad;
in float aAng;
in float aStretch;
in float aWet;
uniform vec2 uRes;
out vec2 vUV;
out float vWet;
void main() {
  const float K = 2.2;
  float sx = aRad * sqrt(aStretch) * K;
  float sy = aRad / sqrt(aStretch) * K;
  vec2 local = vec2(aCorner.x * sx, aCorner.y * sy);
  float c = cos(aAng);
  float s = sin(aAng);
  vec2 p = aPos + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
  vUV = aCorner;
  vWet = aWet;
}`;

const FRAG_ACC = `#version 300 es
precision highp float;
in vec2 vUV;
in float vWet;
uniform float uGain;
out vec4 o;
void main() {
  float d2 = dot(vUV, vUV);
  if (d2 >= 1.0) discard;
  float k = 1.0 - d2;
  k = k * k * k * uGain;
  o = vec4(k, k * vWet, 0.0, 0.0);
}`;

const VERT_FS = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uCanvas;   // canvas size in device px
uniform vec2 uCss;      // canvas size in css px
uniform float uDpr;
uniform float uTime;
uniform float uThresh;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 11.7) + 0.2 * vnoise(p * 4.1 + 3.3);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 css = fc / uDpr;
  vec2 uv = vec2(fc.x / uCanvas.x, 1.0 - fc.y / uCanvas.y);

  // slow domain warp: the contour wobbles like a real liquid edge
  vec2 warp = vec2(fbm(css * 0.05 + vec2(0.0, uTime * 0.03)),
                   fbm(css * 0.05 + vec2(7.3, 3.1 - uTime * 0.03))) - 0.5;
  vec2 uvw = uv + warp * 7.0 / uCss;

  vec2 s = texture(uField, uvw).rg;
  float f = s.r;

  // fine paper-fibre grain on the threshold → slightly ragged, bled edge
  float grain = fbm(css * 0.9) - 0.5;
  float T = uThresh * (1.0 + grain * 0.22);
  float aa = max(fwidth(f) * 0.85, 0.0025);
  float a = smoothstep(T - aa, T + aa, f);
  if (a <= 0.002) { outColor = vec4(0.0); return; }

  // reconstructed surface normal from the field gradient
  vec2 px = 1.6 / uCss;
  float h0 = texture(uField, uvw + vec2(px.x, 0.0)).r;
  float h1 = texture(uField, uvw - vec2(px.x, 0.0)).r;
  float h2 = texture(uField, uvw + vec2(0.0, px.y)).r;
  float h3 = texture(uField, uvw - vec2(0.0, px.y)).r;
  vec2 grad = vec2(h0 - h1, h2 - h3);
  vec3 n = normalize(vec3(-grad * 5.0 / uThresh, 1.0));

  float wet = clamp(s.g / max(f, 0.001), 0.0, 1.0);
  vec3 L = normalize(vec3(-0.5, -0.6, 0.65));   // up and to the left
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  float spec = pow(nh, 70.0) * 0.95 + pow(nh, 10.0) * 0.1;

  // soft window reflection low on the thick parts
  vec3 L2 = normalize(vec3(0.6, 0.7, 0.5));
  float spec2 = pow(max(dot(n, normalize(L2 + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.28;

  float gloss = clamp((spec + spec2) * (0.25 + 0.75 * wet), 0.0, 0.82);
  float c = 1.0 - gloss;
  outColor = vec4(vec3(c) * a, a);
}`;

const FIELD_SCALE = 0.75;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("ink shader:", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn("ink program:", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export default function InkCursor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReduced || isCoarse) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const accProg = program(gl, VERT_ACC, FRAG_ACC);
    const finalProg = program(gl, VERT_FS, FRAG_FINAL);
    if (!accProg || !finalProg) return;

    // ---- geometry: unit quad + per-particle instance buffer ----
    const sim = new InkSim();    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(accProg, "aCorner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sim.instance.byteLength, gl.DYNAMIC_DRAW);
    const stride = INK_FLOATS * 4;
    const attribs: [string, number, number][] = [
      ["aPos", 2, 0],
      ["aRad", 1, 8],
      ["aAng", 1, 12],
      ["aStretch", 1, 16],
      ["aWet", 1, 20],
    ];
    for (const [name, size, offset] of attribs) {
      const loc = gl.getAttribLocation(accProg, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    const emptyVao = gl.createVertexArray();

    // ---- field target (half float if the GPU can render to it) ----
    const hasFloat =
      !!gl.getExtension("EXT_color_buffer_float") ||
      !!gl.getExtension("EXT_color_buffer_half_float");
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let useFloat = hasFloat;
    let fieldW = 0;
    let fieldH = 0;

    const allocField = (w: number, h: number) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const make = (float: boolean) => {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          float ? gl.RGBA16F : gl.RGBA8,
          w,
          h,
          0,
          gl.RGBA,
          float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
          null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      };
      if (!(useFloat && make(true))) {
        useFloat = false;
        make(false);
      }
    };

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const fw = Math.ceil(cssW * FIELD_SCALE);
      const fh = Math.ceil(cssH * FIELD_SCALE);
      if (fw !== fieldW || fh !== fieldH) {
        fieldW = fw;
        fieldH = fh;
        allocField(fw, fh);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const uAcc = {
      res: gl.getUniformLocation(accProg, "uRes"),
      gain: gl.getUniformLocation(accProg, "uGain"),
    };
    const uFin = {
      field: gl.getUniformLocation(finalProg, "uField"),
      canvas: gl.getUniformLocation(finalProg, "uCanvas"),
      css: gl.getUniformLocation(finalProg, "uCss"),
      dpr: gl.getUniformLocation(finalProg, "uDpr"),
      time: gl.getUniformLocation(finalProg, "uTime"),
      thresh: gl.getUniformLocation(finalProg, "uThresh"),
    };

    // ---- pointer ----
    const smooth = { x: 0, y: 0 };
    let last: { x: number; y: number; t: number } | null = null;
    let prevSp = 0;
    let lastSplashAt = 0;
    let lastDown = 0;
    const SPLASH_GAP = 130;

    const handleSample = (x: number, y: number, t: number) => {
      if (!last) {
        last = { x, y, t };
        sim.stroke(t, x, y, x + 0.01, y, 0);
        return;
      }
      const dt = Math.max(t - last.t, 1);
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      // px per ~frame, clamped so a near-zero event gap can't fling ink
      let sp = (dist / dt) * 16.67;
      if (sp > 70) sp = 70;
      smooth.x = smooth.x * 0.5 + (dx / dt) * 16.67 * 0.5;
      smooth.y = smooth.y * 0.5 + (dy / dt) * 16.67 * 0.5;
      const spS = Math.hypot(smooth.x, smooth.y);

      sim.stroke(t, last.x, last.y, x, y, sp);

      // hard stop out of a fast stroke: the ink slams forward in a splash
      if (prevSp > 24 && sp < prevSp * 0.3 && dist > 0) {
        sim.splat(t, x, y, Math.min(0.75, prevSp / 60), smooth.x, smooth.y);
      }
      prevSp = sp * 0.5 + prevSp * 0.5;

      if (spS > 1.5 && t - lastSplashAt > SPLASH_GAP) {
        lastSplashAt = t;
        guitarSynth.splash((Math.random() - 0.5) * 200);
      }
      last = { x, y, t };
    };

    const onMove = (e: PointerEvent) => {
      const events = e.getCoalescedEvents?.();
      if (events && events.length > 1) {
        for (const ev of events) handleSample(ev.clientX, ev.clientY, ev.timeStamp);
      } else {
        handleSample(e.clientX, e.clientY, e.timeStamp);
      }
    };

    const onDown = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastDown < 90) return;
      lastDown = now;
      const sp = Math.hypot(smooth.x, smooth.y);
      sim.splat(now, e.clientX, e.clientY, 1, sp > 3 ? smooth.x : 0, sp > 3 ? smooth.y : 0);
      guitarSynth.splash(0);
    };

    const onLeave = () => {
      last = null;
      smooth.x = 0;
      smooth.y = 0;
      prevSp = 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    let visible = !document.hidden;
    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible) {
        sim.clear();
        last = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ---- loop ----
    let rafId = 0;
    let lastFrame = performance.now();
    let drewLastFrame = false;
    const gain = useFloat ? 1 : 0.6;
    const thresh = 0.5 * gain;

    const frame = () => {
      rafId = requestAnimationFrame(frame);
      if (!visible) return;
      const now = performance.now();
      const dtMs = now - lastFrame;
      const dt = Math.min(dtMs / 16.67, 3);
      lastFrame = now;

      if (last) sim.rest(now, last.x, last.y, dtMs);
      sim.update(now, dt);

      if (sim.count === 0) {
        if (drewLastFrame) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          canvas.style.visibility = "hidden";
          drewLastFrame = false;
        }
        return;
      }
      if (!drewLastFrame) canvas.style.visibility = "visible";
      drewLastFrame = true;

      // pass 1: accumulate metaball field
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fieldW, fieldH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(accProg);
      gl.uniform2f(uAcc.res, cssW, cssH);
      gl.uniform1f(uAcc.gain, gain);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.instance, 0, sim.count * INK_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sim.count);

      // pass 2: threshold + light
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.useProgram(finalProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uFin.field, 0);
      gl.uniform2f(uFin.canvas, canvas.width, canvas.height);
      gl.uniform2f(uFin.css, cssW, cssH);
      gl.uniform1f(uFin.dpr, dpr);
      gl.uniform1f(uFin.time, now / 1000);
      gl.uniform1f(uFin.thresh, thresh);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    canvas.style.visibility = "hidden";
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} className="ink-canvas" aria-hidden="true" />;
}
