"use client";

import { useEffect, useState } from "react";
import { AUDIO_STATE_EVENT, guitarSynth } from "@/lib/audio";

/** Sound is off until the visitor turns it on here (or in the loader). */
export default function SoundToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    // the synth lives outside React; read it once on mount, then follow events
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(guitarSynth.isEnabled);
    const sync = () => setOn(guitarSynth.isEnabled);
    window.addEventListener(AUDIO_STATE_EVENT, sync);
    return () => window.removeEventListener(AUDIO_STATE_EVENT, sync);
  }, []);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn sound off" : "Turn sound on"}
      data-cursor-hover
      onClick={() => (on ? guitarSynth.disable() : guitarSynth.unlock())}
      className="flex items-center gap-2 text-xs md:text-sm font-medium tracking-wide"
    >
      <span aria-hidden="true" className="flex items-end gap-[2px] h-3">
        {[0.5, 1, 0.7].map((h, i) => (
          <span
            key={i}
            className="w-[2px] bg-current origin-bottom"
            style={{ height: `${h * 100}%`, opacity: on ? 1 : 0.4, transform: on ? "none" : "scaleY(0.35)", transition: "all .3s" }}
          />
        ))}
      </span>
      <span className="hidden sm:inline">SOUND {on ? "ON" : "OFF"}</span>
    </button>
  );
}
