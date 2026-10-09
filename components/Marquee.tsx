"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type Lenis from "lenis";
import { useLenis } from "@/lib/lenis-context";

const PHRASES = [
  "AI Engineer",
  "Full-Stack Developer",
  "Model Wrangler",
  "Interface Tinkerer",
  "Ships Things",
];

/** Giant type strip that drifts on its own, then lurches with the page's
 * scroll velocity (and flips direction when you scroll back up). */
export default function Marquee() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lenis = useLenis();

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let x = 0;
    let dir = -1;
    let boost = 0;

    const onScroll = (l: Lenis) => {
      boost = Math.abs(l.velocity);
      if (l.velocity !== 0) dir = l.velocity > 0 ? -1 : 1;
    };
    lenis?.on("scroll", onScroll);

    const tick = () => {
      const half = track.scrollWidth / 2;
      boost *= 0.92;
      x += dir * (0.7 + Math.min(boost, 40) * 0.4);
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      track.style.transform = `translate3d(${x}px,0,0)`;
    };
    gsap.ticker.add(tick);

    return () => {
      lenis?.off("scroll", onScroll);
      gsap.ticker.remove(tick);
    };
  }, [lenis]);

  const group = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"}>
      {[...PHRASES, ...PHRASES].map((p, i) => (
        <div key={`${key}-${i}`} className="flex items-center">
          <span
            className={`font-hero font-black uppercase whitespace-nowrap text-[9vw] md:text-[6vw] leading-none px-[3vw] ${
              i % 2 === 0 ? "marquee-outline" : "text-[#0a0a0a]"
            }`}
          >
            {p}
          </span>
          <span className="text-[5vw] md:text-[3vw] leading-none">✺</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden border-y border-black/15 py-5 md:py-8 bg-white">
      <div ref={trackRef} className="flex w-max will-change-transform">
        {group("a")}
        {group("b")}
      </div>
    </div>
  );
}
