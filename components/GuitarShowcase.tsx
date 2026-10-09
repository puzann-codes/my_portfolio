"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import {
  VB,
  STRING_Y,
  STRING_WEIGHT,
  SOUNDHOLE,
  ROSETTE_RINGS,
  fretXs,
  inlayDots,
  maxFillRadius,
} from "@/lib/guitar";
import { mixColor, smoothstep, lerp } from "@/lib/color";
import { guitarSynth, STRING_NOTES, AUDIO_STATE_EVENT } from "@/lib/audio";
import { type BlobShape, randomBlobShape, drawBlobPath } from "@/lib/blob";
import { TOP_PROJECTS } from "@/data/projects";

gsap.registerPlugin(ScrollTrigger);

const INK = "#0a0a0a";
const PAPER = "#ffffff";
const HIT_THRESHOLD = 20;
const FILL_DURATION = 4200; // ms for the ink to fully cover the body once triggered

type AssemblyState = {
  soundholeScale: number;
  soundholeAlpha: number;
  fretsAlpha: number;
  strings: number[];
};

type FillState = {
  triggered: boolean;
  ox: number;
  oy: number;
  maxRadius: number;
  startedAt: number;
  progress: number;
  shape: BlobShape;
};

export default function GuitarShowcase() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(-1);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pageInked, setPageInked] = useState(false);
  const pageInkedRef = useRef(false);

  const assemblyRef = useRef<AssemblyState>({
    soundholeScale: 0.001,
    soundholeAlpha: 0,
    fretsAlpha: 0,
    strings: [0, 0, 0, 0, 0, 0],
  });
  const assembledRef = useRef(false);
  const glowRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const hoveredRef = useRef(-1);
  const fillRef = useRef<FillState>({
    triggered: false,
    ox: 0,
    oy: 0,
    maxRadius: 0,
    startedAt: 0,
    progress: 0,
    shape: [],
  });

  useEffect(() => {
    // The synth's on/off flag lives outside React (module-level singleton),
    // so it can only be read client-side on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudioUnlocked(guitarSynth.isEnabled);
    const onState = () => setAudioUnlocked(guitarSynth.isEnabled);
    window.addEventListener(AUDIO_STATE_EVENT, onState);
    return () => window.removeEventListener(AUDIO_STATE_EVENT, onState);
  }, []);

  // ------- scroll-triggered assembly -------
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // Animate the individual reveal-text elements directly rather than
      // their wrapping div: any transform on an ANCESTOR of a
      // mix-blend-mode element creates a stacking context that isolates
      // it from blending against the ink canvas at all (it would render
      // as flat white-on-white instead of inverting). Animating the
      // blended elements themselves carries no such risk.
      const headingTexts = headingRef.current?.querySelectorAll(".reveal-text");
      if (headingTexts?.length) {
        gsap.set(headingTexts, { opacity: 0, y: 40 });
      }

      ScrollTrigger.create({
        trigger: section,
        start: "top 68%",
        once: true,
        onEnter: () => {
          if (headingTexts?.length) {
            gsap.to(headingTexts, {
              opacity: 1,
              y: 0,
              duration: 0.9,
              stagger: 0.06,
              ease: "power4.out",
              // Same fix as Hero.tsx: a lingering non-"none" transform
              // (even translate(0,0)) isolates mix-blend-mode on these
              // .reveal-text elements, permanently flattening them to white
              // instead of inverting against the ink. Clear it once the
              // reveal finishes.
              onComplete: () => gsap.set(headingTexts, { clearProps: "transform" }),
            });
          }

          const state = assemblyRef.current;
          const tl = gsap.timeline({
            onComplete: () => {
              assembledRef.current = true;
            },
          });
          tl.to(
            state,
            { soundholeScale: 1, soundholeAlpha: 1, duration: 0.7, ease: "back.out(1.5)" },
            0
          );
          tl.to(state, { fretsAlpha: 1, duration: 0.6, ease: "power2.out" }, 0.35);
          for (let i = 0; i < 6; i++) {
            tl.to(
              state.strings,
              { [i]: 1, duration: 0.32, ease: "power2.out" },
              0.55 + i * 0.07
            );
          }
        },
      });

      if (headingTexts?.length) {
        gsap.to(headingTexts, {
          yPercent: -10,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      }
      if (canvasWrapRef.current) {
        gsap.fromTo(
          canvasWrapRef.current,
          { yPercent: 4 },
          {
            yPercent: -4,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.6,
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  // ------- canvas render loop + interaction -------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frets = fretXs();
    const dots = inlayDots();

    let cssScale = 1; // VB units -> CSS px (cover-fit, uniform)
    let offsetX = 0;
    let offsetY = 0;
    let totalScale = 1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssScale = Math.max(rect.width / VB.w, rect.height / VB.h);
      offsetX = (rect.width - VB.w * cssScale) / 2;
      offsetY = (rect.height - VB.h * cssScale) / 2;
      totalScale = cssScale * dpr;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toVB = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - offsetX) / cssScale,
        y: (clientY - rect.top - offsetY) / cssScale,
      };
    };

    const triggerFill = (vx: number, vy: number) => {
      if (fillRef.current.triggered) return;
      const shape = randomBlobShape(13, 0.68, 1.35);
      // The blob's reach varies by direction (radius * shape[i]), so a
      // "radius" that only just reaches the farthest corner leaves gaps
      // wherever the shape dips below 1 — that's what left an unfilled
      // sliver behind. Scaling up by 1/min(shape) guarantees even the
      // shortest arm still reaches full coverage at progress 1.
      const minMul = Math.min(...shape);
      fillRef.current = {
        triggered: true,
        ox: vx,
        oy: vy,
        maxRadius: maxFillRadius(vx, vy) / minMul,
        startedAt: performance.now(),
        progress: 0,
        shape,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!assembledRef.current) return;
      const { x: vx, y: vy } = toVB(e.clientX, e.clientY);

      triggerFill(vx, vy);

      let closest = -1;
      let closestDist = HIT_THRESHOLD;
      STRING_Y.forEach((sy, i) => {
        const d = Math.abs(vy - sy);
        if (d < closestDist) {
          closestDist = d;
          closest = i;
        }
      });
      if (closest !== hoveredRef.current) {
        hoveredRef.current = closest;
        setActiveIndex(closest);
        if (closest !== -1) {
          guitarSynth.pluck(STRING_NOTES[closest].freq);
        }
      }
    };
    const onLeave = () => {
      hoveredRef.current = -1;
      setActiveIndex(-1);
    };
    const onDown = () => {
      guitarSynth.unlock();
    };

    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);

    let rafId = 0;

    const drawAssembly = () => {
      const s = assemblyRef.current;

      ctx.save();
      ctx.translate(SOUNDHOLE.x, SOUNDHOLE.y);
      ctx.scale(Math.max(s.soundholeScale, 0.001), Math.max(s.soundholeScale, 0.001));
      ctx.globalAlpha = s.soundholeAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, SOUNDHOLE.r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      for (const inset of ROSETTE_RINGS) {
        ctx.beginPath();
        ctx.arc(0, 0, SOUNDHOLE.r - inset, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.globalAlpha = s.fretsAlpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      for (const fx of frets) {
        ctx.beginPath();
        ctx.moveTo(fx, STRING_Y[0] - 26);
        ctx.lineTo(fx, STRING_Y[5] + 26);
        ctx.stroke();
      }
      ctx.fillStyle = INK;
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) {
        const p = s.strings[i];
        if (p <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, STRING_Y[i]);
        ctx.lineTo(VB.w * p, STRING_Y[i]);
        ctx.strokeStyle = INK;
        ctx.lineWidth = STRING_WEIGHT[i];
        ctx.stroke();
      }
    };

    const drawInteractive = () => {
      const fill = fillRef.current;
      if (fill.triggered && fill.progress < 1) {
        fill.progress = Math.min(1, (performance.now() - fill.startedAt) / FILL_DURATION);
        if (fill.progress >= 1 && !pageInkedRef.current) {
          // Once the body is fully inked, let the dark spread carry on
          // past the canvas — the rest of the page below settles into
          // the same black the guitar just filled with.
          pageInkedRef.current = true;
          setPageInked(true);
        }
      }
      const progress = fill.progress;
      const outline = mixColor(INK, PAPER, smoothstep(0.08, 0.55, progress));

      // 1. expanding ink fill from the trigger point — an irregular
      // silhouette growing outward, not a perfectly symmetrical circle
      if (fill.triggered && progress > 0) {
        ctx.fillStyle = INK;
        drawBlobPath(ctx, fill.ox, fill.oy, fill.maxRadius * progress, fill.shape);
      }

      // 2. frets + inlay dots
      ctx.lineWidth = 3;
      ctx.strokeStyle = outline;
      for (const fx of frets) {
        ctx.beginPath();
        ctx.moveTo(fx, STRING_Y[0] - 26);
        ctx.lineTo(fx, STRING_Y[5] + 26);
        ctx.stroke();
      }
      ctx.fillStyle = outline;
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. soundhole + rosette rim (always a dark opening)
      ctx.beginPath();
      ctx.arc(SOUNDHOLE.x, SOUNDHOLE.y, SOUNDHOLE.r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      for (const inset of ROSETTE_RINGS) {
        ctx.beginPath();
        ctx.arc(SOUNDHOLE.x, SOUNDHOLE.y, SOUNDHOLE.r - inset, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. strings + hover glow
      for (let i = 0; i < 6; i++) {
        const target = hoveredRef.current === i ? 1 : 0;
        glowRef.current[i] = lerp(glowRef.current[i], target, 0.14);
        const glow = glowRef.current[i];

        ctx.beginPath();
        ctx.moveTo(0, STRING_Y[i]);
        ctx.lineTo(VB.w, STRING_Y[i]);
        ctx.strokeStyle = outline;
        ctx.lineWidth = STRING_WEIGHT[i] * (1 + glow * 0.9);
        if (glow > 0.02) {
          ctx.shadowColor = outline;
          ctx.shadowBlur = 20 * glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(totalScale, 0, 0, totalScale, offsetX * dpr, offsetY * dpr);

      if (!assembledRef.current) {
        drawAssembly();
      } else {
        drawInteractive();
      }
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, []);

  const activeProject = activeIndex >= 0 ? TOP_PROJECTS[activeIndex] : null;

  return (
    <section
      id="top-works"
      ref={sectionRef}
      className="relative w-full pt-32 md:pt-44 overflow-hidden"
    >
      <div
        ref={headingRef}
        className="max-w-[1400px] mx-auto px-6 md:px-10 mb-10 md:mb-14"
      >
        <div className="flex items-end justify-between flex-wrap gap-6">
          <div>
            <p className="reveal-text font-display text-xs tracking-[0.25em] uppercase mb-3">
              01 — Selected work
            </p>
            <h2 className="reveal-text font-display font-black text-[10vw] md:text-[5.2vw] leading-[0.9] tracking-tight">
              My Top Works
            </h2>
          </div>
          <p className="reveal-text max-w-xs text-sm leading-relaxed">
            Six strings, six projects. Move over the body — the ink takes
            over on its own. Hover a string to hear its note.
          </p>
        </div>
      </div>

      <div
        ref={canvasWrapRef}
        className={`relative w-full transition-colors duration-[1200ms] ease-out ${
          pageInked ? "bg-[#0a0a0a]" : ""
        }`}
        style={{ height: "min(78vh, 820px)" }}
        data-cursor-hover
      >
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        <button
          type="button"
          onClick={() => guitarSynth.unlock()}
          data-cursor-hover
          aria-label={audioUnlocked ? "Sound is on" : "Enable sound to hear the strings"}
          className={`absolute left-6 top-6 flex items-center gap-2 rounded-full bg-black text-white px-3.5 py-2 text-[11px] md:text-xs tracking-wide transition-all duration-500 ${
            audioUnlocked
              ? "opacity-0 -translate-y-2 pointer-events-none"
              : "opacity-90 translate-y-0 hover:opacity-100"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 9v6h4l5 5V4L8 9H4z"
              fill="currentColor"
            />
            <path
              d="M16.5 8.5a5 5 0 0 1 0 7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M19 6a9 9 0 0 1 0 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
          Tap for sound
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center md:justify-end md:right-6 md:bottom-6 px-6 md:px-0">
          {activeProject ? (
            <div
              key={activeProject.slug}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-black/10 p-6 bg-white/95 backdrop-blur-md animate-[fadein_0.4s_ease] shadow-xl shadow-black/20"
            >
              <div
                className="w-full aspect-[4/3] rounded-xl mb-5"
                style={{ background: activeProject.color }}
              />
              <p className="text-xs tracking-widest uppercase opacity-50 mb-1">
                {activeProject.category} · {activeProject.year}
              </p>
              <h3 className="font-display font-bold text-2xl mb-2">
                {activeProject.title}
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {activeProject.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-black/15 opacity-70"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="font-display text-sm tracking-widest opacity-40">
                STRING NOTE · {activeProject.note}
              </p>
            </div>
          ) : (
            <div className="max-w-sm rounded-2xl border border-dashed border-black/20 px-5 py-4 opacity-70 bg-white/85 backdrop-blur-sm">
              <p className="font-display text-xs tracking-widest uppercase">
                Hover a string
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        className={`w-full transition-colors duration-[1200ms] ease-out ${
          pageInked ? "bg-[#0a0a0a]" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-12 pb-32 md:pt-16 md:pb-40 flex justify-center">
          <Link
            href="/work"
            className={`pill-btn ${pageInked ? "pill-btn-dark" : ""}`}
            data-cursor-hover
          >
            More works
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
