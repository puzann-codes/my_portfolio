"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The pointer stays a normal, native pointer. What this adds is air: as the
 * pointer moves, a few extremely faint strands drift off it and fade, scaled by
 * speed. Hold still and nothing is emitted. The 3D scene gets the same motion
 * as a real airflow (see Desk.blow), which is what moves the leaves.
 */
type Strand = { x: number; y: number; vx: number; vy: number; life: number; max: number; len: number; curl: number };

export default function AirCursor() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches || prefersReducedMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const strands: Strand[] = [];
    let lx = -1;
    let ly = -1;
    let lt = 0;
    let raf = 0;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      if (lx >= 0 && now - lt < 120) {
        const dx = e.clientX - lx;
        const dy = e.clientY - ly;
        const dt = Math.max(1, now - lt);
        const speed = Math.hypot(dx, dy) / dt; // px per ms
        // a slow drift makes (almost) nothing; a quick flick makes a few strands
        const n = speed < 0.35 ? 0 : Math.min(3, Math.floor((speed - 0.2) * 2.2) + (Math.random() < 0.5 ? 1 : 0));
        for (let i = 0; i < n && strands.length < 40; i++) {
          const k = Math.min(1.8, speed);
          strands.push({
            x: e.clientX - dx * Math.random() * 0.8 + (Math.random() - 0.5) * 6,
            y: e.clientY - dy * Math.random() * 0.8 + (Math.random() - 0.5) * 6,
            vx: dx / dt * 14 * 0.25 + (Math.random() - 0.5) * 8,
            vy: dy / dt * 14 * 0.25 + (Math.random() - 0.5) * 8 - 3,
            life: 0,
            max: 0.55 + Math.random() * 0.35,
            len: 10 + k * 16 + Math.random() * 10,
            curl: (Math.random() - 0.5) * 1.4,
          });
        }
      }
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const frame = () => {
      raf = 0;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.lineCap = "round";
      for (let i = strands.length - 1; i >= 0; i--) {
        const s = strands[i];
        s.life += dt;
        if (s.life >= s.max) {
          strands.splice(i, 1);
          continue;
        }
        const k = s.life / s.max;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - dt * 2.4;
        s.vy *= 1 - dt * 2.4;
        const a = Math.sin(Math.PI * k) * 0.16;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        const ux = s.vx / sp;
        const uy = s.vy / sp;
        const L = s.len * (0.6 + 0.4 * k);
        ctx.strokeStyle = `rgba(214,228,245,${a.toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(s.x - ux * L, s.y - uy * L);
        ctx.quadraticCurveTo(s.x - ux * L * 0.4 - uy * L * s.curl * 0.3, s.y - uy * L * 0.4 + ux * L * s.curl * 0.3, s.x, s.y);
        ctx.stroke();
      }
      if (strands.length) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9990, width: "100vw", height: "100vh" }}
    />
  );
}
