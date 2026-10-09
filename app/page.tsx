"use client";

import { useCallback, useEffect, useState } from "react";
import Loader from "@/components/Loader";
import Hero from "@/components/Hero";
import DeskJourney from "@/components/DeskJourney";
import GuitarShowcase from "@/components/GuitarShowcase";
import Marquee from "@/components/Marquee";
import Playground from "@/components/Playground";
import WhatIDo from "@/components/WhatIDo";
import Footer from "@/components/Footer";

const SESSION_KEY = "pb-portfolio-loaded";

export default function Home() {
  const [showLoader, setShowLoader] = useState<boolean | null>(null);
  // the loader has been dismissed (or was skipped): the lamp can come on
  const [entered, setEntered] = useState(false);
  const [progress, setProgress] = useState(0);
  // no WebGL (or the scene failed to start): fall back to the flat hero
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    // sessionStorage is only readable client-side, so the initial
    // showLoader/entered state can't be computed during render/SSR.
    const hasLoaded = sessionStorage.getItem(SESSION_KEY);
    if (hasLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLoader(false);
      setEntered(true);
    } else {
      setShowLoader(true);
    }
  }, []);

  const handleLoad = useCallback((v: number) => setProgress((p) => Math.max(p, v)), []);
  const handleUnsupported = useCallback(() => {
    setFallback(true);
    setProgress(1);
  }, []);
  const handleDone = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setEntered(true);
  }, []);

  return (
    <main>
      {showLoader && <Loader progress={progress} onDone={handleDone} />}
      {fallback ? (
        <Hero ready={entered} />
      ) : (
        <DeskJourney go={entered} onLoad={handleLoad} onUnsupported={handleUnsupported} />
      )}
      <Marquee />
      <GuitarShowcase />
      <Playground />
      <WhatIDo />
      <Footer />
    </main>
  );
}
