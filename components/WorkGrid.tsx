"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ALL_PROJECTS } from "@/data/projects";

gsap.registerPlugin(ScrollTrigger);

export default function WorkGrid() {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll<HTMLElement>(".work-card");
    const ctx = gsap.context(() => {
      cards.forEach((card, i) => {
        // Animate the card's individual pieces directly instead of the
        // `<a>` wrapper: a transform on an ANCESTOR of the ink-text title
        // would create a stacking context that isolates it from blending
        // against the ink canvas (it'd render flat white-on-white instead
        // of inverting), so nothing that wraps the title may be animated.
        const targets = card.querySelectorAll<HTMLElement>(
          ".work-thumb, h3, p, .work-arrow, .work-tag"
        );
        gsap.fromTo(
          targets,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power4.out",
            stagger: 0.02,
            delay: (i % 2) * 0.08,
            scrollTrigger: {
              trigger: card,
              start: "top 90%",
              once: true,
            },
          }
        );
      });
    }, gridRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={gridRef} className="grid md:grid-cols-2 gap-x-8 gap-y-14 md:gap-y-20">
      {ALL_PROJECTS.map((p, i) => (
        <a
          key={p.slug}
          href="#"
          data-cursor-hover
          className="work-card group block"
        >
          <div
            className="work-thumb w-full aspect-[4/3] rounded-2xl overflow-hidden mb-5 relative transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[0.98]"
            style={{ background: p.color }}
          >
            <div className="absolute inset-0 flex items-center justify-center font-display font-black text-white/10 text-[6rem] select-none">
              {String(i + 1).padStart(2, "0")}
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="ink-text font-display font-bold text-xl md:text-2xl leading-tight mb-1 group-hover:opacity-60 transition-opacity">
                {p.title}
              </h3>
              <p className="text-sm opacity-55">
                {p.category} · {p.year}
              </p>
            </div>
            <span className="work-arrow font-display text-lg opacity-40 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all">
              ↗
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {p.tags.map((t) => (
              <span
                key={t}
                className="work-tag text-[11px] px-2.5 py-1 rounded-full border border-black/15 opacity-70"
              >
                {t}
              </span>
            ))}
          </div>
        </a>
      ))}
    </div>
  );
}
