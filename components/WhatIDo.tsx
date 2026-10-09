"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Placeholder one-liners — swap in your own voice.
const ROWS = [
  {
    word: "AI Systems",
    line: "I teach models to be useful instead of just confident.",
  },
  {
    word: "Full-Stack",
    line: "Pixel to Postgres. I own the whole stack, and the 3am pager.",
  },
  {
    word: "Interfaces",
    line: "Buttons that feel like they're worth clicking.",
  },
  {
    word: "Experiments",
    line: "Most good ideas start with “wait, can the browser do that?”",
  },
];

export default function WhatIDo() {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      // Same rule as the rest of the site: animate the `.reveal-text`
      // elements themselves, never a wrapper, and clear the transform after.
      root.querySelectorAll<HTMLElement>(".what-row").forEach((row) => {
        const targets = row.querySelectorAll<HTMLElement>(".reveal-text");
        gsap.fromTo(
          targets,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power4.out",
            stagger: 0.08,
            scrollTrigger: { trigger: row, start: "top 88%", once: true },
            onComplete: () => gsap.set(targets, { clearProps: "transform" }),
          }
        );
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="what-i-do"
      ref={rootRef}
      className="relative w-full px-6 md:px-10 py-28 md:py-44"
    >
      <div className="max-w-[1400px] mx-auto">
        <p className="reveal-text font-display text-xs tracking-[0.25em] uppercase mb-10 md:mb-16">
          03 — What I do
        </p>
        <ul>
          {ROWS.map((r, i) => (
            <li
              key={r.word}
              className="what-row group border-t border-black/15 py-7 md:py-10 grid md:grid-cols-[1.3fr_1fr] gap-4 md:gap-10 items-end transition-[padding] duration-500 ease-out hover:pl-3 md:hover:pl-6"
              data-cursor-hover
            >
              <h3 className="reveal-text font-display font-black text-[11vw] md:text-[5.6vw] leading-[0.95] tracking-tight">
                <span className="font-sans text-xs md:text-sm font-medium tracking-widest align-top mr-3 md:mr-5 opacity-50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {r.word}
              </h3>
              <p className="reveal-text max-w-sm text-sm md:text-base leading-relaxed md:justify-self-end">
                {r.line}
              </p>
            </li>
          ))}
          <li className="border-t border-black/15" aria-hidden="true" />
        </ul>
      </div>
    </section>
  );
}
