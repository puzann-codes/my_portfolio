import * as THREE from "three";

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Deterministic RNG so every visit builds the same city, network, etc. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(c: HTMLCanvasElement, anisotropy = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/** Cylinder whose axis runs from a to b (for lamp arms, bench legs…). */
export function cylBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  segments = 16
) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Reads a next/font CSS variable (e.g. "--font-unbounded") into a font-family. */
export function cssFontFamily(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

/** Soft text label drawn to a canvas, returned as a plane that always has
 * a transparent background. Width is in world units; height follows. */
export function textPlane(
  text: string,
  opts: {
    width: number;
    font?: string;
    color?: string;
    px?: number;
    weight?: number | string;
    letterSpacing?: number;
    align?: CanvasTextAlign;
  }
) {
  const px = opts.px ?? 96;
  const font = opts.font ?? MONO;
  const weight = opts.weight ?? 600;
  const c = makeCanvas(8, 8);
  let ctx = c.getContext("2d")!;
  ctx.font = `${weight} ${px}px ${font}`;
  const spacing = (opts.letterSpacing ?? 0) * px;
  const measure = ctx.measureText(text).width + spacing * text.length;
  const w = Math.ceil(measure + px * 0.6);
  const h = Math.ceil(px * 1.5);
  c.width = w;
  c.height = h;
  ctx = c.getContext("2d")!;
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = opts.color ?? "#f2f2ee";
  if (spacing) {
    let x = px * 0.3;
    for (const ch of text) {
      ctx.fillText(ch, x, h / 2);
      x += ctx.measureText(ch).width + spacing;
    }
  } else {
    ctx.fillText(text, px * 0.3, h / 2);
  }
  const tex = canvasTexture(c, 4);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, (opts.width * h) / w), mat);
  return mesh;
}

/** Disposes everything under an object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const x of list) {
      for (const key of Object.keys(x)) {
        const v = (x as unknown as Record<string, unknown>)[key];
        if (v instanceof THREE.Texture) v.dispose();
      }
      x.dispose();
    }
  });
}

/** Yields to the browser so the loader keeps animating while we build.
 * Raced against a timer so a hidden tab (where rAF never fires) can't
 * stall the build. */
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 40);
  });
