import * as THREE from "three";
import { clamp, smoothstep } from "./util";

/**
 * One sky, one set of lights, one fog for the whole machine. Each
 * environment owns a palette, and the atmosphere blends between neighbours
 * as the camera travels, so every project has its own time of day and mood
 * but the journey is still a single continuous shot.
 */

export type Palette = {
  top: number;
  mid: number;
  horizon: number;
  ground: number;
  fog: number;
  fogDensity: number;
  glow: number; // colour of the low sun / horizon glow
  glowPower: number; // 4 = broad, 60 = tight
  glowStrength: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number]; // direction the light comes FROM
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  stars: number;
  bloom: number;
};

export const PALETTES = {
  // Sunūwā: a dusk city, amber light raking across the facades
  city: {
    top: 0x15143a,
    mid: 0x4b2f6a,
    horizon: 0xf2956a,
    ground: 0x2a1d2e,
    fog: 0x4a2f48,
    fogDensity: 0.0042,
    glow: 0xffb070,
    glowPower: 7,
    glowStrength: 0.9,
    sun: 0xffb98a,
    sunIntensity: 2.4,
    sunDir: [-0.55, 0.28, 0.6],
    hemiSky: 0x7a64aa,
    hemiGround: 0x3b2630,
    hemiIntensity: 0.75,
    stars: 0.18,
    bloom: 0.75,
  },
  // Crash Capsule: blue hour, wet asphalt, sodium lamps
  crash: {
    top: 0x050c18,
    mid: 0x0e2538,
    horizon: 0x2a6a86,
    ground: 0x0a1118,
    fog: 0x0e2232,
    fogDensity: 0.0075,
    glow: 0x4aa0c0,
    glowPower: 5,
    glowStrength: 0.45,
    sun: 0xb4ccff,
    sunIntensity: 1.1,
    sunDir: [-0.4, 0.8, 0.45],
    hemiSky: 0x3c7090,
    hemiGround: 0x0a0f14,
    hemiIntensity: 0.7,
    stars: 0.55,
    bloom: 0.9,
  },
  // Harvo: golden hour over fields
  harvo: {
    top: 0x1d2547,
    mid: 0x6a5a86,
    horizon: 0xf7c070,
    ground: 0x2a2616,
    fog: 0x7a6552,
    fogDensity: 0.0048,
    glow: 0xffcf80,
    glowPower: 6,
    glowStrength: 0.45,
    sun: 0xffd8a0,
    sunIntensity: 2.2,
    sunDir: [0.6, 0.3, -0.7],
    hemiSky: 0xa89cc8,
    hemiGround: 0x3a2f1a,
    hemiIntensity: 0.85,
    stars: 0.1,
    bloom: 0.5,
  },
  // LearnScape: a measured, cool studio
  learnscape: {
    top: 0x04101a,
    mid: 0x0b2b3a,
    horizon: 0x1b6a78,
    ground: 0x050d12,
    fog: 0x07202a,
    fogDensity: 0.0055,
    glow: 0x58e0d0,
    glowPower: 7,
    glowStrength: 0.35,
    sun: 0xdff6ff,
    sunIntensity: 1.0,
    sunDir: [0.3, 0.8, 0.4],
    hemiSky: 0x4fa8b8,
    hemiGround: 0x061018,
    hemiIntensity: 0.65,
    stars: 0.4,
    bloom: 0.9,
  },
  // Mul: a misty hillside at first light
  mul: {
    top: 0x1a2f45,
    mid: 0x3d6b82,
    horizon: 0x9fc2bf,
    ground: 0x1d2c24,
    fog: 0x7f9d9c,
    fogDensity: 0.0042,
    glow: 0xfff0cf,
    glowPower: 5,
    glowStrength: 0.22,
    sun: 0xfff1d6,
    sunIntensity: 1.7,
    sunDir: [0.4, 0.42, 0.5],
    hemiSky: 0xbfd8e0,
    hemiGround: 0x2a3a2c,
    hemiIntensity: 0.9,
    stars: 0.05,
    bloom: 0.3,
  },
  terminal: {
    top: 0x050710,
    mid: 0x0a1020,
    horizon: 0x172a40,
    ground: 0x070a10,
    fog: 0x0a1220,
    fogDensity: 0.006,
    glow: 0x5ea8ff,
    glowPower: 6,
    glowStrength: 0.25,
    sun: 0xcfe0ff,
    sunIntensity: 0.7,
    sunDir: [0.3, 0.8, 0.5],
    hemiSky: 0x4a6a9a,
    hemiGround: 0x070a10,
    hemiIntensity: 0.45,
    stars: 0.35,
    bloom: 0.65,
  },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w; // always at the far plane
  }`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uGlow;
  uniform float uGlowPow;
  uniform float uGlowStr;
  uniform vec3 uGlowDir;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizon, uMid, smoothstep(0.0, 0.34, h))
      : mix(uHorizon, uGround, smoothstep(0.0, -0.3, h));
    col = mix(col, uTop, smoothstep(0.32, 0.95, h));
    col += uHorizon * 0.22 * exp(-abs(h) * 9.0);

    float g = max(dot(d, normalize(uGlowDir)), 0.0);
    col += uGlow * (pow(g, uGlowPow) * uGlowStr + pow(g, 2.0) * uGlowStr * 0.18);

    // stars: sparse, only well above the horizon
    vec3 q = floor(d * 260.0);
    float s = hash(q);
    float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + s * 60.0);
    float star = step(0.9965, s) * twinkle * smoothstep(0.04, 0.35, h) * uStars;
    col += vec3(0.85, 0.9, 1.0) * star * 1.4;

    gl_FragColor = vec4(col, 1.0);
  }`;

const _c = new THREE.Color();

export class Atmosphere {
  readonly sky: THREE.Mesh;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fog: THREE.FogExp2;
  bloom = 0.8;
  private mat: THREE.ShaderMaterial;
  private names: PaletteName[];
  private zs: number[];

  constructor(scene: THREE.Scene, stages: { name: PaletteName; z: number }[]) {
    this.names = stages.map((s) => s.name);
    this.zs = stages.map((s) => s.z);
    const p0 = PALETTES[this.names[0]];

    this.fog = new THREE.FogExp2(p0.fog, p0.fogDensity);
    scene.fog = this.fog;
    scene.background = new THREE.Color(p0.fog);

    this.hemi = new THREE.HemisphereLight(p0.hemiSky, p0.hemiGround, p0.hemiIntensity);
    this.sun = new THREE.DirectionalLight(p0.sun, p0.sunIntensity);
    scene.add(this.hemi, this.sun, this.sun.target);

    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(p0.top) },
        uMid: { value: new THREE.Color(p0.mid) },
        uHorizon: { value: new THREE.Color(p0.horizon) },
        uGround: { value: new THREE.Color(p0.ground) },
        uGlow: { value: new THREE.Color(p0.glow) },
        uGlowPow: { value: p0.glowPower },
        uGlowStr: { value: p0.glowStrength },
        uGlowDir: { value: new THREE.Vector3(0, 0.08, -1) },
        uStars: { value: p0.stars },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
  }

  /** blend palettes by where the camera is along the corridor */
  update(cam: THREE.Vector3, t: number) {
    const zs = this.zs;
    let a = 0;
    while (a < zs.length - 2 && cam.z < zs[a + 1]) a++;
    const b = Math.min(a + 1, zs.length - 1);
    let f = zs[a] === zs[b] ? 0 : clamp((zs[a] - cam.z) / (zs[a] - zs[b]));
    f = smoothstep(0.3, 0.7, f);
    const A = PALETTES[this.names[a]];
    const B = PALETTES[this.names[b]];
    const u = this.mat.uniforms;
    const mixC = (target: THREE.Color, ha: number, hb: number) => target.copy(_c.set(ha)).lerp(new THREE.Color(hb), f);
    mixC(u.uTop.value, A.top, B.top);
    mixC(u.uMid.value, A.mid, B.mid);
    mixC(u.uHorizon.value, A.horizon, B.horizon);
    mixC(u.uGround.value, A.ground, B.ground);
    mixC(u.uGlow.value, A.glow, B.glow);
    u.uGlowPow.value = A.glowPower + (B.glowPower - A.glowPower) * f;
    u.uGlowStr.value = A.glowStrength + (B.glowStrength - A.glowStrength) * f;
    u.uStars.value = A.stars + (B.stars - A.stars) * f;
    u.uTime.value = t;

    mixC(this.fog.color, A.fog, B.fog);
    (this.sky.parent as THREE.Scene).background = this.fog.color;
    this.fog.density = A.fogDensity + (B.fogDensity - A.fogDensity) * f;

    mixC(this.sun.color, A.sun, B.sun);
    this.sun.intensity = A.sunIntensity + (B.sunIntensity - A.sunIntensity) * f;
    const dir = new THREE.Vector3(...A.sunDir).lerp(new THREE.Vector3(...B.sunDir), f).normalize();
    this.sun.position.copy(cam).addScaledVector(dir, 120);
    this.sun.target.position.copy(cam);
    mixC(this.hemi.color, A.hemiSky, B.hemiSky);
    mixC(this.hemi.groundColor, A.hemiGround, B.hemiGround);
    this.hemi.intensity = A.hemiIntensity + (B.hemiIntensity - A.hemiIntensity) * f;
    this.bloom = A.bloom + (B.bloom - A.bloom) * f;

    this.sky.position.copy(cam);
  }

  dispose() {
    this.sky.geometry.dispose();
    this.mat.dispose();
  }
}
