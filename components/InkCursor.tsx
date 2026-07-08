"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  birth: number;
  radius: number;
  /** Fixed-at-spawn radius multipliers around the circle, so each blob
   * reads as an irregular ink splat instead of a perfect circle. */
  shape: number[];
};

const MAX_AGE = 1700; // ms before a splat is fully gone
const BASE_RADIUS = 36;
const MAX_POINTS = 220;
const SHAPE_POINTS = 8;
// Minimum cursor travel (px) between splash events. Gating spawns by
// distance (instead of firing on every pointermove) is what keeps each
// splash a distinct blob instead of a continuous painted bar.
const MIN_SPAWN_DIST = 30;
// Per-frame (@60fps) velocity decay. Total drift distance asymptotes to
// v0 / (1 - FRICTION); with the velocity factors below this lands around
// 90-160px of clearly visible "keeps sliding, then eases to a stop" travel.
const FRICTION = 0.94;

function randomShape(): number[] {
  const shape: number[] = [];
  for (let i = 0; i < SHAPE_POINTS; i++) {
    shape.push(0.72 + Math.random() * 0.56);
  }
  return shape;
}

/** Draws a smooth, irregular closed blob through points placed around a
 * circle at randomized (but fixed-per-point) radii — a quadratic curve
 * through each pair's midpoint, same technique as the guitar body, so it
 * reads as one organic ink splat rather than a geometric circle. */
function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  shape: number[]
) {
  const n = shape.length;
  const pts = shape.map((m, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = radius * m;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  const start = {
    x: (pts[n - 1].x + pts[0].x) / 2,
    y: (pts[n - 1].y + pts[0].y) / 2,
  };
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
    ctx.quadraticCurveTo(cur.x, cur.y, mid.x, mid.y);
  }
  ctx.closePath();
  ctx.fill();
}

export default function InkCursor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReduced || isCoarse) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const points: Point[] = [];
    let last: { x: number; y: number; t: number } | null = null;
    let lastSpawn: { x: number; y: number } | null = null;
    const smoothVel = { x: 0, y: 0 };
    let rafId = 0;
    let visible = true;

    const addPoint = (x: number, y: number, vx: number, vy: number, radius: number) => {
      points.push({ x, y, vx, vy, birth: performance.now(), radius, shape: randomShape() });
      if (points.length > MAX_POINTS) points.shift();
    };

    /** One splash event: a core droplet at the cursor position plus a
     * tight cluster of similarly-large satellites huddled close around
     * it — like a real ink drop hitting paper (one dense, congested
     * splat), not dots scattered wide. Every droplet shares most of its
     * motion with the cursor's own velocity (the "forward" term) so the
     * whole cluster drifts together naturally; only a small radial
     * nudge is added per-droplet so they don't all sit on one point. */
    const spawnSplash = (x: number, y: number, vx: number, vy: number) => {
      const speed = Math.hypot(vx, vy);

      addPoint(
        x,
        y,
        vx * 0.42 + (Math.random() - 0.5) * 2,
        vy * 0.42 + (Math.random() - 0.5) * 2,
        BASE_RADIUS * (0.95 + Math.random() * 0.5)
      );

      const dropletCount = speed > 18 ? 3 : speed > 8 ? 2 : 1;
      for (let i = 0; i < dropletCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const outward = 3 + Math.random() * (3 + Math.min(speed, 30) * 0.25);
        const forward = 0.3 + Math.random() * 0.35;
        addPoint(
          x + Math.cos(angle) * outward * 0.22,
          y + Math.sin(angle) * outward * 0.22,
          vx * forward + Math.cos(angle) * outward * 0.22,
          vy * forward + Math.sin(angle) * outward * 0.22,
          BASE_RADIUS * (0.6 + Math.random() * 0.42)
        );
      }
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const now = performance.now();

      if (last) {
        const dt = Math.max(now - last.t, 1);
        const dx = x - last.x;
        const dy = y - last.y;

        // velocity in px per ~frame (16.67ms), smoothed to avoid jitter.
        // Clamped so a sub-millisecond event gap (synthetic input, a
        // resumed/backgrounded tab, etc.) can't fling droplets off-screen.
        const dist = Math.hypot(dx, dy);
        const MAX_SPEED = 55;
        const rawSpeed = (dist / dt) * 16.67;
        const clampFactor = rawSpeed > MAX_SPEED ? MAX_SPEED / rawSpeed : 1;
        const vx = ((dx / dt) * 16.67) * clampFactor;
        const vy = ((dy / dt) * 16.67) * clampFactor;
        smoothVel.x = smoothVel.x * 0.4 + vx * 0.6;
        smoothVel.y = smoothVel.y * 0.4 + vy * 0.6;
      }

      if (!lastSpawn || Math.hypot(x - lastSpawn.x, y - lastSpawn.y) >= MIN_SPAWN_DIST) {
        spawnSplash(x, y, smoothVel.x, smoothVel.y);
        lastSpawn = { x, y };
      }

      last = { x, y, t: now };
    };

    const onLeave = () => {
      last = null;
      lastSpawn = null;
      smoothVel.x = 0;
      smoothVel.y = 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    const onVisibility = () => {
      visible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    let supportsFilter = true;
    try {
      ctx.filter = "blur(1px)";
      ctx.filter = "none";
    } catch {
      supportsFilter = false;
    }

    let lastFrame = performance.now();

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      if (!visible) return;

      const now = performance.now();
      const frameScale = Math.min((now - lastFrame) / 16.67, 3);
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      if (points.length === 0) return;

      if (supportsFilter) {
        ctx.filter = "blur(13px) contrast(17)";
      }

      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        const age = now - p.birth;
        if (age > MAX_AGE) {
          points.splice(i, 1);
          continue;
        }

        // inertia: keep drifting in the direction it was flung, decelerating
        p.x += p.vx * frameScale;
        p.y += p.vy * frameScale;
        p.vx *= Math.pow(FRICTION, frameScale);
        p.vy *= Math.pow(FRICTION, frameScale);

        const t = age / MAX_AGE;
        const grow = Math.min(t / 0.12, 1);
        const shrink = t < 0.2 ? 1 : 1 - Math.pow((t - 0.2) / 0.8, 2);
        const radius = p.radius * (0.4 + grow * 0.6) * Math.max(shrink, 0);
        const alpha = 1 - t;

        if (radius <= 0.5) continue;

        ctx.globalAlpha = supportsFilter ? 1 : alpha * 0.6;
        ctx.fillStyle = `rgba(10,10,10,${supportsFilter ? 1 : alpha})`;
        drawBlob(ctx, p.x, p.y, radius, p.shape);
      }

      if (supportsFilter) {
        ctx.filter = "none";
      }
      ctx.globalAlpha = 1;
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="ink-canvas" aria-hidden="true" />;
}
