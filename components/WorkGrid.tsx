"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { ALL_PROJECTS, type EnvironmentKey } from "@/data/projects";

gsap.registerPlugin(ScrollTrigger);

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** each project's frame is painted with the sky of its own environment in the 3D world */
const SKY: Record<EnvironmentKey, { top: string; horizon: string; glow: string }> = {
  city: { top: "#15143a", horizon: "#f2956a", glow: "#ffd2a0" },
  crash: { top: "#050c18", horizon: "#2a6a86", glow: "#8fd0e8" },
  harvo: { top: "#1d2547", horizon: "#f7c070", glow: "#ffe3a6" },
  learnscape: { top: "#04101a", horizon: "#1b6a78", glow: "#7fe0d0" },
  mul: { top: "#1a2f45", horizon: "#9fc2bf", glow: "#e6f3ee" },
};

export default function WorkGrid() {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll<HTMLElement>(".work-card");
    const ctx = gsap.context(() => {
      cards.forEach((card) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 48 },
          {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 88%", once: true },
          }
        );
      });
    }, gridRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={gridRef} className="flex flex-col gap-14 md:gap-24">
      {ALL_PROJECTS.map((p, i) => {
        const sky = SKY[p.environment ?? "city"];
        return (
          <Link key={p.slug} href={`/work/${p.slug}`} data-cursor-hover className="work-card group block">
            {/* a 2.39:1 frame in the project's own sky */}
            <div className="relative w-full aspect-[16/9] md:aspect-[2.39/1] overflow-hidden border border-[#efe8d6]/15">
              <div
                className="absolute inset-0 transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
                style={{
                  background: `radial-gradient(ellipse 60% 70% at 50% 100%, ${sky.glow}55, transparent 70%), linear-gradient(to bottom, ${sky.top} 0%, ${sky.top} 35%, ${sky.horizon} 100%)`,
                }}
              />
              {/* the letterbox, closing in on hover */}
              <div className="absolute inset-x-0 top-0 h-0 bg-[#0a0a0b] transition-all duration-700 ease-out group-hover:h-[7%]" />
              <div className="absolute inset-x-0 bottom-0 h-0 bg-[#0a0a0b] transition-all duration-700 ease-out group-hover:h-[7%]" />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "radial-gradient(ellipse at 50% 55%, transparent 40%, rgba(0,0,0,0.55) 100%)" }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="mb-3 text-[0.7rem] md:text-xs uppercase tracking-[0.36em] text-[#efe8d6]/75">
                  Act IV &middot; {ROMAN[i] ?? i + 1}
                </span>
                <h2
                  className="uppercase tracking-[0.14em] text-[#f6efdc] leading-[1.05]"
                  style={{ fontSize: "clamp(1.8rem, 6.4vw, 5.6rem)", textShadow: "0 2px 36px rgba(0,0,0,0.55)" }}
                >
                  {p.title}
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="text-lg md:text-xl italic leading-snug text-[#efe8d6]/85 max-w-2xl">{p.summary}</p>
                <p className="mt-3 text-[0.72rem] md:text-xs uppercase tracking-[0.28em] text-[#efe8d6]/55">
                  {[p.category, p.year].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="inline-flex items-center gap-3 border-b border-[#efe8d6]/40 pb-1 text-xs uppercase tracking-[0.3em] text-[#f6efdc] transition-colors group-hover:border-[#f6efdc]">
                Open the case study
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                  &rarr;
                </span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
