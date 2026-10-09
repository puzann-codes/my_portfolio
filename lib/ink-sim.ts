/**
 * Ink particle simulation (CPU side). The renderer (components/InkCursor)
 * turns every particle into a soft metaball kernel and thresholds the summed
 * field, so particles that overlap fuse into one body of liquid and thin
 * necks between them snap into separate droplets on their own — exactly how
 * a stretched ink thread breaks up (Rayleigh–Plateau).
 *
 * Behaviours modelled, all in screen px / ms:
 *  - stroke:  a viscous, brush-like stream. Thick when slow, thin when fast,
 *             tapering tail (older particles shrink first) that beads off.
 *  - flick:   droplets thrown off the stroke, sizes follow a power law
 *             (lots of tiny ones, few big ones).
 *  - splat:   pool + radial ligaments (each a chain of beads that is
 *             ejected outward and stops from viscous drag, tip bead larger)
 *             + far satellite droplets + drips.
 *  - pool:    ink gathers where the cursor rests, then drips downward.
 */

export const INK_CAPACITY = 4096;
export const INK_FLOATS = 6; // x, y, radius, angle, stretch, wet

const TAU = Math.PI * 2;
const rand = Math.random;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

type Drip = { at: number; x: number; y: number; r: number };

export class InkSim {
  count = 0;
  readonly instance = new Float32Array(INK_CAPACITY * INK_FLOATS);

  private x = new Float32Array(INK_CAPACITY);
  private y = new Float32Array(INK_CAPACITY);
  private vx = new Float32Array(INK_CAPACITY);
  private vy = new Float32Array(INK_CAPACITY);
  private r0 = new Float32Array(INK_CAPACITY);
  private ang = new Float32Array(INK_CAPACITY);
  private str = new Float32Array(INK_CAPACITY);
  private drag = new Float32Array(INK_CAPACITY);
  private hold = new Float32Array(INK_CAPACITY);
  private life = new Float32Array(INK_CAPACITY);
  private trail = new Float32Array(INK_CAPACITY);
  private kind = new Uint8Array(INK_CAPACITY); // 0 ink, 1 drip head
  private birth = new Float64Array(INK_CAPACITY);

  private drips: Drip[] = [];
  private flow = 1; // slow random walk of stroke thickness
  private poolClock = 0;
  private dripped = false;

  private add(
    now: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    life: number,
    drag: number,
    hold: number,
    kind = 0
  ) {
    if (this.count >= INK_CAPACITY) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.r0[i] = r;
    this.life[i] = life;
    this.drag[i] = drag;
    this.hold[i] = hold;
    this.kind[i] = kind;
    this.birth[i] = now;
    this.trail[i] = 0;
    this.ang[i] = Math.atan2(vy, vx);
    this.str[i] = 1;
    return i;
  }

  private remove(i: number) {
    const l = --this.count;
    if (i === l) return;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.r0[i] = this.r0[l];
    this.ang[i] = this.ang[l];
    this.str[i] = this.str[l];
    this.drag[i] = this.drag[l];
    this.hold[i] = this.hold[l];
    this.life[i] = this.life[l];
    this.trail[i] = this.trail[l];
    this.kind[i] = this.kind[l];
    this.birth[i] = this.birth[l];
  }

  clear() {
    this.count = 0;
    this.drips.length = 0;
  }

  /** Continuous brush stroke between two pointer samples. `sp` is the
   * pointer speed in px per 16.7ms frame. */
  stroke(now: number, x0: number, y0: number, x1: number, y1: number, sp: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const steps = clamp(Math.round(dist / 3), 1, 90);
    const thin = smooth(2, 40, sp);
    const stretch = 1 + Math.min(sp, 40) * 0.02;
    this.dripped = false;
    this.poolClock = 0;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      this.flow = clamp(this.flow + (rand() - 0.5) * 0.11, 0.8, 1.25);
      const r = lerp(13, 5.5, thin) * this.flow;
      const i = this.add(
        now,
        px,
        py,
        nx * sp * 0.05 + (rand() - 0.5) * 0.25,
        ny * sp * 0.05 + (rand() - 0.5) * 0.25,
        r,
        950 + rand() * 450,
        0.84,
        0.1
      );
      if (i >= 0) {
        this.ang[i] = Math.atan2(dy, dx);
        this.str[i] = stretch;
      }
      // droplets breaking away from a fast stroke
      if (sp > 11 && rand() < Math.min(0.14, (sp - 11) / 220)) {
        this.flick(now, px, py, nx, ny, sp);
      }
    }
  }

  /** A single droplet thrown off the stroke, off-axis and forward. */
  flick(now: number, x: number, y: number, nx: number, ny: number, sp: number) {
    const a =
      Math.atan2(ny, nx) + (rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 1.1);
    const speed = sp * (0.2 + rand() * 0.45);
    const r = 1.8 + Math.pow(rand(), 2.2) * 7.5;
    this.add(
      now,
      x,
      y,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      r,
      900 + rand() * 1000,
      0.9,
      0.5
    );
  }

  /** Ink gathers where the pointer rests, then lets go of a drip. */
  rest(now: number, x: number, y: number, dtMs: number) {
    this.poolClock += dtMs;
    if (this.poolClock < 80 || this.poolClock > 1600) return;
    if (this.poolClock % 40 < dtMs) {
      const r = 15 + Math.min((this.poolClock - 80) / 70, 12);
      this.add(now, x, y, 0, 0, r, 1700 + rand() * 500, 0.8, 0.3);
    }
    if (!this.dripped && this.poolClock > 380) {
      this.dripped = true;
      this.drips.push({
        at: now + 80,
        x: x + (rand() - 0.5) * 10,
        y: y + 6,
        r: 5 + rand() * 2.5,
      });
    }
  }

  /** Full splash: pool, beaded ligaments, satellite droplets, drips. */
  splat(now: number, x: number, y: number, power = 1, dx = 0, dy = 0) {
    const dirLen = Math.hypot(dx, dy);
    const hasDir = dirLen > 0.5;
    const dirAng = hasDir ? Math.atan2(dy, dx) : 0;
    const root = Math.sqrt(power);

    // the pool the splash comes out of: several overlapping lobes, so the
    // body is irregular rather than a single round blob
    const pools = 6 + Math.floor(rand() * 4);
    for (let k = 0; k < pools; k++) {
      const pa = rand() * TAU;
      const pd = rand() * 15 * root;
      this.add(
        now,
        x + Math.cos(pa) * pd,
        y + Math.sin(pa) * pd,
        Math.cos(pa) * (0.4 + rand() * 1.4),
        Math.sin(pa) * (0.4 + rand() * 1.4),
        (14 + rand() * 11) * root,
        2600 + rand() * 1300,
        0.8,
        0.55
      );
    }

    // Ligaments: a thread of beads shot outward. Outer beads are faster, so
    // the thread stretches, thins and snaps into droplets near its tip.
    // Two classes: fat crown "fingers" (viscous ink makes blunt ones) and
    // a few long thin threads that end in a drop.
    const spawnLigament = (
      a: number,
      len: number,
      rRoot: number,
      tipScale: number,
      spacing: number
    ) => {
      const m = Math.max(5, Math.round(len / spacing));
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const drag = 0.9;
      for (let i = 0; i < m; i++) {
        const f = (i + 1) / m;
        const v = f * len * (1 - drag) * (1 + (rand() - 0.5) * 0.16 * f);
        let r = rRoot * (1 - 0.7 * f) * (0.85 + rand() * 0.3);
        if (i === m - 1) r = Math.max(r, rRoot * 0.5) * tipScale;
        this.add(
          now,
          x + ca * (2 + f * 3),
          y + sa * (2 + f * 3),
          ca * v,
          sa * v,
          r,
          1900 + rand() * 1100,
          drag,
          0.5
        );
      }
    };

    const fingers = Math.round((7 + rand() * 5) * clamp(0.5 + power * 0.5, 0.6, 1.3));
    const fBase = rand() * TAU;
    for (let j = 0; j < fingers; j++) {
      const a = fBase + (j / fingers) * TAU + (rand() - 0.5) * (TAU / fingers) * 0.8;
      const align = hasDir ? Math.cos(a - dirAng) : 0;
      const len = (24 + Math.pow(rand(), 1.4) * 38) * power * (1 + 0.8 * Math.max(align, 0));
      spawnLigament(a, len, (6 + rand() * 4) * root, 1.2 + rand() * 0.5, 4);
    }

    const threads = Math.round((5 + rand() * 5) * clamp(0.5 + power * 0.5, 0.6, 1.3));
    for (let j = 0; j < threads; j++) {
      const a =
        hasDir && rand() < 0.5 ? dirAng + (rand() - 0.5) * 1.7 : rand() * TAU;
      const align = hasDir ? Math.cos(a - dirAng) : 0;
      const len =
        (70 + Math.pow(rand(), 1.5) * 160) * power * (1 + 0.6 * Math.max(align, 0));
      spawnLigament(a, len, (2.3 + rand() * 1.5) * root, 1.9 + rand() * 1.1, 3.4);
    }

    // satellites flung far from the impact, power-law sizes
    const far = Math.round((12 + rand() * 12) * power);
    for (let k = 0; k < far; k++) {
      const a =
        hasDir && rand() < 0.5
          ? dirAng + (rand() - 0.5) * 1.4
          : rand() * TAU;
      const speed = (6 + rand() * 20) * root;
      this.add(
        now,
        x,
        y,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        1.4 + Math.pow(rand(), 2.6) * 10 * root,
        1600 + rand() * 1600,
        0.92,
        0.5
      );
    }

    if (power >= 0.7) {
      const d = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < d; k++) {
        this.drips.push({
          at: now + 260 + rand() * 450,
          x: x + (rand() - 0.5) * 22 * root,
          y: y + 8 * root,
          r: 5.5 + rand() * 3,
        });
      }
    }
  }

  private spawnDrip(now: number, d: Drip) {
    this.add(now, d.x, d.y, 0, 0.3, d.r, 2800, 0.99, 0.8, 1);
  }

  update(now: number, dt: number) {
    for (let i = this.drips.length - 1; i >= 0; i--) {
      if (now >= this.drips[i].at) {
        this.spawnDrip(now, this.drips[i]);
        this.drips.splice(i, 1);
      }
    }

    for (let i = this.count - 1; i >= 0; i--) {
      const age = now - this.birth[i];
      if (age >= this.life[i]) {
        this.remove(i);
        continue;
      }
      if (this.kind[i] === 1) {
        // a drip: gravity pulls it down a sticky thread of its own ink
        this.vy[i] = Math.min(this.vy[i] + 0.045 * dt, 3.4);
        this.vx[i] *= 0.97;
        this.x[i] += this.vx[i] * dt;
        const step = this.vy[i] * dt;
        this.y[i] += step;
        this.trail[i] += step;
        while (this.trail[i] >= 4) {
          this.trail[i] -= 4;
          this.add(
            now,
            this.x[i],
            this.y[i] - this.trail[i],
            0,
            0,
            this.r0[i] * 0.55,
            800 + rand() * 300,
            0.8,
            0.15
          );
        }
        this.r0[i] *= Math.pow(0.9955, dt);
        if (this.r0[i] < 2.4) {
          this.kind[i] = 0;
          this.vx[i] = 0;
          this.vy[i] = 0;
        }
      } else {
        const k = Math.pow(this.drag[i], dt);
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.vx[i] *= k;
        this.vy[i] *= k;
        const sp = Math.hypot(this.vx[i], this.vy[i]);
        if (sp > 0.5) {
          this.ang[i] = Math.atan2(this.vy[i], this.vx[i]);
          this.str[i] = Math.max(this.str[i], 1 + Math.min(sp * 0.07, 1.5));
        } else {
          // surface tension pulls a settled drop back toward round
          this.str[i] += (1 - this.str[i]) * Math.min(0.05 * dt, 1);
        }
      }
    }

    const inst = this.instance;
    for (let i = 0; i < this.count; i++) {
      const age = now - this.birth[i];
      const u = age / this.life[i];
      const h = this.hold[i];
      const g = clamp(age / 110, 0, 1);
      const grow = 0.5 + 0.5 * (1 - Math.pow(1 - g, 3));
      const shrink = u < h ? 1 : 1 - Math.pow((u - h) / (1 - h), 1.7);
      const o = i * INK_FLOATS;
      inst[o] = this.x[i];
      inst[o + 1] = this.y[i];
      inst[o + 2] = this.r0[i] * grow * Math.max(shrink, 0);
      inst[o + 3] = this.ang[i];
      inst[o + 4] = this.str[i];
      inst[o + 5] = 1 - smooth(0.15, 0.75, u);
    }
  }
}
