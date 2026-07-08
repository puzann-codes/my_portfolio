// A deliberately "zoomed in" crop of a guitar — mostly soundhole and a
// slice of fretboard, filling the whole frame edge-to-edge like a photo
// crop, rather than a small full-instrument icon floating in whitespace.

export const VB = { w: 1600, h: 640 };
export const CENTER_Y = 320;

export const STRING_Y = [215, 257, 299, 341, 383, 425];
export const STRING_WEIGHT = [3.6, 3.0, 2.5, 2.0, 1.6, 1.2];

export const SOUNDHOLE = { x: 470, y: CENTER_Y, r: 210 };
export const ROSETTE_RINGS = [22, 42]; // inset distances from the main hole edge

export const FRET_X_START = 700;
export const FRET_X_END = 1580;
export const FRET_COUNT = 7;

export function fretXs(): number[] {
  const xs: number[] = [];
  const span = FRET_X_END - FRET_X_START;
  for (let i = 1; i <= FRET_COUNT; i++) {
    xs.push(FRET_X_START + (span * i) / (FRET_COUNT + 1));
  }
  return xs;
}

export function inlayDots(): { x: number; y: number }[] {
  const xs = fretXs();
  const dotY = (STRING_Y[3] + STRING_Y[4]) / 2;
  return [
    { x: (xs[2] + xs[3]) / 2, y: dotY },
    { x: (xs[4] + xs[5]) / 2, y: dotY },
  ];
}

/** Diagonal of the viewbox — the radius an expanding fill needs to reach
 * from any origin point to guarantee full coverage. */
export function maxFillRadius(originX: number, originY: number): number {
  const corners = [
    { x: 0, y: 0 },
    { x: VB.w, y: 0 },
    { x: 0, y: VB.h },
    { x: VB.w, y: VB.h },
  ];
  return Math.max(
    ...corners.map((c) => Math.hypot(c.x - originX, c.y - originY))
  );
}
