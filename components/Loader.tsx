"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useLenis } from "@/lib/lenis-context";
import { guitarSynth } from "@/lib/audio";

// Boot log. Each line appears when the (real) load progress passes its mark.
const LOG = [
  "mount /fonts",
  "light the lamp",
  "tune 84 keycaps",
  "hang the prints, water the plants",
  "brew the coffee",
  "sketch the ideas",
  "route the complaints",
  "seal the capsule",
  "follow the spring",
  "compile shaders",
  "all systems nominal",
];

const MIN_MS = 2800; // long enough to read, even when everything is cached

export default function Loader({
  progress,
  onDone,
}: {
  /** real load progress, 0 → 1 */
  progress: number;
  onDone: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const logRefs = useRef<(HTMLLIElement | null)[]>([]);
  const choiceRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(progress);
  const lenis = useLenis();
  const [ready, setReady] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!lenis) return;
    lenis.stop();
    document.body.style.overflow = "hidden";
    gsap.set(choiceRef.current, { opacity: 0, y: 14 });

    const t0 = performance.now();
    let shown = 0;
    let raf = 0;
    let finished = false;
    const lit = new Set<number>();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const timeCap = Math.min((performance.now() - t0) / MIN_MS, 1);
      const target = Math.min(progressRef.current, timeCap);
      shown += (target - shown) * 0.09;
      if (target - shown < 0.002) shown = target;

      if (numRef.current) numRef.current.textContent = String(Math.round(shown * 100)).padStart(2, "0");
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown})`;
      LOG.forEach((_, i) => {
        if (!lit.has(i) && shown >= (i + 1) / LOG.length - 0.001) {
          lit.add(i);
          logRefs.current[i]?.classList.add("is-on");
        }
      });
      if (!finished && shown >= 0.999) {
        finished = true;
        setReady(true);
        gsap.to(choiceRef.current, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lenis]);

  const dismiss = () => {
    if (choiceMade || !ready || !lenis) return;
    setChoiceMade(true);
    const root = rootRef.current;
    // the page underneath (lamp flicker, camera) starts as the curtain lifts
    lenis.start();
    document.body.style.overflow = "";
    onDone();
    gsap.to(choiceRef.current, { opacity: 0, y: -10, duration: 0.4, ease: "power2.in" });
    gsap.to(root, {
      opacity: 0,
      duration: 1.1,
      delay: 0.25,
      ease: "power2.inOut",
      onComplete: () => {
        if (root) root.style.display = "none";
      },
    });
  };

  const withSound = () => {
    guitarSynth.unlock();
    dismiss();
  };
  const withoutSound = () => {
    guitarSynth.disable();
    dismiss();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] bg-[#050505] text-white font-mono overflow-hidden"
    >
      <div className="absolute top-6 md:top-8 left-6 md:left-10 right-6 md:right-10 flex items-center justify-between text-[11px] md:text-xs tracking-widest uppercase text-white/55">
        <span>PB — portfolio.os</span>
        <span>build 2026.10</span>
      </div>

      <ul className="absolute left-6 md:left-10 top-24 md:top-28 text-[11px] md:text-[13px] leading-[1.9] text-white/70">
        {LOG.map((line, i) => (
          <li
            key={line}
            ref={(el) => {
              logRefs.current[i] = el;
            }}
            className="boot-line"
          >
            <span className="text-white/40">[</span>
            <span className="text-white"> ok </span>
            <span className="text-white/40">]</span> {line}
          </li>
        ))}
      </ul>

      <div className="absolute left-6 md:left-10 bottom-8 md:bottom-12 flex items-end gap-2 leading-none">
        <span
          ref={numRef}
          className="font-hero font-black text-[30vw] md:text-[15vw] tabular-nums tracking-tight"
        >
          00
        </span>
        <span className="font-hero font-black text-[8vw] md:text-[3.4vw] pb-[3vw] md:pb-[1.4vw] text-white/60">
          %
        </span>
      </div>

      <div
        ref={choiceRef}
        className={`absolute right-6 md:right-10 bottom-10 md:bottom-14 flex flex-col items-end gap-4 ${
          ready ? "" : "pointer-events-none"
        }`}
      >
        <p className="text-[12px] md:text-sm text-white/70">
          pujan@desk:~$ ./enter <span className="boot-caret">▌</span>
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 font-sans">
          <button
            type="button"
            data-cursor-hover
            onClick={withSound}
            className="rounded-full bg-white text-black px-6 py-3 text-sm font-semibold tracking-wide transition-transform duration-300 hover:scale-105"
          >
            Enter with sound
          </button>
          <button
            type="button"
            data-cursor-hover
            onClick={withoutSound}
            className="rounded-full border border-white/30 px-6 py-3 text-sm tracking-wide text-white/80 transition-colors duration-300 hover:border-white hover:text-white"
          >
            Enter without
          </button>
        </div>
      </div>

      <div
        ref={barRef}
        className="absolute bottom-0 left-0 h-[3px] w-full bg-white origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
