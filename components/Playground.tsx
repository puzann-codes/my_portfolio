"use client";

import { useEffect, useRef, useState } from "react";
import { TOP_PROJECTS } from "@/data/projects";
import { guitarSynth, STRING_NOTES } from "@/lib/audio";

// Pad centres as fractions of the arena. Six pads, one per guitar string.
const PADS = [
  { fx: 0.16, fy: 0.3 },
  { fx: 0.5, fy: 0.22 },
  { fx: 0.84, fy: 0.3 },
  { fx: 0.16, fy: 0.66 },
  { fx: 0.5, fy: 0.72 },
  { fx: 0.84, fy: 0.66 },
];

const DRIVE_KEYS = [
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "w",
  "a",
  "s",
  "d",
  " ",
];

/** A drivable guitar pick. Arrow keys / WASD (after clicking the arena) or
 * press-and-hold to steer toward the pointer. Drive onto a pad to pluck its
 * string and open its project; the pick leaves skid marks in ink. */
export default function Playground() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLCanvasElement | null>(null);
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(-1);
  const [driving, setDriving] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    // matchMedia is client-only, so it can't seed initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const trail = trailRef.current;
    const main = mainRef.current;
    if (!wrap || !trail || !main) return;
    const tctx = trail.getContext("2d");
    const mctx = main.getContext("2d");
    if (!tctx || !mctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let padR = 44;
    let placed = false;
    const car = { x: 0, y: 0, vx: 0, vy: 0, a: 0 };
    let prevL: { x: number; y: number } | null = null;
    let prevR: { x: number; y: number } | null = null;
    const glow = PADS.map(() => 0);
    let currentPad = -1;

    const keys = new Set<string>();
    const pointer = { x: 0, y: 0, down: false };
    let focused = false;
    let inView = false;
    let rafId = 0;
    let lastT = performance.now();

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      padR = Math.max(34, Math.min(56, Math.min(w, h) * 0.075));
      for (const c of [trail, main]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!placed) {
        car.x = w / 2;
        car.y = h / 2;
        placed = true;
      } else {
        car.x = Math.min(Math.max(car.x, 18), w - 18);
        car.y = Math.min(Math.max(car.y, 18), h - 18);
      }
      prevL = prevR = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (!inView) {
          focused = false;
          keys.clear();
          pointer.down = false;
          setDriving(false);
        }
      },
      { threshold: 0.15 }
    );
    io.observe(wrap);

    const localPoint = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onDown = (e: PointerEvent) => {
      guitarSynth.unlock();
      focused = true;
      pointer.down = true;
      localPoint(e);
      setDriving(true);
    };
    const onMove = (e: PointerEvent) => localPoint(e);
    const onUp = () => {
      pointer.down = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        focused = false;
        keys.clear();
        setDriving(false);
        return;
      }
      if (!focused || !DRIVE_KEYS.includes(k)) return;
      e.preventDefault();
      keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onDocDown = (e: PointerEvent) => {
      if (!wrap.contains(e.target as Node)) {
        focused = false;
        keys.clear();
        setDriving(false);
      }
    };

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerdown", onDocDown);

    const step = (dt: number) => {
      let throttle = 0;
      let steer = 0;
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 0.6;
      if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
      if (keys.has("d") || keys.has("arrowright")) steer += 1;
      const brake = keys.has(" ");

      if (pointer.down) {
        const dx = pointer.x - car.x;
        const dy = pointer.y - car.y;
        if (Math.hypot(dx, dy) > 36) {
          let diff = Math.atan2(dy, dx) - car.a;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          steer = Math.max(-1, Math.min(1, diff * 2.2));
          throttle = 1;
        }
      }

      const cos = Math.cos(car.a);
      const sin = Math.sin(car.a);
      let fwd = car.vx * cos + car.vy * sin;
      let lat = -car.vx * sin + car.vy * cos;

      fwd += throttle * 0.3 * dt;
      fwd *= Math.pow(brake ? 0.9 : 0.972, dt);
      // Low lateral grip is what lets the pick drift through corners.
      lat *= Math.pow(brake ? 0.97 : 0.86, dt);

      const grip = Math.max(0.3, Math.min(Math.abs(fwd) / 3, 1));
      car.a += steer * 0.07 * grip * (fwd >= 0 ? 1 : -1) * dt;

      const c2 = Math.cos(car.a);
      const s2 = Math.sin(car.a);
      car.vx = fwd * c2 - lat * s2;
      car.vy = fwd * s2 + lat * c2;
      car.x += car.vx * dt;
      car.y += car.vy * dt;

      const m = 18;
      if (car.x < m) {
        car.x = m;
        car.vx = Math.abs(car.vx) * 0.5;
      } else if (car.x > w - m) {
        car.x = w - m;
        car.vx = -Math.abs(car.vx) * 0.5;
      }
      if (car.y < m) {
        car.y = m;
        car.vy = Math.abs(car.vy) * 0.5;
      } else if (car.y > h - m) {
        car.y = h - m;
        car.vy = -Math.abs(car.vy) * 0.5;
      }

      // skid marks from the two "rear wheels"
      const speed = Math.hypot(car.vx, car.vy);
      const rx = car.x - c2 * 12;
      const ry = car.y - s2 * 12;
      const L = { x: rx + s2 * 7, y: ry - c2 * 7 };
      const R = { x: rx - s2 * 7, y: ry + c2 * 7 };
      if (speed > 0.8 && prevL && prevR) {
        tctx.strokeStyle = `rgba(255,255,255,${0.22 + Math.min(Math.abs(lat) / 4, 0.5)})`;
        tctx.lineWidth = 2.4;
        tctx.lineCap = "round";
        tctx.beginPath();
        tctx.moveTo(prevL.x, prevL.y);
        tctx.lineTo(L.x, L.y);
        tctx.moveTo(prevR.x, prevR.y);
        tctx.lineTo(R.x, R.y);
        tctx.stroke();
      }
      prevL = L;
      prevR = R;

      // pad hit-test
      let inside = -1;
      PADS.forEach((p, i) => {
        if (Math.hypot(car.x - p.fx * w, car.y - p.fy * h) < padR) inside = i;
      });
      if (inside !== -1 && inside !== currentPad) {
        guitarSynth.pluck(STRING_NOTES[inside].freq);
        setActive(inside);
      }
      currentPad = inside;
      PADS.forEach((_, i) => {
        glow[i] += ((i === inside ? 1 : 0) - glow[i]) * Math.min(0.16 * dt, 1);
      });
    };

    const draw = () => {
      // fade old skid marks
      tctx.globalCompositeOperation = "destination-out";
      tctx.fillStyle = "rgba(0,0,0,0.045)";
      tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = "source-over";

      mctx.clearRect(0, 0, w, h);
      PADS.forEach((p, i) => {
        const px = p.fx * w;
        const py = p.fy * h;
        const g = glow[i];
        mctx.beginPath();
        mctx.arc(px, py, padR * (1 + g * 0.08), 0, Math.PI * 2);
        mctx.fillStyle = `rgba(255,255,255,${0.04 + g * 0.2})`;
        mctx.fill();
        mctx.lineWidth = 1.5;
        mctx.strokeStyle = `rgba(255,255,255,${0.28 + g * 0.65})`;
        mctx.setLineDash(g > 0.5 ? [] : [5, 6]);
        mctx.stroke();
        mctx.setLineDash([]);

        mctx.textAlign = "center";
        mctx.fillStyle = `rgba(255,255,255,${0.7 + g * 0.3})`;
        mctx.font = "600 13px ui-monospace, Menlo, monospace";
        mctx.fillText(STRING_NOTES[i].note, px, py + 4);
        mctx.fillStyle = `rgba(255,255,255,${0.4 + g * 0.5})`;
        mctx.font = "500 10px ui-monospace, Menlo, monospace";
        mctx.fillText(TOP_PROJECTS[i].title.toUpperCase(), px, py + padR + 18);
      });

      // the pick
      mctx.save();
      mctx.translate(car.x, car.y);
      mctx.rotate(car.a);
      mctx.shadowColor = "rgba(255,255,255,0.35)";
      mctx.shadowBlur = 16;
      mctx.beginPath();
      mctx.moveTo(18, 0);
      mctx.quadraticCurveTo(2, -17, -14, -13);
      mctx.quadraticCurveTo(-21, 0, -14, 13);
      mctx.quadraticCurveTo(2, 17, 18, 0);
      mctx.closePath();
      mctx.fillStyle = "#ffffff";
      mctx.fill();
      mctx.shadowBlur = 0;
      mctx.beginPath();
      mctx.arc(-3, 0, 2.6, 0, Math.PI * 2);
      mctx.fillStyle = "#0a0a0a";
      mctx.fill();
      mctx.restore();
    };

    const loop = (t: number) => {
      rafId = requestAnimationFrame(loop);
      const dt = Math.min((t - lastT) / 16.67, 3);
      lastT = t;
      if (!inView) return;
      step(dt);
      draw();
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerdown", onDocDown);
    };
  }, []);

  const project = active >= 0 ? TOP_PROJECTS[active] : null;

  return (
    <section
      id="playground"
      className="relative w-full bg-[#0a0a0a] text-white px-6 md:px-10 pt-20 md:pt-28 pb-24 md:pb-32"
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-8 md:mb-12">
          <div>
            <p className="font-display text-xs tracking-[0.25em] uppercase mb-3 text-white/60">
              02 — Playground
            </p>
            <h2 className="font-display font-black text-[10vw] md:text-[5.2vw] leading-[0.9] tracking-tight">
              Take the pick
              <br />
              for a spin.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-white/65">
            Park on a pad to pluck its string and pull up the project. Skid
            marks are free.
          </p>
        </div>

        <div
          ref={wrapRef}
          data-cursor-hover
          className={`relative w-full overflow-hidden rounded-3xl border border-white/15 select-none ${
            driving ? "cursor-none ring-1 ring-white/40" : ""
          }`}
          style={{
            height: coarse ? "62svh" : "min(70vh, 700px)",
            touchAction: coarse ? "none" : undefined,
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          <canvas ref={trailRef} className="absolute inset-0 block" />
          <canvas ref={mainRef} className="absolute inset-0 block" />

          <div
            className={`pointer-events-none absolute left-4 top-4 md:left-6 md:top-6 flex flex-wrap items-center gap-2 text-[11px] md:text-xs tracking-wide transition-opacity duration-500 ${
              driving ? "opacity-100" : "opacity-60"
            }`}
          >
            {coarse ? (
              <span className="rounded-full border border-white/25 px-3 py-1.5">
                Press &amp; hold to steer
              </span>
            ) : (
              <>
                <span className="rounded-full border border-white/25 px-3 py-1.5">
                  {driving ? "WASD / arrows" : "Click to drive"}
                </span>
                <span className="rounded-full border border-white/25 px-3 py-1.5">
                  Space: drift-brake
                </span>
                <span className="rounded-full border border-white/25 px-3 py-1.5">
                  Esc: let go
                </span>
              </>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 right-3 md:bottom-5 md:left-5 md:right-5 flex justify-center">
            {project ? (
              <div
                key={project.slug}
                className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-white/20 bg-white/[0.07] backdrop-blur-md px-5 py-3 animate-[fadein_0.4s_ease]"
              >
                <h3 className="font-display font-bold text-base md:text-lg">
                  {project.title}
                </h3>
                <p className="text-[11px] tracking-widest uppercase text-white/50">
                  {project.category} · {project.year}
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-white/20 text-white/70"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-full border border-dashed border-white/25 px-4 py-2 text-[11px] tracking-widest uppercase text-white/50">
                Find a pad
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
