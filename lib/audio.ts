export const STRING_NOTES = [
  { note: "E2", freq: 82.41 },
  { note: "A2", freq: 110.0 },
  { note: "D3", freq: 146.83 },
  { note: "G3", freq: 196.0 },
  { note: "B3", freq: 246.94 },
  { note: "E4", freq: 329.63 },
] as const;

/** Fired once, the first time audio is actually unlocked — UI (like the
 * guitar's sound-toggle button) listens for this instead of polling. */
export const AUDIO_UNLOCKED_EVENT = "guitar-audio-unlocked";

class GuitarSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private primed = false;
  // Explicit user preference — set false if they pick "continue without
  // sound" on the loader, so nothing (guitar notes or ink splashes) ever
  // plays even if the context happens to be technically unlocked.
  private enabled = true;
  private splashBuffer: AudioBuffer | null = null;
  private splashBufferPromise: Promise<AudioBuffer | null> | null = null;
  // Overlapping plays are capped so a fast flurry of pointer movement can't
  // stack dozens of simultaneous copies of the sample into a wall of noise.
  private activeSplashes = 0;
  private static readonly MAX_CONCURRENT_SPLASHES = 3;

  private loadSplashBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.splashBuffer) return Promise.resolve(this.splashBuffer);
    if (this.splashBufferPromise) return this.splashBufferPromise;

    this.splashBufferPromise = fetch("/sounds/water-spill.mp3")
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        this.splashBuffer = decoded;
        return decoded;
      })
      .catch(() => null);

    return this.splashBufferPromise;
  }

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
    const wasLocked = !this.unlocked;
    this.unlocked = true;
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

    // Kick off the water-spill sample fetch/decode as soon as we have a
    // real user gesture, so it's ready well before the first cursor splash.
    this.loadSplashBuffer(ctx);

    if (wasLocked) {
      window.dispatchEvent(new Event(AUDIO_UNLOCKED_EVENT));
    }
  }

  /** Explicit opt-out — "continue without sound" on the loader. */
  disable() {
    this.enabled = false;
  }

  get isUnlocked() {
    return this.unlocked;
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

  /** A real recorded water-spill sample for the ink cursor trail — quiet
   * and textural, not a focal sound. Each play gets a small random
   * pitch/gain nudge so repeated triggers don't sound identical. Never
   * attempts to resume a suspended context itself (unlike pluck/unlock):
   * this fires very frequently during ordinary mouse movement, which isn't
   * a user gesture, so it should just stay silent until audio has been
   * unlocked some other way. */
  splash(variance = 0) {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.ctx.state !== "running") return;
    if (this.activeSplashes >= GuitarSynth.MAX_CONCURRENT_SPLASHES) return;

    const ctx = this.ctx;
    const buffer = this.splashBuffer;
    if (!buffer) {
      // Not decoded yet (e.g. splash() fired before unlock() finished
      // fetching it) — kick off loading for next time, stay silent now.
      this.loadSplashBuffer(ctx);
      return;
    }

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.92 + Math.random() * 0.16 + variance * 0.0002;

    const gain = ctx.createGain();
    gain.gain.value = 0.5 + Math.random() * 0.15;

    source.connect(gain).connect(this.master);
    this.activeSplashes++;
    source.onended = () => {
      this.activeSplashes = Math.max(0, this.activeSplashes - 1);
    };
    source.start(now);
  }
}

export const guitarSynth = new GuitarSynth();
