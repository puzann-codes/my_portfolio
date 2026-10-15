"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useLenis } from "@/lib/lenis-context";
import { guitarSynth } from "@/lib/audio";

// Boot log. Each line appears when the (real) load progress passes its mark.
const LOG = [
  "lighting the lamp",
  "setting the keys",
  "hanging the prints",
  "watering the plants",
  "brewing the coffee",
  "sketching the ideas",
  "routing the complaints",
  "sealing the capsule",
  "following the spring",
  "threading the film",
  "rolling",
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
      className="fixed inset-0 z-[100] bg-[#0a0a0b] text-[#efe8d6] overflow-hidden"
    >
      <div className="absolute top-6 md:top-8 left-6 md:left-10 right-6 md:right-10 flex items-center justify-between text-[0.7rem] md:text-xs tracking-[0.34em] uppercase text-[#efe8d6]/60">
        <span>Pujan Bhatt</span>
        <span>A portfolio in six acts</span>
      </div>

      <ul className="absolute left-6 md:left-10 top-24 md:top-28 text-[0.95rem] md:text-base italic leading-[1.9] text-[#efe8d6]/75">
        {LOG.map((line, i) => (
          <li
            key={line}
            ref={(el) => {
              logRefs.current[i] = el;
            }}
            className="boot-line"
          >
            {line}
          </li>
        ))}
      </ul>

      <div className="absolute left-6 md:left-10 bottom-8 md:bottom-12 flex items-end gap-2 leading-none">
        <span ref={numRef} className="text-[28vw] md:text-[14vw] tabular-nums tracking-[0.04em]">
          00
        </span>
        <span className="text-[7vw] md:text-[3vw] pb-[3vw] md:pb-[1.4vw] text-[#efe8d6]/55">%</span>
      </div>

      <div
        ref={choiceRef}
        className={`absolute right-6 md:right-10 bottom-10 md:bottom-14 flex flex-col items-end gap-5 ${
          ready ? "" : "pointer-events-none"
        }`}
      >
        <p className="text-sm md:text-base italic text-[#efe8d6]/70">
          The house lights are down. <span className="boot-caret">&#9612;</span>
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            data-cursor-hover
            onClick={withSound}
            className="border border-[#efe8d6] bg-[#efe8d6] px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#0a0a0b] transition-colors duration-300 hover:bg-transparent hover:text-[#efe8d6]"
          >
            Enter with sound
          </button>
          <button
            type="button"
            data-cursor-hover
            onClick={withoutSound}
            className="border border-[#efe8d6]/40 px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#efe8d6]/85 transition-colors duration-300 hover:border-[#efe8d6] hover:text-[#efe8d6]"
          >
            Enter without
          </button>
        </div>
      </div>

      <div
        ref={barRef}
        className="absolute bottom-0 left-0 h-px w-full bg-[#efe8d6] origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
