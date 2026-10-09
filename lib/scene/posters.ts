import * as THREE from "three";
import { MONO, canvasTexture, makeCanvas } from "./util";
import { printHandwritten, printMusic, printRails, type SceneFonts } from "./textures";

/**
 * The wall. Real film posters and album covers (see public/posters/CREDITS.md)
 * plus a couple of original pieces. Every slot has a typographic stand-in that
 * shows instantly and is swapped for the image once it has loaded, so the wall
 * is never empty and a missing file degrades to a title card.
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

export function posterDefs(fonts: SceneFonts): PosterDef[] {
  const film = (
    id: string,
    title: string,
    year: string,
    bg: string,
    fg: string,
    finish: PosterFinish
  ): PosterDef => ({
    id: `poster-${id}`,
    title,
    note: `${title} (${year}). One of the films I keep coming back to.`,
    src: `/posters/${id}.${id === "dead-poets-society" || id === "good-will-hunting" ? "png" : "jpg"}`,
    w: 0.26,
    h: 0.38,
    finish,
    fallback: () => titleCard(title, year, bg, fg, 0.26 / 0.38),
  });
  const album = (id: string, title: string, note: string, ext: string, bg: string): PosterDef => ({
    id: `poster-${id}`,
    title,
    note,
    src: `/posters/${id}.${ext}`,
    w: 0.3,
    h: 0.3,
    finish: "black",
    fallback: () => titleCard(title, "album", bg, "#f2f0e8", 1),
  });

  return [
    film("dead-poets-society", "Dead Poets Society", "1989", "#3a2f22", "#f1e6cf", "black"),
    film("good-will-hunting", "Good Will Hunting", "1997", "#233447", "#e9f0f7", "oak"),
    film("perks-of-being-a-wallflower", "The Perks of Being a Wallflower", "2012", "#43362b", "#f4ecdd", "black"),
    film("stand-by-me", "Stand by Me", "1986", "#2f3d33", "#eef0e0", "metal"),
    film("forrest-gump", "Forrest Gump", "1994", "#2c4a63", "#f6f1e0", "black"),
    film("the-holdovers", "The Holdovers", "2023", "#4b2a2a", "#f3e7da", "white"),
    film("whiplash", "Whiplash", "2014", "#5a1f1f", "#f6e7c8", "black"),
    album(
      "punisher",
      "Phoebe Bridgers",
      "Phoebe Bridgers (Punisher): the quiet, atmospheric end of rock.",
      "png",
      "#1d2a3d"
    ),
    album(
      "grace",
      "Jeff Buckley",
      "Jeff Buckley (Grace): the soft, atmospheric end of rock and singer-songwriter music.",
      "jpg",
      "#2a2a2a"
    ),
    {
      id: "poster-music",
      title: "After dark",
      note: "An original piece. Quiet, loud, quiet.",
      w: 0.5,
      h: 0.36,
      finish: "metal",
      fallback: () => printMusic(),
    },
    {
      id: "poster-hand",
      title: "A line of my own",
      note: "An original line, handwritten. No borrowed lyrics.",
      w: 0.21,
      h: 0.27,
      finish: "oak",
      mat: { inset: 0.02, color: 0xf1ede2 },
      fallback: () => printHandwritten(fonts),
    },
    {
      id: "poster-rails",
      title: "The long walk",
      note: "Stand by Me, drawn as plainly as I could.",
      w: 0.22,
      h: 0.22,
      finish: "black",
      mat: { inset: 0.022, color: 0xe3e0d6 },
      fallback: () => printRails(),
    },
  ];
}

/**
 * Salon-style placement: a row of seven posters, a looser row above with the
 * album covers and the originals, small deliberate offsets so it reads as
 * hung by a person, not by a grid.
 */
export function posterLayout(defs: PosterDef[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const films = defs.filter((d) => d.src && d.h > d.w);
  const rowY = 0.56;
  const jitter = [0.02, -0.012, 0.016, -0.022, 0.01, -0.016, 0.022];
  films.forEach((d, i) => {
    out[d.id] = [-0.92 + i * 0.3, rowY + jitter[i % jitter.length]];
  });
  const upper = ["poster-punisher", "poster-grace", "poster-music", "poster-hand", "poster-rails"];
  const upDefs = upper.map((id) => defs.find((d) => d.id === id)!).filter(Boolean);
  const gap = 0.055;
  const total = upDefs.reduce((s, d) => s + d.w, 0) + gap * (upDefs.length - 1);
  let x = -0.02 - total / 2;
  const ys = [1.05, 1.08, 1.04, 1.1, 1.05];
  upDefs.forEach((d, i) => {
    out[d.id] = [x + d.w / 2, ys[i]];
    x += d.w + gap;
  });
  return out;
}
