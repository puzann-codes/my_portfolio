export const STRING_NOTES = [
  { note: "E2", freq: 82.41 },
  { note: "A2", freq: 110.0 },
  { note: "D3", freq: 146.83 },
  { note: "G3", freq: 196.0 },
  { note: "B3", freq: 246.94 },
  { note: "E4", freq: 329.63 },
] as const;

class GuitarSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private primed = false;

  private ensureContext() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Call on any early user interaction to satisfy autoplay policies.
   * Beyond just resuming, this also fires one real (inaudibly quiet, 30ms)
   * tone through the full graph on the very first call — some browsers
   * (notably Safari/WebKit) only fully wake the output pipeline once a
   * sound has actually been scheduled during the gesture, not merely on
   * `resume()`, so later notes can stay silent without this. */
  unlock() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") ctx.resume();
    this.unlocked = true;

    if (!this.primed) {
      this.primed = true;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.03);
    }
  }

  get isUnlocked() {
    return this.unlocked;
  }

  pluck(freq: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const duration = 1.7;

    // body / tone
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.997, now + duration);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2.003, now);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.9, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.0001, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
    osc2Gain.gain.exponentialRampToValueAtTime(0.0005, now + duration * 0.5);

    // pluck transient (filtered noise burst)
    const noiseBuffer = ctx.createBuffer(
      1,
      ctx.sampleRate * 0.05,
      ctx.sampleRate
    );
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = freq * 4;
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.setValueAtTime(Math.min(freq * 10, 9000), now);
    toneFilter.frequency.exponentialRampToValueAtTime(
      Math.max(freq * 1.5, 300),
      now + duration * 0.8
    );
    toneFilter.Q.value = 0.5;

    osc.connect(oscGain).connect(toneFilter);
    osc2.connect(osc2Gain).connect(toneFilter);
    noise.connect(noiseFilter).connect(noiseGain).connect(toneFilter);
    toneFilter.connect(this.master);

    osc.start(now);
    osc2.start(now);
    noise.start(now);
    osc.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
    noise.stop(now + 0.1);
  }
}

export const guitarSynth = new GuitarSynth();
