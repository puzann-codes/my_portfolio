"use client";

import { useEffect, useState } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LenisContext } from "@/lib/lenis-context";
import { prefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    const prefersReduced = prefersReducedMotion();

    const instance = new Lenis({
      duration: prefersReduced ? 0.1 : 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      touchMultiplier: 1.2,
      wheelMultiplier: 1,
    });

    // Lenis must be instantiated client-side; storing it in state is what
    // lets consumers (Loader, etc.) receive it once it exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLenis(instance);

    instance.on("scroll", ScrollTrigger.update);

    gsap.ticker.add((time) => {
      instance.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);

    return () => {
      instance.destroy();
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
