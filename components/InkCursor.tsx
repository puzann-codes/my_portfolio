"use client";

import { useEffect, useRef } from "react";
import { type BlobShape, randomBlobShape, evolveShape, drawBlobPath } from "@/lib/blob";
import { guitarSynth } from "@/lib/audio";

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  birth: number;
  radius: number;
  shape: BlobShape;
  angle: number;
  stretch: number;
  dark: boolean;
};

const MAX_AGE = 1600; // ms before a splat is fully gone
const BASE_RADIUS = 30;
const MAX_POINTS = 340;
const SHAPE_POINTS = 9;
const SHAPE_MIN = 0.8;
const SHAPE_MAX = 1.25;
// Spawn a main-stream droplet roughly this often (px of cursor travel).
// Dense + heavily overlapping is what reads as one continuous body of
// ink following the path, instead of a chain of separate blobs.
const STREAM_SPACING = 8;
// Per-frame (@60fps) velocity decay for the main stream — small, since
// laid-down ink mostly stays where it was drawn. Breakaway droplets
// (below) get their own, much livelier, inertia.
const FRICTION = 0.9;

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
    const smoothVel = { x: 0, y: 0 };
    // The stream's shape "seed" evolves continuously rather than being
    // re-randomized per stamp, so the ink's undulating edge flows
    // smoothly along its length instead of jumping between unrelated
    // random blobs — like one continuous fluid boundary.
    let flowShape: BlobShape = randomBlobShape(SHAPE_POINTS, SHAPE_MIN, SHAPE_MAX);
    // Slowly random-walks between ~0.7 and ~1.5 so the stream's width
    // breathes unevenly along its length — real ink, not a uniform tube.
    let flowWidth = 1;
    let rafId = 0;
    let visible = true;
    let lastSplashAt = 0;
    const SPLASH_MIN_GAP = 130; // ms — keeps the ink-movement sound soothing, not chattery

    const isDarkZone = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('[data-ink-zone="dark"]');
    };

    const addPoint = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      radius: number,
      shape: BlobShape,
      angle: number,
      stretch: number
    ) => {
      points.push({
        x,
        y,
        vx,
        vy,
        birth: performance.now(),
        radius,
        shape,
        angle,
        stretch,
        dark: isDarkZone(x, y),
      });
      if (points.length > MAX_POINTS) points.shift();
    };

    /** One droplet of the continuous stream: stays close to where it was
     * drawn (a little inertia so the trailing edge still eases to a
     * stop), elongated along the direction of travel like a real fluid
     * stroke rather than a stamped circle. */
    const spawnStreamPoint = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      speed: number,
      angle: number
    ) => {
      flowWidth += (Math.random() - 0.5) * 0.14;
      flowWidth = Math.min(1.5, Math.max(0.7, flowWidth));
      flowShape = evolveShape(flowShape, 0.1, SHAPE_MIN, SHAPE_MAX);

      const speedBoost = 1 + Math.min(speed, 30) * 0.01;
      const stretch = 1 + Math.min(speed, 30) * 0.035;
      addPoint(
        x,
        y,
        vx * 0.12 + (Math.random() - 0.5) * 0.5,
        vy * 0.12 + (Math.random() - 0.5) * 0.5,
        BASE_RADIUS * flowWidth * speedBoost,
        flowShape,
        angle,
        stretch
      );
    };

    /** Ink breaking away from the main stream and flicking off on its
     * own — a small (but not speck-tiny) dab with a distinctly
     * independent trajectory so it visibly separates over time, instead
     * of every drop staying glued to the path. */
    const spawnBreakaway = (x: number, y: number, vx: number, vy: number) => {
      const angle = Math.random() * Math.PI * 2;
      const kick = 5 + Math.random() * 8;
      addPoint(
        x + Math.cos(angle) * kick * 0.5,
        y + Math.sin(angle) * kick * 0.5,
        vx * 0.55 + Math.cos(angle) * kick,
        vy * 0.55 + Math.sin(angle) * kick,
        BASE_RADIUS * (0.5 + Math.random() * 0.35),
        randomBlobShape(SHAPE_POINTS, SHAPE_MIN, SHAPE_MAX),
        angle,
        1.15
      );
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const now = performance.now();

      if (last) {
        const dt = Math.max(now - last.t, 1);
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.hypot(dx, dy);

        // velocity in px per ~frame (16.67ms), smoothed to avoid jitter.
        // Clamped so a sub-millisecond event gap (synthetic input, a
        // resumed/backgrounded tab, etc.) can't fling droplets off-screen.
        const MAX_SPEED = 55;
        const rawSpeed = (dist / dt) * 16.67;
        const clampFactor = rawSpeed > MAX_SPEED ? MAX_SPEED / rawSpeed : 1;
        const vx = ((dx / dt) * 16.67) * clampFactor;
        const vy = ((dy / dt) * 16.67) * clampFactor;
        smoothVel.x = smoothVel.x * 0.4 + vx * 0.6;
        smoothVel.y = smoothVel.y * 0.4 + vy * 0.6;

        const speed = Math.hypot(smoothVel.x, smoothVel.y);
        const angle = dist > 0.5 ? Math.atan2(dy, dx) : 0;

        // Walk along the path in small steps so fast strokes still lay
        // down a continuous line instead of leaving gaps.
        const steps = Math.max(1, Math.round(dist / STREAM_SPACING));
        for (let i = 1; i <= steps; i++) {
          const px = last.x + (dx * i) / steps;
          const py = last.y + (dy * i) / steps;
          spawnStreamPoint(px, py, smoothVel.x, smoothVel.y, speed, angle);

          // Occasionally a bit of the stream splits off on its own —
          // more likely the faster the cursor is moving.
          if (Math.random() < Math.min(0.22, speed / 55)) {
            spawnBreakaway(px, py, smoothVel.x, smoothVel.y);
          }
        }

        // A soft droplet sound as the ink moves — throttled so it stays a
        // soothing texture rather than firing on every single frame.
        if (speed > 1.5 && now - lastSplashAt > SPLASH_MIN_GAP) {
          lastSplashAt = now;
          guitarSynth.splash((Math.random() - 0.5) * 200);
        }
      } else {
        spawnStreamPoint(x, y, 0, 0, 0, 0);
      }

      last = { x, y, t: now };
    };

    const onLeave = () => {
      last = null;
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
        ctx.filter = "blur(15px) contrast(15)";
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
        ctx.fillStyle = p.dark
          ? `rgba(255,255,255,${supportsFilter ? 1 : alpha})`
          : `rgba(10,10,10,${supportsFilter ? 1 : alpha})`;
        drawBlobPath(ctx, p.x, p.y, radius, p.shape, p.angle, p.stretch, 1);
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
