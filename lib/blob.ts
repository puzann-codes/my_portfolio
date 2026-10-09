export type BlobShape = number[];

export function randomBlobShape(points: number, minMul: number, maxMul: number): BlobShape {
  const shape: BlobShape = [];
  for (let i = 0; i < points; i++) {
    shape.push(minMul + Math.random() * (maxMul - minMul));
  }
  return shape;
}

/** Nudges an existing shape slightly (small random walk per vertex)
 * instead of fully re-randomizing — this is what makes consecutive ink
 * stamps flow into each other as one continuous, gradually-undulating
 * mass instead of a chain of visibly-distinct random blobs. */
export function evolveShape(
  shape: BlobShape,
  amount: number,
  min: number,
  max: number
): BlobShape {
  return shape.map((m) => Math.min(max, Math.max(min, m + (Math.random() - 0.5) * amount)));
}

/** Fills a soft irregular blob through points placed around a circle at
 * randomized (but caller-controlled) radii, connected with gentle
 * quadratic curves. Optional rotation + non-uniform stretch lets a blob
 * elongate along a direction of travel, like flowing liquid rather than
 * a static round drop. */
export function drawBlobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  shape: BlobShape,
  rotation = 0,
  stretchX = 1,
  stretchY = 1
) {
  const n = shape.length;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const pts = shape.map((m, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = radius * m;
    const lx = Math.cos(angle) * r * stretchX;
    const ly = Math.sin(angle) * r * stretchY;
    return {
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    };
  });

  const start = {
    x: (pts[n - 1].x + pts[0].x) / 2,
    y: (pts[n - 1].y + pts[0].y) / 2,
  };
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
    ctx.quadraticCurveTo(cur.x, cur.y, mid.x, mid.y);
  }
  ctx.closePath();
  ctx.fill();
}
