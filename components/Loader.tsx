"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useLenis } from "@/lib/lenis-context";

const WORDS = ["PUJAN", "BHATT"];

export default function Loader({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const counterRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    lenis.stop();
    document.body.style.overflow = "hidden";

    const counterEl = counterRef.current;
    const panelEl = panelRef.current;
    const rootEl = rootRef.current;
    const wordEls = wordsRef.current
      ? Array.from(wordsRef.current.querySelectorAll<HTMLElement>(".loader-word"))
      : [];

    const counter = { value: 0 };
    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => {
        lenis.start();
        document.body.style.overflow = "";
        onDone();
      },
    });

    tl.set(wordEls, { yPercent: 110 });
    tl.to(wordEls, {
      yPercent: 0,
      duration: 0.9,
      stagger: 0.08,
      ease: "power4.out",
    });
    tl.to(
      counter,
      {
        value: 100,
        duration: 1.6,
        ease: "power1.inOut",
        onUpdate: () => {
          if (counterEl) counterEl.textContent = String(Math.round(counter.value));
        },
      },
      "<"
    );
    tl.to(wordEls, {
      yPercent: -110,
      duration: 0.7,
      stagger: 0.06,
      ease: "power3.in",
    });
    tl.to(
      counterEl,
      { autoAlpha: 0, duration: 0.4, ease: "power2.in" },
      "<"
    );
    tl.to(
      panelEl,
      {
        yPercent: -100,
        duration: 1.1,
        ease: "expo.inOut",
      },
      "-=0.2"
    );
    tl.set(rootEl, { display: "none" });

    return () => {
      tl.kill();
    };
  }, [lenis, onDone]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100]">
      <div
        ref={panelRef}
        className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] text-white"
      >
        <div ref={wordsRef} className="flex flex-col items-center overflow-hidden leading-[0.9]">
          {WORDS.map((w) => (
            <div key={w} className="overflow-hidden">
              <div className="loader-word font-display font-black text-[12vw] tracking-tight">
                {w}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute bottom-10 right-10 font-display text-sm tracking-widest">
          <span ref={counterRef}>0</span>
          <span>%</span>
        </div>
        <div className="absolute bottom-10 left-10 font-display text-sm tracking-widest opacity-70">
          LOADING PORTFOLIO
        </div>
      </div>
    </div>
  );
}
