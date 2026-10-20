import * as THREE from "three";
import { MONO, canvasTexture, makeCanvas } from "./util";
import type { SceneFonts } from "./textures";

/**
 * The wall. Real film posters and album covers (see public/posters/CREDITS.md)
 * hung as one composition: a dominant piece, a loose triptych, two quiet ones
 * up high, and a ledge with two album covers leaning on it. Every slot has a
 * typographic stand-in that shows instantly and is swapped for the image once
 * it has loaded, so the wall is never empty.
 */

export type PosterFinish = "black" | "metal" | "oak" | "white";

export type PosterDef = {
  id: string;
  title: string;
  note: string;
  /** image under /public, if any */
  src?: string;
  w: number;
  h: number;
  finish: PosterFinish;
  mat?: { inset: number; color: number };
  /** where it hangs on the wall (or stands, if `shelf`) */
  x: number;
  y: number;
  /** a few degrees off level, the way a hand hangs things */
  tilt?: number;
  /** stands on the ledge instead of hanging */
  shelf?: boolean;
  fallback: () => THREE.CanvasTexture;
};

const SERIF = 'Georgia, "Times New Roman", serif';

/** A stand-in title card: coloured field, big serif title. */
function titleCard(title: string, sub: string, bg: string, fg: string, ratio: number) {
  const w = 480;
  const h = Math.round(w / ratio);
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(1, "#0b0b0d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  const words = title.split(" ");
  const size = Math.min(76, (w * 0.8) / Math.max(...words.map((x) => x.length)) / 0.62);
  ctx.font = `italic 600 ${size}px ${SERIF}`;
  let y = h * 0.42 - ((words.length - 1) * size) / 2;
  for (const word of words) {
    ctx.fillText(word, w / 2, y);
    y += size * 1.05;
  }
  ctx.font = `500 15px ${MONO}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(sub.toUpperCase(), w / 2, h - 44);
  return canvasTexture(c, 4);
}

const FILM_EXT: Record<string, string> = {
  "dead-poets-society": "png",
  "good-will-hunting": "png",
};

export function posterDefs(fonts: SceneFonts): PosterDef[] {
  void fonts;
  const film = (
    id: string,
    title: string,
    year: string,
    bg: string,
    fg: string,
    o: { w: number; h: number; x: number; y: number; finish: PosterFinish; tilt?: number; mat?: PosterDef["mat"] }
  ): PosterDef => ({
    id: `poster-${id}`,
    title,
    note: `${title} (${year}). One of the films I keep coming back to.`,
    src: `/posters/${id}.${FILM_EXT[id] ?? "jpg"}`,
    fallback: () => titleCard(title, year, bg, fg, o.w / o.h),
    ...o,
  });
  const album = (
    id: string,
    title: string,
    note: string,
    ext: string,
    bg: string,
    o: { x: number; y: number; tilt?: number }
  ): PosterDef => ({
    id: `poster-${id}`,
    title,
    note,
    src: `/posters/${id}.${ext}`,
    w: 0.13,
    h: 0.13,
    finish: "black",
    shelf: true,
    fallback: () => titleCard(title, "album", bg, "#f2f0e8", 1),
    ...o,
  });

  return [
    // the dominant piece, over the laptop
    film("dead-poets-society", "Dead Poets Society", "1989", "#3a2f22", "#f1e6cf", { w: 0.3, h: 0.43, x: -0.36, y: 0.72, finish: "black" }),
    // a loose triptych to its right, none of them level with the others
    film("good-will-hunting", "Good Will Hunting", "1997", "#233447", "#e9f0f7", { w: 0.21, h: 0.3, x: 0.0, y: 0.84, finish: "oak", tilt: 0.012, mat: { inset: 0.012, color: 0xf1ede2 } }),
    film("whiplash", "Whiplash", "2014", "#5a1f1f", "#f6e7c8", { w: 0.2, h: 0.29, x: 0.27, y: 0.7, finish: "black", tilt: -0.01 }),
    film("the-holdovers", "The Holdovers", "2023", "#4b2a2a", "#f3e7da", { w: 0.15, h: 0.22, x: 0.5, y: 0.86, finish: "white" }),
    // quieter ones, up and out
    film("perks-of-being-a-wallflower", "The Perks of Being a Wallflower", "2012", "#43362b", "#f4ecdd", { w: 0.15, h: 0.22, x: -0.62, y: 0.9, finish: "metal", tilt: 0.02 }),
    film("forrest-gump", "Forrest Gump", "1994", "#2c4a63", "#f6f1e0", { w: 0.13, h: 0.19, x: 0.62, y: 0.6, finish: "black", tilt: -0.018 }),
    film("stand-by-me", "Stand by Me", "1986", "#2f3d33", "#eef0e0", { w: 0.12, h: 0.18, x: 0.36, y: 0.98, finish: "oak" }),
    // two albums on the ledge, leaning
    album("punisher", "Phoebe Bridgers", "Phoebe Bridgers (Punisher): the quiet, atmospheric end of rock.", "png", "#1d2a3d", { x: -0.2, y: 0, tilt: 0.03 }),
    album("grace", "Jeff Buckley", "Jeff Buckley (Grace): the soft, atmospheric end of rock and singer-songwriter music.", "jpg", "#2a2a2a", { x: -0.05, y: 0, tilt: -0.025 }),
  ];
}
