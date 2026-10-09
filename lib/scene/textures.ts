import * as THREE from "three";
import { MONO, canvasTexture, makeCanvas, rng } from "./util";

/**
 * Procedural surface textures for the desk scene. Everything is drawn once
 * to a canvas — no image files, no network — and kept small.
 */

export type SceneFonts = { hero: string; hand: string };

const SERIF = 'Georgia, "Times New Roman", serif';

function noiseLayer(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const R = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Dark walnut: long grain streaks with slow tonal drift. */
export function walnutTexture() {
  const w = 1024;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const R = rng(11);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#2a1c14");
  g.addColorStop(0.5, "#33231a");
  g.addColorStop(1, "#271a12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const y0 = R() * h;
    const amp = 2 + R() * 9;
    const f = 0.004 + R() * 0.012;
    const ph = R() * 6.28;
    ctx.strokeStyle = R() < 0.55 ? `rgba(10,6,4,${0.05 + R() * 0.16})` : `rgba(96,66,44,${0.03 + R() * 0.1})`;
    ctx.lineWidth = 0.5 + R() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = y0 + Math.sin(x * f + ph) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // a couple of broad, soft tonal bands
  for (let i = 0; i < 5; i++) {
    const y = R() * h;
    const band = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.5, `rgba(${R() < 0.5 ? "0,0,0" : "120,86,60"},0.1)`);
    band.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, y - 40, w, 80);
  }
  noiseLayer(ctx, w, h, 8, 3);
  const t = canvasTexture(c, 8);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fine plaster for the wall; used as colour and as a barely-there bump. */
export function plasterTexture() {
  const w = 512;
  const c = makeCanvas(w, w);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2c2d30";
  ctx.fillRect(0, 0, w, w);
  const R = rng(5);
  for (let i = 0; i < 90; i++) {
    const x = R() * w;
    const y = R() * w;
    const r = 20 + R() * 90;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${R() < 0.5 ? "255,255,255" : "0,0,0"},0.035)`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noiseLayer(ctx, w, w, 14, 8);
  const t = canvasTexture(c, 4);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 4);
  return t;
}

/** Charcoal felt desk mat with a stitched edge. */
export function feltTexture(aspect: number) {
  const w = 1024;
  const h = Math.round(w / aspect);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1c1d20";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 16, 21);
  ctx.strokeStyle = "rgba(150,156,168,0.32)";
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  ctx.strokeRect(14, 14, w - 28, h - 28);
  return canvasTexture(c, 4);
}

/** Dark cloth-bound cover. */
export function coverTexture() {
  const w = 256;
  const c = makeCanvas(w, w);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1d1e22";
  ctx.fillRect(0, 0, w, w);
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, w);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
  noiseLayer(ctx, w, w, 14, 31);
  const t = canvasTexture(c, 4);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  return t;
}

/** A soft rounded-rect falloff, used for contact shadows under objects. */
export function contactShadowTexture() {
  const s = 128;
  const c = makeCanvas(s, s);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return canvasTexture(c, 1);
}

/** A mouse arrow for the laptop screen: white with a dark edge. */
export function arrowTexture() {
  const s = 96;
  const c = makeCanvas(s, s);
  const ctx = c.getContext("2d")!;
  ctx.translate(18, 10);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 58);
  ctx.lineTo(14, 45);
  ctx.lineTo(24, 68);
  ctx.lineTo(33, 64);
  ctx.lineTo(23, 41);
  ctx.lineTo(42, 41);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#0a0a0b";
  ctx.stroke();
  ctx.fillStyle = "#f6f6f2";
  ctx.fill();
  return canvasTexture(c, 2);
}

/** Round desk-clock face showing the visitor's local time. */
export function paintClock(ctx: CanvasRenderingContext2D, size: number, date: Date) {
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ecebe6";
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#15161a";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 5 : 2;
    const l = i % 3 === 0 ? 0.16 : 0.1;
    ctx.beginPath();
    ctx.moveTo(r + Math.sin(a) * r * (0.9 - l), r - Math.cos(a) * r * (0.9 - l));
    ctx.lineTo(r + Math.sin(a) * r * 0.9, r - Math.cos(a) * r * 0.9);
    ctx.stroke();
  }
  const m = date.getMinutes();
  const hAng = (((date.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
  const mAng = (m / 60) * Math.PI * 2;
  const hand = (a: number, len: number, wd: number) => {
    ctx.lineWidth = wd;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.lineTo(r + Math.sin(a) * r * len, r - Math.cos(a) * r * len);
    ctx.stroke();
  };
  hand(hAng, 0.5, 7);
  hand(mAng, 0.74, 4);
  ctx.fillStyle = "#15161a";
  ctx.beginPath();
  ctx.arc(r, r, 6, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------- wall prints ------------------------- *
 * Everything here is an original typographic / illustrative
 * interpretation. No poster artwork is reproduced.                  */

/** Dead Poets Society: a literary-style print. "Carpe diem" is Horace. */
export function printCarpe() {
  const w = 600;
  const h = 840;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9e4d6";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 8, 41);
  ctx.fillStyle = "#1a1a1c";
  ctx.textAlign = "center";
  ctx.font = `italic 600 130px ${SERIF}`;
  ctx.fillText("carpe", w / 2, h * 0.43);
  ctx.fillText("diem", w / 2, h * 0.43 + 128);
  ctx.fillRect(w / 2 - 34, h * 0.43 + 168, 68, 3);
  ctx.font = `500 22px ${SERIF}`;
  ctx.fillText("seize the day", w / 2, h * 0.43 + 214);
  ctx.font = `500 16px ${MONO}`;
  ctx.fillStyle = "rgba(26,26,28,0.55)";
  ctx.fillText("AFTER HORACE", w / 2, h - 70);
  return canvasTexture(c, 8);
}

/** A moody, grainy monochrome "photograph": a guitar against a dim wall. */
export function printMusic() {
  const w = 900;
  const h = 600;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const bg = ctx.createRadialGradient(w * 0.62, h * 0.28, 20, w * 0.62, h * 0.4, w * 0.75);
  bg.addColorStop(0, "#8a8a86");
  bg.addColorStop(0.35, "#34353a");
  bg.addColorStop(1, "#0b0b0d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // a window-light beam falling across the wall
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(w * 0.55, 0);
  ctx.lineTo(w * 0.78, 0);
  ctx.lineTo(w * 0.52, h);
  ctx.lineTo(w * 0.22, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // acoustic guitar silhouette, leaning
  ctx.save();
  ctx.translate(w * 0.5, h * 0.62);
  ctx.rotate(-0.22);
  ctx.fillStyle = "#050506";
  ctx.beginPath();
  ctx.ellipse(0, 86, 118, 104, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -36, 84, 76, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-13, -310, 26, 290);
  ctx.beginPath();
  ctx.moveTo(-24, -310);
  ctx.lineTo(24, -310);
  ctx.lineTo(30, -362);
  ctx.lineTo(-30, -362);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(190,190,186,0.28)";
  ctx.beginPath();
  ctx.arc(0, 70, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#050506";
  ctx.beginPath();
  ctx.arc(0, 70, 33, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  noiseLayer(ctx, w, h, 26, 13);
  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  return canvasTexture(c, 8);
}

/** An original handwritten line — not a lyric. */
export function printHandwritten(fonts: SceneFonts) {
  const w = 500;
  const h = 650;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#efeadd";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 8, 51);
  ctx.fillStyle = "#23252c";
  ctx.textAlign = "center";
  ctx.font = `400 74px ${fonts.hand}, cursive`;
  ctx.fillText("play it", w / 2, h * 0.36);
  ctx.fillText("quietly,", w / 2, h * 0.36 + 80);
  ctx.fillText("mean it", w / 2, h * 0.36 + 200);
  ctx.fillText("loudly.", w / 2, h * 0.36 + 280);
  ctx.strokeStyle = "rgba(35,37,44,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.36 + 304);
  ctx.bezierCurveTo(w * 0.44, h * 0.36 + 292, w * 0.56, h * 0.36 + 316, w * 0.66, h * 0.36 + 300);
  ctx.stroke();
  return canvasTexture(c, 8);
}

/** Stand by Me: a plain line drawing of a railway disappearing. */
export function printRails() {
  const w = 520;
  const h = 520;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#d9d8d2";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 10, 61);
  const vx = w * 0.5;
  const vy = h * 0.4;
  // faint sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, vy);
  sky.addColorStop(0, "rgba(40,44,52,0.18)");
  sky.addColorStop(1, "rgba(40,44,52,0)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, vy);
  ctx.strokeStyle = "#1b1c20";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h);
  ctx.lineTo(vx - 3, vy);
  ctx.moveTo(w * 0.84, h);
  ctx.lineTo(vx + 3, vy);
  ctx.stroke();
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 11; i++) {
    const t = Math.pow(i / 10, 1.9);
    const y = vy + (h - vy) * t;
    const half = 3 + (w * 0.34 - 3) * t;
    const ext = half * 1.28;
    ctx.beginPath();
    ctx.moveTo(vx - ext, y);
    ctx.lineTo(vx + ext, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#1b1c20";
  ctx.fillRect(0, vy - 2, w, 2);
  return canvasTexture(c, 8);
}

/** A short list of films, set as quiet typography. */
export function printFilms() {
  const w = 420;
  const h = 760;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#16171a";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 8, 71);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(236,234,226,0.5)";
  ctx.font = `500 15px ${MONO}`;
  ctx.fillText("THE ONES I REWATCH", w / 2, 92);
  ctx.fillStyle = "#ecead9";
  const lines = ["Dead", "Poets", "Society", "", "Good Will", "Hunting", "", "Stand", "by Me", "", "Whiplash"];
  let y = 190;
  for (const l of lines) {
    if (l) {
      ctx.font = `italic 500 44px ${SERIF}`;
      ctx.fillText(l, w / 2, y);
      y += 52;
    } else {
      y += 22;
    }
  }
  ctx.fillStyle = "rgba(236,234,226,0.35)";
  ctx.fillRect(w / 2 - 22, h - 96, 44, 2);
  return canvasTexture(c, 8);
}

/* --------------------- the notebook's page --------------------- */

export type SketchProgress = { note: number; s1: number; s2: number; s3: number };

/** Hand-drawn style stroke: a wobbly polyline, drawn up to `p` (0..1). */
function pencil(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  p: number,
  seed: number,
  width = 2.6
) {
  if (p <= 0) return;
  const R = rng(seed);
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let remain = total * Math.min(p, 1);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && remain > 0; i++) {
    const l = lens[i - 1];
    const k = Math.min(remain / l, 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k;
    const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k;
    const mx = (pts[i - 1][0] + x) / 2 + (R() - 0.5) * 2.4;
    const my = (pts[i - 1][1] + y) / 2 + (R() - 0.5) * 2.4;
    ctx.quadraticCurveTo(mx, my, x, y);
    remain -= l;
  }
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function circle(cx: number, cy: number, r: number, n = 26): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    out.push([cx + Math.cos(a) * r * (1 + (i === n ? 0.06 : 0)), cy + Math.sin(a) * r]);
  }
  return out;
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  p: number,
  seed: number
) {
  pencil(ctx, [[x0, y0], [x1, y1]], p, seed);
  if (p > 0.96) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    pencil(
      ctx,
      [
        [x1 - Math.cos(a - 0.45) * 15, y1 - Math.sin(a - 0.45) * 15],
        [x1, y1],
        [x1 - Math.cos(a + 0.45) * 15, y1 - Math.sin(a + 0.45) * 15],
      ],
      1,
      seed + 1
    );
  }
}

/**
 * The page the idea is written on. One handwritten line, then three small
 * sketches — each a rough shape of one of the actual projects:
 *   1. Sunūwā: a citizen's complaint routed to the right office
 *   2. Crash Capsule: evidence reconstructed into a timeline
 *   3. The agent work: a plan → act → check loop
 */
export function paintNotebookPage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: SketchProgress,
  fonts: SceneFonts
) {
  ctx.fillStyle = "#ece8db";
  ctx.fillRect(0, 0, w, h);
  noiseLayer(ctx, w, h, 7, 91);
  // ruled lines + margin
  ctx.strokeStyle = "rgba(70,90,130,0.16)";
  ctx.lineWidth = 1.2;
  for (let y = 120; y < h - 30; y += 38) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(160,70,70,0.22)";
  ctx.beginPath();
  ctx.moveTo(62, 0);
  ctx.lineTo(62, h);
  ctx.stroke();

  const ink = "#272a33";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // the note
  const note = "An idea is only the beginning.";
  const n = Math.ceil(note.length * Math.min(p.note, 1));
  ctx.font = `400 38px ${fonts.hand}, cursive`;
  ctx.textAlign = "left";
  ctx.fillText(note.slice(0, n), 84, 78);

  ctx.font = `400 26px ${fonts.hand}, cursive`;
  const label = (t: string, x: number, y: number, pr: number, align: CanvasTextAlign = "center") => {
    if (pr < 0.35) return;
    ctx.globalAlpha = Math.min(1, (pr - 0.35) / 0.4);
    ctx.textAlign = align;
    ctx.fillText(t, x, y);
    ctx.globalAlpha = 1;
  };

  // 1 — Sunūwā: citizen → routing → government
  const y1 = 232;
  if (p.s1 > 0) {
    label("Sunūwā", 84, y1 - 70, p.s1, "left");
    pencil(ctx, circle(120, y1, 30), Math.min(p.s1 * 3, 1), 101);
    pencil(ctx, [[215, y1 - 28], [320, y1 - 28], [320, y1 + 28], [215, y1 + 28], [215, y1 - 28]], Math.min(Math.max(p.s1 * 3 - 0.5, 0), 1), 102);
    pencil(ctx, circle(425, y1, 30), Math.min(Math.max(p.s1 * 3 - 1, 0), 1), 103);
    arrow(ctx, 156, y1, 208, y1, Math.min(Math.max(p.s1 * 3 - 1.2, 0), 1), 104);
    arrow(ctx, 326, y1, 388, y1, Math.min(Math.max(p.s1 * 3 - 1.8, 0), 1), 105);
    label("citizen", 120, y1 + 66, p.s1);
    label("routing", 268, y1 + 66, p.s1);
    label("government", 425, y1 + 66, p.s1);
  }

  // 2 — Crash Capsule: evidence → a timeline
  const y2 = 468;
  if (p.s2 > 0) {
    label("Crash Capsule", 84, y2 - 74, p.s2, "left");
    pencil(ctx, [[96, y2], [504, y2]], Math.min(p.s2 * 2, 1), 111);
    const ticks = [150, 270, 390, 490];
    ticks.forEach((x, i) => {
      const k = Math.min(Math.max(p.s2 * 2 - 0.6 - i * 0.3, 0), 1);
      pencil(ctx, [[x, y2 - 16], [x, y2 + 16]], k, 112 + i);
      if (k > 0.9) {
        pencil(ctx, circle(x, y2 - 34, 7, 14), 1, 130 + i, 2);
      }
    });
    label("evidence", 150, y2 + 62, p.s2);
    label("scene", 330, y2 + 62, p.s2);
    label("timeline", 480, y2 + 62, p.s2);
  }

  // 3 — the agent work: plan → act → check, and round again
  const y3 = 742;
  if (p.s3 > 0) {
    label("agentic loop", 84, y3 - 104, p.s3, "left");
    const nodes: [number, number][] = [[145, y3], [300, y3 - 52], [455, y3]];
    nodes.forEach(([x, y], i) => {
      pencil(ctx, circle(x, y, 26), Math.min(Math.max(p.s3 * 3 - i * 0.7, 0), 1), 141 + i);
    });
    arrow(ctx, 172, y3 - 12, 272, y3 - 46, Math.min(Math.max(p.s3 * 3 - 1.4, 0), 1), 151);
    arrow(ctx, 330, y3 - 46, 430, y3 - 12, Math.min(Math.max(p.s3 * 3 - 1.8, 0), 1), 152);
    pencil(
      ctx,
      [[428, y3 + 22], [380, y3 + 70], [220, y3 + 70], [172, y3 + 22]],
      Math.min(Math.max(p.s3 * 3 - 2.1, 0), 1),
      153
    );
    label("plan", 145, y3 + 54, p.s3);
    label("act", 300, y3 - 92, p.s3);
    label("check", 455, y3 + 54, p.s3);
  }
}

export function makePageCanvas() {
  const c = makeCanvas(640, 880);
  const tex = canvasTexture(c, 8);
  return { canvas: c, ctx: c.getContext("2d")!, tex };
}
