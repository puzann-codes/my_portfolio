"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import Nav from "@/components/Nav";
import Mascot from "@/components/Mascot";

const INKY_QUIPS = [
  "Hi, I'm Inky. I'm mostly ink.",
  "Careful, I stain.",
  "Try driving the pick further down ↓",
  "Pujan built me in an afternoon. Be nice.",
];
const WORDS = ["PUJAN", "BHATT"];
const HEADING_CLASS =
  "font-hero font-black text-[16vw] md:text-[11vw] tracking-tight";

export default function Hero({ ready }: { ready: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLDivElement | null>(null);
  const hasAnimated = useRef(false);
  const [shimmerOn, setShimmerOn] = useState(false);

  useEffect(() => {
    if (!ready || hasAnimated.current || !rootRef.current) return;
    hasAnimated.current = true;

    const root = rootRef.current;
    const chars = root.querySelectorAll<HTMLElement>(".hero-char");
    const fadeUps = root.querySelectorAll<HTMLElement>("[data-fade-up]");

    const tl = gsap.timeline({
      defaults: { ease: "power4.out" },
      onComplete: () => setShimmerOn(true),
    });
    tl.set(chars, {
      opacity: 0,
      yPercent: 130,
      rotateX: -95,
      transformPerspective: 900,
      filter: "blur(14px)",
    });
    tl.set(fadeUps, { opacity: 0, y: 24 });
    tl.to(
      chars,
      {
        opacity: 1,
        yPercent: 0,
        rotateX: 0,
        filter: "blur(0px)",
        duration: 1.15,
        stagger: 0.028,
      },
      0.1
    );
    tl.to(
      fadeUps,
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        stagger: 0.08,
        // A lingering non-"none" transform (even translate(0,0)) creates a
        // stacking context that isolates mix-blend-mode on these .reveal-text
        // elements, so they'd render flat white forever instead of
        // inverting against the ink canvas. Clearing it once the entrance
        // finishes restores normal blending at rest.
        onComplete: () => gsap.set(fadeUps, { clearProps: "transform" }),
      },
      0.5
    );
  }, [ready]);

  return (
    <section
      ref={rootRef}
      className="relative min-h-[100svh] w-full flex flex-col md:justify-between px-6 md:px-10 pt-28 md:pt-32 pb-10 overflow-hidden"
    >
      <Nav />

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <p
          data-fade-up
          className="reveal-text max-w-[280px] md:max-w-sm text-base md:text-lg leading-snug font-medium text-black dark:text-white"
        >
          AI Engineer &amp; Full-Stack Developer.
          <br />
          Building things that think, ship, and scale.
        </p>
        <a
          href="mailto:rohitpoudel020@gmail.com"
          data-fade-up
          data-cursor-hover
          className="pill-btn"
        >
          Book a call
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div
        ref={nameRef}
        className="hero-name w-full leading-[0.86] select-none text-center mt-16 mb-16 md:my-0"
      >
        {WORDS.map((word) => (
          <div key={word} className="relative">
            <div className={`reveal-text ${HEADING_CLASS}`}>
              {word.split("").map((ch, i) => (
                <span key={i} className="hero-char">
                  {ch}
                </span>
              ))}
            </div>
            <div
              aria-hidden="true"
              className={`hero-shimmer pointer-events-none absolute inset-0 ${HEADING_CLASS} ${
                shimmerOn ? "is-active" : ""
              }`}
            >
              {word}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute right-6 md:right-10 bottom-28 md:bottom-24 z-10">
        <Mascot quips={INKY_QUIPS} size={64} />
      </div>

      <div className="flex items-end justify-between gap-6 flex-wrap mt-auto md:mt-0">
        <p data-fade-up className="reveal-text text-xs md:text-sm tracking-wide">
          Available for select freelance &amp; full-time roles — 2026
        </p>
        <div
          data-fade-up
          className="reveal-text flex items-center gap-5 text-xs md:text-sm tracking-widest uppercase"
        >
          <a href="https://linkedin.com" data-cursor-hover target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <span className="opacity-30">/</span>
          <a href="https://github.com" data-cursor-hover target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
