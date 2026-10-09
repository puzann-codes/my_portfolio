"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { guitarSynth } from "@/lib/audio";

type MascotProps = {
  quips: string[];
  size?: number;
  /** "dark" = black blob, white eyes (for light backgrounds);
   * "light" = white blob, black eyes (for dark backgrounds). */
  tone?: "dark" | "light";
  className?: string;
};

/** Inky — a small ink blob whose eyes follow the cursor. Poke it for a
 * quip. Nothing in here is `ink-text`, so animating its transform is safe. */
export default function Mascot({
  quips,
  size = 72,
  tone = "dark",
  className = "",
}: MascotProps) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const pupilsRef = useRef<HTMLSpanElement[]>([]);
  const quipIndex = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quip, setQuip] = useState<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const maxOffset = size * 0.07;
    const onMove = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(dist / 140, 1) * maxOffset;
      const x = (dx / dist) * k;
      const y = (dy / dist) * k;
      pupilsRef.current.forEach((p) => {
        if (p) p.style.transform = `translate(${x}px, ${y}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [size]);

  const poke = () => {
    guitarSynth.tick();
    if (rootRef.current) {
      gsap.fromTo(
        rootRef.current,
        { scaleX: 1.3, scaleY: 0.7 },
        { scaleX: 1, scaleY: 1, duration: 0.9, ease: "elastic.out(1, 0.35)" }
      );
    }
    setQuip(quips[quipIndex.current % quips.length]);
    quipIndex.current += 1;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setQuip(null), 2600);
  };

  const body = tone === "dark" ? "#0a0a0a" : "#ffffff";
  const eye = tone === "dark" ? "#ffffff" : "#0a0a0a";
  const pupil = tone === "dark" ? "#0a0a0a" : "#ffffff";

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={poke}
      data-cursor-hover
      aria-label="Poke Inky, the ink blob"
      className={`relative block ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        aria-live="polite"
        className={`pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-full px-3.5 py-2 text-[11px] md:text-xs font-medium tracking-wide transition-all duration-300 ${
          tone === "dark" ? "bg-[#0a0a0a] text-white" : "bg-white text-[#0a0a0a]"
        } ${quip ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
      >
        {quip ?? ""}
      </span>

      <span
        className="inky-body absolute inset-0"
        style={{ background: body }}
      >
        {[0, 1].map((i) => (
          <span
            key={i}
            className="inky-eye absolute"
            style={{
              background: eye,
              width: "27%",
              height: "31%",
              top: "30%",
              left: i === 0 ? "20%" : "53%",
            }}
          >
            <span
              ref={(el) => {
                if (el) pupilsRef.current[i] = el;
              }}
              className="absolute rounded-full"
              style={{
                background: pupil,
                width: "52%",
                height: "52%",
                top: "24%",
                left: "24%",
                transition: "transform 0.12s ease-out",
              }}
            />
          </span>
        ))}
      </span>
    </button>
  );
}
