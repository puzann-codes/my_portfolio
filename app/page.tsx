"use client";

import { useCallback, useEffect, useState } from "react";
import Loader from "@/components/Loader";
import Hero from "@/components/Hero";
import GuitarShowcase from "@/components/GuitarShowcase";

const SESSION_KEY = "pb-portfolio-loaded";

export default function Home() {
  const [showLoader, setShowLoader] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // sessionStorage is only readable client-side, so the initial
    // showLoader/ready state can't be computed during render/SSR.
    const hasLoaded = sessionStorage.getItem(SESSION_KEY);
    if (hasLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLoader(false);
      setReady(true);
    } else {
      setShowLoader(true);
    }
  }, []);

  const handleDone = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setReady(true);
  }, []);

  return (
    <main>
      {showLoader && <Loader onDone={handleDone} />}
      <Hero ready={ready || showLoader === false} />
      <GuitarShowcase />
    </main>
  );
}
