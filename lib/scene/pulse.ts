import * as THREE from "three";

/**
 * Lines that carry light. Each segment has an `aT` (0 → 1 along its length), a
 * `aSeed` that staggers pulses, and per-end colours `aCol`, so a link can
 * fade from the colour of its source to the colour of its target while a
 * bright pulse runs along it.
 */
export function pulseMaterial(opts: { base: number; speed: number; fog?: boolean; head?: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: opts.fog ?? true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uBase: { value: opts.base },
        uSpeed: { value: opts.speed },
        uHead: { value: opts.head ?? 1.0 },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aSeed;
      attribute vec3 aCol;
      varying float vT;
      varying float vSeed;
      varying vec3 vCol;
      #include <fog_pars_vertex>
      void main() {
        vT = aT;
        vSeed = aSeed;
        vCol = aCol;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBase;
      uniform float uSpeed;
      uniform float uHead;
      varying float vT;
      varying float vSeed;
      varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() {
        float head = fract(uTime * uSpeed * (0.6 + vSeed * 0.8) + vSeed * 7.0);
        float d = vT - head;
        float pulse = smoothstep(0.1, 0.0, abs(d)) * (d < 0.0 ? 1.0 : 0.55);
        vec3 c = vCol * (uBase + pulse * 1.6 * uHead) + vec3(1.0) * pulse * 0.5 * uHead;
        float a = uBase + pulse * 0.95;
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
  });
}

export type LinkBuilder = {
  positions: number[];
  t: number[];
  seed: number[];
  col: number[];
  add(a: THREE.Vector3, b: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, seed: number): void;
  geometry(): THREE.BufferGeometry;
};

export function linkBuilder(): LinkBuilder {
  const b: LinkBuilder = {
    positions: [],
    t: [],
    seed: [],
    col: [],
    add(a, c, ca, cb, seed) {
      b.positions.push(a.x, a.y, a.z, c.x, c.y, c.z);
      b.t.push(0, 1);
      b.seed.push(seed, seed);
      b.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.positions, 3));
      g.setAttribute("aT", new THREE.Float32BufferAttribute(b.t, 1));
      g.setAttribute("aSeed", new THREE.Float32BufferAttribute(b.seed, 1));
      g.setAttribute("aCol", new THREE.Float32BufferAttribute(b.col, 3));
      return g;
    },
  };
  return b;
}

let glowTex: THREE.CanvasTexture | null = null;
/** a soft round sprite, shared */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
