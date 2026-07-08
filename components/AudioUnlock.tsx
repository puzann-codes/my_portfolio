"use client";

import { useEffect } from "react";
import { guitarSynth } from "@/lib/audio";

/** Browsers only allow audio after a real user gesture (click/tap/key),
 * not a hover. Listen as broadly as possible so the very first gesture
 * anywhere on the site — a nav click, a scroll-then-click, anything —
 * unlocks the guitar synth before the visitor ever reaches the strings. */
export default function AudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      guitarSynth.unlock();
    };
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "click",
      "touchstart",
      "touchend",
      "keydown",
      "wheel",
    ];
    // Capture phase so nothing upstream (stopPropagation, etc.) can stop
    // this from firing before the guitar section is ever reached.
    events.forEach((e) =>
      window.addEventListener(e, unlock, { passive: true, capture: true })
    );
    return () => {
      events.forEach((e) =>
        window.removeEventListener(e, unlock, { capture: true })
      );
    };
  }, []);

  return null;
}
