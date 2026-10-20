import { guitarSynth } from "@/lib/audio";

/**
 * The room's sounds, all synthesised (no samples, nothing to download, nothing
 * to license), and all silent until the visitor has opted in to sound.
 *
 *  keys        a creamy, lubed-linear "thock": a soft low body with a quick
 *              pitch drop, a damped mid knock, no spring ping, the top end
 *              rolled off, and a short case cavity. Wide keys get a deeper
 *              body and a muffled stabiliser; the upstroke is a quiet pock.
 *  transition  the cut between acts, in the manner of an old reel: a projector
 *              gate fluttering at 24 frames a second, a warm string pad that
 *              swells through a chord, a single felt-piano note as the title
 *              resolves, a breath of paper, and a little film crackle. The
 *              chord moves with the act, so it reads as one score, not one
 *              sound repeated.
 */

type Out = { ctx: AudioContext; out: GainNode };

const WIDE = /^(Enter|Backspace|ShiftLeft|ShiftRight|Tab|CapsLock)$/;

// D major → B minor → G major → A (sus-ish): a slow, warm turn, in octaves that sit under a voice
const CHORDS: number[][] = [
  [146.83, 220.0, 293.66, 369.99],
  [123.47, 185.0, 246.94, 293.66],
  [98.0, 146.83, 196.0, 246.94],
  [110.0, 164.81, 220.0, 277.18],
];
const BELLS = [587.33, 493.88, 392.0, 440.0]; // D5, B4, G4, A4
const THIRDS = [739.99, 587.33, 493.88, 554.37];

class Sfx {
  private noise: AudioBuffer | null = null;
  /** recorded single key presses, loaded the first time sound is on */
  private samples: AudioBuffer[] = [];
  private sampleLoad: Promise<void> | null = null;
  private sampleChain: { ctx: AudioContext; input: AudioNode } | null = null;
  private keyBus: { ctx: AudioContext; input: GainNode } | null = null;
  private hall: { ctx: AudioContext; input: GainNode } | null = null;

  private ready(): Out | null {
    return guitarSynth.output();
  }

  private noiseBuf(ctx: AudioContext) {
    if (!this.noise || this.noise.sampleRate !== ctx.sampleRate) {
      const n = Math.floor(ctx.sampleRate * 2);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      // lightly pink: a running average keeps the top end from being harsh
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.6 + w * 0.4;
        d[i] = last * 1.6;
      }
      this.noise = b;
    }
    return this.noise;
  }

  /** keyboard: lowpass, then a little case cavity, then out */
  private keys(o: Out) {
    if (this.keyBus && this.keyBus.ctx === o.ctx) return this.keyBus.input;
    const { ctx, out } = o;
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;
    lp.Q.value = 0.5;
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 230;
    body.gain.value = 3.5;
    body.Q.value = 0.9;
    input.connect(body).connect(lp);
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    lp.connect(dry).connect(out);
    // a short, dull cavity
    const len = Math.floor(ctx.sampleRate * 0.075);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.014)) * 0.6;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.26;
    lp.connect(conv).connect(wet).connect(out);
    this.keyBus = { ctx, input };
    return input;
  }

  /** a large, soft hall, for the pad and the bell */
  private reverb(o: Out) {
    if (this.hall && this.hall.ctx === o.ctx) return this.hall.input;
    const { ctx, out } = o;
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18; // the tail darkens as it decays
        d[i] = lp * Math.exp(-t * 2.3) * (1 - Math.exp(-t * 60)) * 2.2;
      }
    }
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    input.connect(conv).connect(wet).connect(out);
    input.connect(out);
    this.hall = { ctx, input };
    return input;
  }

  private burst(
    o: Out,
    dest: AudioNode,
    at: number,
    dur: number,
    freq: number,
    q: number,
    gain: number,
    type: BiquadFilterType = "bandpass"
  ) {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.5, dur + 0.02);
    return g;
  }

  private tone(
    o: Out,
    dest: AudioNode,
    at: number,
    dur: number,
    f0: number,
    f1: number,
    gain: number,
    type: OscillatorType = "sine",
    attack = 0.002
  ) {
    const { ctx } = o;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, at + Math.min(dur, 0.09));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /* ----------------------------- keyboard ----------------------------- */

  private loadSamples(ctx: AudioContext) {
    if (this.sampleLoad) return;
    this.sampleLoad = (async () => {
      const files = Array.from({ length: 32 }, (_, i) => `/sounds/keys/k${String(i + 1).padStart(2, "0")}.wav`);
      const out: AudioBuffer[] = [];
      await Promise.all(
        files.map(async (f) => {
          try {
            const r = await fetch(f);
            if (!r.ok) return;
            const buf = await ctx.decodeAudioData(await r.arrayBuffer());
            // level each recording to the same peak
            const d = buf.getChannelData(0);
            let pk = 0;
            for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
            if (pk > 0.001) for (let i = 0; i < d.length; i++) d[i] *= 0.7 / pk;
            out.push(buf);
          } catch {
            /* the synthesised key stays */
          }
        })
      );
      if (out.length >= 4) this.samples = out;
    })();
  }

  /** the recorded keys' own chain: rounder, lower, with a little case around it */
  private sampleBus(o: Out) {
    if (this.sampleChain && this.sampleChain.ctx === o.ctx) return this.sampleChain.input;
    const { ctx, out } = o;
    const input = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;
    low.gain.value = 6;
    const dip = ctx.createBiquadFilter();
    dip.type = "peaking";
    dip.frequency.value = 2600;
    dip.Q.value = 0.8;
    dip.gain.value = -5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    lp.Q.value = 0.55;
    input.connect(low).connect(dip).connect(lp);
    const dry = ctx.createGain();
    dry.gain.value = 0.9;
    lp.connect(dry).connect(out);
    const len = Math.floor(ctx.sampleRate * 0.09);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02)) * 0.5;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    lp.connect(conv).connect(wet).connect(out);
    this.sampleChain = { ctx, input };
    return input;
  }

  private playSample(o: Out, rate: number, gain: number, at: number, which?: number) {
    const buf = this.samples[(which ?? Math.floor(Math.random() * this.samples.length)) % this.samples.length];
    const bus = this.sampleBus(o);
    const src = o.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = o.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start(at);
  }

  keyDown(code = "KeyA") {
    const o = this.ready();
    if (!o) return;
    const { ctx } = o;
    this.loadSamples(ctx);
    if (this.samples.length) {
      const t = ctx.currentTime + 0.001;
      const big = code === "Space" ? 0.7 : WIDE.test(code) ? 0.8 : 0.88;
      const j = 1 + (Math.random() - 0.5) * 0.06;
      const vol = 0.85 + Math.random() * 0.25;
      // the recording, lowered; a lower copy under it for the body of the case
      this.playSample(o, big * j, 0.75 * vol, t);
      this.playSample(o, big * 0.68 * j, 0.34 * vol, t, Math.floor(Math.random() * 32));
      return;
    }
    const bus = this.keys(o);
    const now = ctx.currentTime + 0.001;
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 97;
    const space = code === "Space";
    const wide = WIDE.test(code);
    const pitch = (space ? 0.74 : wide ? 0.88 : 1) * (1 + ((h % 7) - 3) * 0.014) * (1 + (Math.random() - 0.5) * 0.06);
    const vol = 0.85 + Math.random() * 0.25;
    // the body: a soft, round low knock with a fast drop
    this.tone(o, bus, now, 0.13, 205 * pitch, 112 * pitch, 0.5 * vol, "sine", 0.0025);
    // the mid knock of the plate and case
    this.tone(o, bus, now, 0.06, 340 * pitch, 200 * pitch, 0.15 * vol, "triangle", 0.0015);
    // the bottom-out: damped, dull noise
    this.burst(o, bus, now, 0.055, 520 * pitch, 1.1, 0.3 * vol);
    // a barely-there click on top, kept under the rolled-off high end
    this.burst(o, bus, now, 0.012, 1900, 0.8, 0.045 * vol);
    if (space || wide) {
      this.burst(o, bus, now + 0.006, 0.022, 3200, 2.2, 0.03 * vol);
      this.tone(o, bus, now + 0.004, 0.09, space ? 150 : 175, space ? 96 : 120, 0.16 * vol, "sine");
    }
  }

  keyUp(code = "KeyA") {
    const o = this.ready();
    if (!o) return;
    if (this.samples.length) {
      // the upstroke: the same recordings, much quieter and a little higher, a short pock
      this.playSample(o, (WIDE.test(code) || code === "Space" ? 0.95 : 1.12) * (1 + (Math.random() - 0.5) * 0.08), 0.22, o.ctx.currentTime + 0.001);
      return;
    }
    const bus = this.keys(o);
    const now = o.ctx.currentTime + 0.001;
    const pitch = WIDE.test(code) || code === "Space" ? 0.85 : 1;
    this.tone(o, bus, now, 0.05, 280 * pitch, 205 * pitch, 0.14, "sine", 0.002);
    this.burst(o, bus, now, 0.022, 980, 1, 0.07);
  }

  /* ---------------------------- transitions ---------------------------- */

  /**
   * kind: "act" (between acts and between projects), "enter" (crossing into the
   * laptop), "close" (the last card). `index` walks the chord progression.
   */
  transition(kind: "act" | "enter" | "close", index = 0) {
    const o = this.ready();
    if (!o) return;
    const { ctx } = o;
    const hall = this.reverb(o);
    const t0 = ctx.currentTime + 0.03;
    const chord = CHORDS[((index % 4) + 4) % 4];
    const bell = BELLS[((index % 4) + 4) % 4];
    const third = THIRDS[((index % 4) + 4) % 4];
    const big = kind === "enter" ? 1.35 : kind === "close" ? 1.1 : 1;
    const dur = kind === "close" ? 4.6 : 3.6;

    // ---- the projector: motor, then the gate at 24 fps ----
    const motor = ctx.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(kind === "close" ? 52 : 38, t0);
    motor.frequency.linearRampToValueAtTime(kind === "close" ? 30 : 49, t0 + (kind === "close" ? 1.7 : 0.7));
    const mlp = ctx.createBiquadFilter();
    mlp.type = "lowpass";
    mlp.frequency.value = 170;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.0001, t0);
    mg.gain.linearRampToValueAtTime(0.03, t0 + 0.25);
    mg.gain.linearRampToValueAtTime(0.0001, t0 + (kind === "close" ? 1.9 : 1.35));
    motor.connect(mlp).connect(mg).connect(o.out);
    motor.start(t0);
    motor.stop(t0 + 2.1);
    const span = kind === "close" ? 1.7 : 1.15;
    let tt = 0;
    while (tt < span) {
      const u = tt / span;
      // the frame rate eases down when the film runs out
      const rate = kind === "close" ? 24 - 18 * u * u : 24;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7);
      this.burst(o, o.out, t0 + tt, 0.007, 1350 + Math.random() * 500, 1.4, 0.05 * env + 0.004);
      tt += (1 / rate) * (1 + (Math.random() - 0.5) * 0.04);
    }

    // ---- a breath of paper / a curtain drawn ----
    const paper = this.burst(o, hall, t0, 0.55, 900, 0.7, 0.07 * big, "bandpass");
    paper.gain.cancelScheduledValues(t0);
    paper.gain.setValueAtTime(0.0001, t0);
    paper.gain.linearRampToValueAtTime(0.06 * big, t0 + 0.18);
    paper.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);

    // ---- the string pad ----
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(380, t0);
    lp.frequency.exponentialRampToValueAtTime(1500 * big, t0 + 1.3);
    lp.frequency.exponentialRampToValueAtTime(650, t0 + dur);
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, t0);
    padGain.gain.linearRampToValueAtTime(0.14 * big, t0 + 0.95);
    padGain.gain.linearRampToValueAtTime(0.095 * big, t0 + 2.0);
    padGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(padGain).connect(hall);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 4; // cents
    lfo.connect(lfoGain);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
    chord.forEach((f, i) => {
      for (const det of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = det;
        lfoGain.connect(osc.detune);
        const vg = ctx.createGain();
        vg.gain.value = 0.18 / (1 + i * 0.35);
        osc.connect(vg).connect(lp);
        osc.start(t0);
        osc.stop(t0 + dur + 0.1);
      }
    });
    if (kind === "enter" || kind === "close") {
      // a low floor under the swell
      this.tone(o, hall, t0, 1.6, kind === "close" ? 62 : 55, kind === "close" ? 49 : 36, 0.22, "sine", 0.02);
    }

    // ---- the felt-piano note as the title resolves, then its third ----
    const note = (at: number, f: number, g: number) => {
      const n = ctx.createGain();
      n.connect(hall);
      const nl = ctx.createBiquadFilter();
      nl.type = "lowpass";
      nl.frequency.value = 3200;
      nl.connect(n);
      this.tone({ ctx, out: o.out }, nl, at, 2.6, f, f, g, "sine", 0.004);
      this.tone({ ctx, out: o.out }, nl, at, 1.4, f * 2.001, f * 2.001, g * 0.32, "sine", 0.003);
      this.tone({ ctx, out: o.out }, nl, at, 0.6, f * 3.002, f * 3.002, g * 0.1, "sine", 0.003);
      this.burst(o, nl, at, 0.035, 700, 0.9, g * 0.5);
    };
    note(t0 + 0.9, bell, 0.16);
    note(t0 + 1.38, third, 0.1);

    // ---- old film: a little crackle and hiss under all of it ----
    const hiss = this.burst(o, o.out, t0, dur - 0.4, 5200, 0.4, 0.006);
    hiss.gain.cancelScheduledValues(t0);
    hiss.gain.setValueAtTime(0.0001, t0);
    hiss.gain.linearRampToValueAtTime(0.0065, t0 + 0.4);
    hiss.gain.linearRampToValueAtTime(0.0001, t0 + dur - 0.3);
    const clicks = Math.floor(dur * 7);
    for (let i = 0; i < clicks; i++) {
      this.burst(o, o.out, t0 + Math.random() * (dur - 0.4), 0.0025, 2600 + Math.random() * 3200, 0.6, 0.008 + Math.random() * 0.02, "highpass");
    }
  }

  /** a mouse button: a short, dry, slightly hollow click */
  click() {
    const o = this.ready();
    if (!o) return;
    this.loadSamples(o.ctx);
    if (this.samples.length) {
      // a mouse button is a very small, high key
      this.playSample(o, 1.45, 0.4, o.ctx.currentTime + 0.001);
      this.playSample(o, 1.2, 0.18, o.ctx.currentTime + 0.055);
      return;
    }
    const bus = this.keys(o);
    const now = o.ctx.currentTime + 0.001;
    this.burst(o, bus, now, 0.012, 2400, 1.4, 0.18);
    this.tone(o, bus, now, 0.03, 900, 520, 0.12, "sine", 0.001);
    this.burst(o, bus, now + 0.05, 0.01, 1900, 1.4, 0.09);
  }
}

export const sfx = new Sfx();
