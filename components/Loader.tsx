"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useLenis } from "@/lib/lenis-context";
import { guitarSynth } from "@/lib/audio";

const RING_R = 146;
const RING_LEN = 2 * Math.PI * RING_R;
const STATUS = [
  "Warming up the ink",
  "Tuning six strings",
  "Polishing the pixels",
  "Almost there, promise",
];

export default function Loader({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const blobRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const pctRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const choiceRef = useRef<HTMLDivElement | null>(null);
  const lenis = useLenis();
  const [ready, setReady] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);

  useEffect(() => {
    if (!lenis) return;
    lenis.stop();
    document.body.style.overflow = "hidden";

    gsap.set(blobRef.current, { opacity: 0, scale: 0.85 });
    gsap.set(textRef.current, { opacity: 0, y: 12 });
    gsap.set(choiceRef.current, { opacity: 0, y: 16 });
    if (textRef.current) textRef.current.textContent = STATUS[0];

    const counter = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.to(blobRef.current, { opacity: 1, scale: 1, duration: 1.1 });
    tl.to(textRef.current, { opacity: 1, y: 0, duration: 0.7 }, "-=0.6");
    // Minh-style percentage ring: the arc draws itself while the status
    // line cycles, and the buttons only appear once it hits 100.
    tl.to(
      counter,
      {
        v: 100,
        duration: 2.6,
        ease: "power2.inOut",
        onUpdate: () => {
          const v = Math.round(counter.v);
          if (pctRef.current) pctRef.current.textContent = `${v}%`;
          if (ringRef.current) {
            ringRef.current.style.strokeDashoffset = String(
              RING_LEN * (1 - counter.v / 100)
            );
          }
          if (textRef.current && v < 100) {
            textRef.current.textContent =
              STATUS[Math.min(STATUS.length - 1, Math.floor(v / 25))];
          }
        },
        onComplete: () => {
          if (textRef.current) textRef.current.textContent = "Welcome to the portfolio";
          setReady(true);
        },
      },
      "-=0.5"
    );
    tl.to(choiceRef.current, { opacity: 1, y: 0, duration: 0.7 }, "-=0.2");

    return () => {
      tl.kill();
    };
  }, [lenis]);

  const dismiss = () => {
    if (choiceMade || !ready || !lenis) return;
    setChoiceMade(true);

    const panelEl = panelRef.current;
    const rootEl = rootRef.current;

    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    tl.to(choiceRef.current, { opacity: 0, y: -12, duration: 0.35, ease: "power2.in" });
    tl.to(textRef.current, { opacity: 0, y: -8, duration: 0.3 }, "<");
    tl.to(blobRef.current, { opacity: 0, scale: 0.85, duration: 0.5, ease: "power2.in" }, "<");
    tl.addLabel("wipe", "-=0.15");
    // The wipe and the handoff to the page underneath fire at the exact
    // same moment — as the curtain starts sliding away, the hero below
    // is already animating in, instead of a beat of dead air first.
    tl.to(panelEl, { yPercent: -100, duration: 1.1, ease: "expo.inOut" }, "wipe");
    tl.call(
      () => {
        lenis.start();
        document.body.style.overflow = "";
        onDone();
      },
      undefined,
      "wipe"
    );
    tl.set(rootEl, { display: "none" });
  };

  const continueWithSound = () => {
    guitarSynth.unlock();
    dismiss();
  };

  const continueWithoutSound = () => {
    guitarSynth.disable();
    dismiss();
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100]">
      <div
        ref={panelRef}
        className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-[#0a0a0a] text-white px-6"
      >
        <div ref={blobRef} className="relative flex items-center justify-center w-[300px] h-[300px]">
          <svg
            viewBox="0 0 300 300"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full -rotate-90"
          >
            <circle
              cx="150"
              cy="150"
              r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <circle
              ref={ringRef}
              cx="150"
              cy="150"
              r={RING_R}
              fill="none"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN}
            />
          </svg>
          <span
            ref={pctRef}
            className="absolute right-1 top-3 font-display text-xs tabular-nums tracking-widest text-white/80"
          >
            0%
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- an
              animated SVG (SMIL) loses its animation through next/image's
              optimizer; a plain img keeps it running. Background is
              transparent, so it takes on the panel's #0a0a0a behind it. */}
          <img
            src="/loader-blob.svg"
            alt=""
            aria-hidden="true"
            className="w-[220px] h-[220px]"
          />
        </div>

        <p
          ref={textRef}
          className="font-display text-xs tracking-[0.3em] uppercase text-white/70 min-h-[1em]"
        />

        <div
          ref={choiceRef}
          className={`flex flex-wrap items-center justify-center gap-3 ${
            ready ? "" : "pointer-events-none"
          }`}
        >
          <button
            type="button"
            data-cursor-hover
            onClick={continueWithSound}
            className="rounded-full bg-white text-black px-6 py-3 text-sm font-semibold tracking-wide transition-transform duration-300 hover:scale-105"
          >
            Continue with sound
          </button>
          <button
            type="button"
            data-cursor-hover
            onClick={continueWithoutSound}
            className="rounded-full border border-white/30 px-6 py-3 text-sm tracking-wide text-white/80 transition-colors duration-300 hover:border-white hover:text-white"
          >
            Continue without
          </button>
        </div>
      </div>
    </div>
  );
}
