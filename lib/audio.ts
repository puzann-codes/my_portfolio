export const STRING_NOTES = [
  { note: "E2", freq: 82.41 },
  { note: "A2", freq: 110.0 },
  { note: "D3", freq: 146.83 },
  { note: "G3", freq: 196.0 },
  { note: "B3", freq: 246.94 },
  { note: "E4", freq: 329.63 },
] as const;

/** Fired whenever sound is switched on or off, so toggles can stay in sync
 * without polling. */
export const AUDIO_STATE_EVENT = "portfolio-audio-state";

class GuitarSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private primed = false;
  // Sound is OFF until the visitor explicitly turns it on (loader choice,
  // the sound toggle, or the guitar's "tap for sound"). Nothing plays and
  // no AudioContext is created before that.
  private enabled = false;

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

  private emit() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(AUDIO_STATE_EVENT));
  }

  /** Explicit opt-in. Must be called from a user gesture. Beyond resuming,
   * this fires one inaudibly quiet tone through the full graph on the first
   * call — Safari only fully wakes its output pipeline once a sound has
   * actually been scheduled during the gesture. */
  unlock() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") ctx.resume();
    const changed = !this.enabled;
    this.enabled = true;

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
    if (changed) this.emit();
  }

  /** Switch sound off (loader's "without sound", or the toggle). */
  disable() {
    const changed = this.enabled;
    this.enabled = false;
    if (changed) this.emit();
  }

  get isEnabled() {
    return this.enabled;
  }

  pluck(freq: number) {
    if (!this.enabled) return;
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

  /** Short noise burst through a band-pass: the lamp's switch, and (much
   * quieter) a keycap. Silent until audio has been unlocked. */
  private clickBurst(gainValue: number, freq: number, length: number) {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * length)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = gainValue;
    src.connect(filter).connect(g).connect(this.master);
    src.start(now);
  }

  click() {
    this.clickBurst(0.9, 1800, 0.05);
    // a low thunk under it
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  tick() {
    this.clickBurst(0.16 + Math.random() * 0.06, 2600 + Math.random() * 900, 0.018);
  }
}

export const guitarSynth = new GuitarSynth();
