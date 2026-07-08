"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (isCoarse) return;

    const quickX = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3.out" });
    const quickY = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      quickX(e.clientX);
      quickY(e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onOver = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-cursor-hover]")) {
        gsap.to(dot, { scale: 3.2, duration: 0.35, ease: "power3.out" });
      }
    };
    const onOut = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-cursor-hover]")) {
        gsap.to(dot, { scale: 1, duration: 0.35, ease: "power3.out" });
      }
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return <div ref={dotRef} className="cursor-dot" aria-hidden="true" />;
}
