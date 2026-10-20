import * as THREE from "three";
import { clamp, rng } from "./util";
import type { Kit } from "./props";
import type { LeafLibrary } from "./leafLibrary";

/* ============================== textures ============================== */

export type LeafTex = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
let heartTex: LeafTex | null = null;

function leafCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c: HTMLCanvasElement, srgb: boolean, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** soft round blotches: the mottling of a real leaf */
function blotches(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  colors: string[],
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  seed: number
) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = R() * w;
    const y = R() * h;
    const r = r0 + R() * (r1 - r0);
    const col = colors[Math.floor(R() * colors.length)];
    const a = a0 + R() * (a1 - a0);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col.replace("A", String(a)));
    g.addColorStop(1, col.replace("A", "0"));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + R() * 0.6), R() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a pothos leaf: soft heart with a pointed tip, cream variegation, veins */
export function heartTexture(): LeafTex {
  if (heartTex) return heartTex;
  const W = 288;
  const H = 336;
  const c = leafCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const bc = leafCanvas(W, H);
  const bx = bc.getContext("2d")!;
  const path = (g: CanvasRenderingContext2D) => {
    g.save();
    g.translate(0, H);
    g.scale(1, -1);
    g.scale(W / 192, H / 224);
    g.beginPath();
    g.moveTo(96, 214);
    g.bezierCurveTo(8, 172, -12, 66, 48, 58);
    g.bezierCurveTo(70, 54, 90, 70, 96, 92);
    g.bezierCurveTo(102, 70, 122, 54, 144, 58);
    g.bezierCurveTo(204, 66, 184, 172, 96, 214);
    g.closePath();
    g.restore();
  };
  const g = ctx.createLinearGradient(0, H, W, 0);
  g.addColorStop(0, "#245a30");
  g.addColorStop(1, "#4f9a55");
  ctx.fillStyle = g;
  path(ctx);
  ctx.fill();
  ctx.globalCompositeOperation = "source-atop";
  blotches(ctx, W, H, 26, ["rgba(236,226,132,A)", "rgba(196,214,110,A)"], 10, 38, 0.18, 0.4, 21);
  blotches(ctx, W, H, 30, ["rgba(18,60,30,A)", "rgba(70,130,70,A)"], 10, 36, 0.1, 0.22, 8);
  // veins
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(226,240,190,0.62)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, H - 14);
  ctx.lineTo(W / 2, 20);
  ctx.stroke();
  bx.fillStyle = "#8a8a8a";
  bx.fillRect(0, 0, W, H);
  bx.strokeStyle = "#4a4a4a";
  bx.lineWidth = 4;
  bx.beginPath();
  bx.moveTo(W / 2, H - 14);
  bx.lineTo(W / 2, 20);
  bx.stroke();
  for (let k = 0; k < 6; k++) {
    const y = H - 40 - k * 44;
    for (const s of [-1, 1]) {
      ctx.strokeStyle = "rgba(226,240,190,0.4)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(W / 2, y + 10);
      ctx.quadraticCurveTo(W / 2 + s * 40, y - 6, W / 2 + s * 82, y - 30);
      ctx.stroke();
      bx.strokeStyle = "#6a6a6a";
      bx.lineWidth = 3;
      bx.beginPath();
      bx.moveTo(W / 2, y + 10);
      bx.quadraticCurveTo(W / 2 + s * 40, y - 6, W / 2 + s * 82, y - 30);
      bx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(10,40,20,0.35)";
  ctx.lineWidth = 4;
  path(ctx);
  ctx.stroke();
  heartTex = { map: toTex(c, true, 4), bump: toTex(bc, false, 4) };
  return heartTex;
}

function potGeometry(r: number, h: number) {
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.66, 0],
    [r * 0.72, h * 0.012],
    [r * 0.74, h * 0.04],
    [r * 0.9, h * 0.5],
    [r * 0.99, h * 0.86],
    [r * 1.02, h * 0.95],
    [r * 1.0, h * 0.995],
    [r * 0.96, h],
    [r * 0.93, h * 0.99],
    [r * 0.88, h * 0.94],
  ];
  return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 72);
}

let speckle: THREE.CanvasTexture | null = null;
/** a fine glaze speckle and a faint throwing-ring, for the ceramic pots */
function speckleTexture() {
  if (speckle) return speckle;
  const c = leafCanvas(256, 256);
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, 256, 256);
  const R = rng(31);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${R() > 0.5 ? "70,66,60" : "150,140,126"},${0.1 + R() * 0.25})`;
    x.fillRect(R() * 256, R() * 256, 1 + R() * 1.4, 1 + R() * 1.4);
  }
  for (let y = 0; y < 256; y += 9 + R() * 6) {
    x.fillStyle = `rgba(0,0,0,${0.015 + R() * 0.02})`;
    x.fillRect(0, y, 256, 2);
  }
  speckle = new THREE.CanvasTexture(c);
  speckle.colorSpace = THREE.SRGBColorSpace;
  speckle.wrapS = speckle.wrapT = THREE.RepeatWrapping;
  speckle.anisotropy = 4;
  return speckle;
}


export function potAndSoil(kit: Kit, g: THREE.Group, r: number, h: number, color: number, rough = 0.6) {
  const m = kit.mesh(
    potGeometry(r, h),
    kit.track(
      new THREE.MeshPhysicalMaterial({
        color,
        map: speckleTexture(),
        roughness: rough,
        metalness: 0,
        clearcoat: 0.35,
        clearcoatRoughness: 0.42,
        side: THREE.DoubleSide,
      })
    )
  );
  g.add(m);
  // a shallow saucer under it
  const saucer = kit.mesh(
    new THREE.CylinderGeometry(r * 0.9, r * 0.8, h * 0.07, 48),
    kit.track(new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.3, clearcoatRoughness: 0.45 })),
    false,
    true
  );
  saucer.position.y = h * 0.035 - h * 0.07;
  saucer.visible = false; // the pots sit on the desk directly; kept for the larger planters
  g.add(saucer);
  const soil = kit.mesh(
    new THREE.CylinderGeometry(r * 0.88, r * 0.86, h * 0.06, 40),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 })),
    false,
    true
  );
  soil.position.y = h * 0.9;
  g.add(soil);
  const pebble = kit.track(new THREE.IcosahedronGeometry(1, 0));
  const R = rng(12);
  const pmats = [0xa8a49a, 0x8d8a82, 0xc2beb2].map((cc) =>
    kit.track(new THREE.MeshStandardMaterial({ color: cc, roughness: 0.95 }))
  );
  for (let i = 0; i < 30; i++) {
    const a = R() * Math.PI * 2;
    const rr = Math.sqrt(R()) * r * 0.78;
    const p = new THREE.Mesh(pebble, pmats[i % 3]);
    p.scale.set(0.0035 + R() * 0.0055, 0.0022 + R() * 0.0015, 0.0035 + R() * 0.0055);
    p.position.set(Math.cos(a) * rr, h * 0.925 + 0.001, Math.sin(a) * rr);
    p.rotation.set(R() * 2, R() * 3, R());
    g.add(p);
  }
}


/* ================================================================== */
/*  Articulated foliage                                                */
/*                                                                     */
/*  A plant here is a set of jointed stems and blades that exist in a  */
/*  simulation, not a mesh that is nudged. Every stem is a chain of    */
/*  segments joined by damped springs; every blade hangs on its own    */
/*  joint and also flexes along its length; the pointer is a real      */
/*  finger that is hit-tested against the blades and presses, drags    */
/*  and strokes whatever it is over. Leaves lag, overshoot and settle; */
/*  a stroked leaf pulls its petiole, and the petiole its neighbours.  */
/* ================================================================== */

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

export type Plant = {
  group: THREE.Group;
  /** call once the group's transform is final (and again if it changes) */
  refresh(): void;
  /**
   * The pointer, in world space: a ray (or null when nothing is over the
   * plants) and the pointer's world velocity in m/s. Call every frame.
   */
  touch(ray: { origin: THREE.Vector3; dir: THREE.Vector3 } | null, velocity: THREE.Vector3): void;
  update(t: number, dt: number): void;
  /** whether the finger is on a leaf right now, and 0..1 how hard it is moving over foliage */
  state(): { touching: boolean; rustle: number };
};

type ChainOpts = {
  points: THREE.Vector3[];
  radius: (i: number, n: number) => number;
  color: (i: number, n: number) => THREE.Color;
  /** bending stiffness of the first joint, 1/s² */
  k: number;
  /** how much of that stiffness is lost by the last joint (0..1) */
  taper?: number;
  zeta?: number;
  /** ambient motion strength */
  wind?: number;
  hidden?: boolean;
};

class Chain {
  readonly n: number;
  readonly restDir: THREE.Vector3[] = [];
  readonly len: number[] = [];
  readonly radius: number[] = [];
  readonly color: THREE.Color[] = [];
  readonly ax: number[];
  readonly az: number[];
  readonly vx: number[];
  readonly vz: number[];
  readonly accX: number[];
  readonly accZ: number[];
  readonly k: number[];
  readonly c: number[];
  readonly fx: number[];
  readonly fz: number[];
  readonly pts: THREE.Vector3[];
  readonly cum: THREE.Quaternion[];
  readonly wind: number;
  readonly hidden: boolean;
  readonly phase: number;
  segStart = 0;

  constructor(readonly rest: THREE.Vector3[], o: ChainOpts, phase: number) {
    this.n = rest.length - 1;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3().subVectors(rest[i + 1], rest[i]);
      this.len.push(d.length());
      this.restDir.push(d.normalize());
      this.radius.push(o.radius(i, n));
      this.color.push(o.color(i, n));
    }
    const z = o.zeta ?? 0.18;
    this.k = Array.from({ length: n }, (_, i) => o.k * (1 - (o.taper ?? 0.5) * (n > 1 ? i / (n - 1) : 0)));
    this.c = this.k.map((k) => 2 * z * Math.sqrt(k));
    const zeros = () => new Array<number>(n).fill(0);
    this.ax = zeros();
    this.az = zeros();
    this.vx = zeros();
    this.vz = zeros();
    this.accX = zeros();
    this.accZ = zeros();
    this.fx = zeros();
    this.fz = zeros();
    this.pts = rest.map((p) => p.clone());
    this.cum = Array.from({ length: n }, () => new THREE.Quaternion());
    this.wind = o.wind ?? 1;
    this.hidden = !!o.hidden;
    this.phase = phase;
  }

  fk() {
    const q = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const qx = new THREE.Quaternion();
    const qz = new THREE.Quaternion();
    this.pts[0].copy(this.rest[0]);
    for (let i = 0; i < this.n; i++) {
      qx.setFromAxisAngle(AX, this.ax[i]);
      qz.setFromAxisAngle(AZ, this.az[i]);
      qb.multiplyQuaternions(qz, qx);
      q.premultiply(qb);
      this.cum[i].copy(q);
      this.pts[i + 1].copy(this.restDir[i]).applyQuaternion(q).multiplyScalar(this.len[i]).add(this.pts[i]);
    }
  }
}

type LeafOpts = {
  chain: Chain;
  /** attach at this node of the chain (0 = base … n = tip) */
  node: number;
  /** blade's forward direction (along its length) and an up hint, in plant space at rest */
  fwd: THREE.Vector3;
  upHint?: THREE.Vector3;
  /** a short stalk from the node to the blade's base, in plant space at rest */
  offset?: THREE.Vector3;
  w: number;
  l: number;
  /** droop (rad at the tip), fold, ruffle, twist */
  shape: [number, number, number, number];
  tint: THREE.Color;
  /** stiffness of the blade's own joint and of its flex along its length */
  jointK?: number;
  flexK?: number;
  flutter?: number;
  /** which scanned leaf shape (when the plant has a leaf library) */
  variant?: number;
};

class Leaf {
  /** which instanced mesh and slot this leaf occupies */
  mesh = 0;
  slot = 0;
  pitch = 0;
  roll = 0;
  vp = 0;
  vr = 0;
  flex = 0;
  vf = 0;
  twist = 0;
  vt = 0;
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly tip = new THREE.Vector3();
  readonly prevTip = new THREE.Vector3();
  readonly prevVTipN = { v: 0 };
  readonly restQuat = new THREE.Quaternion();
  readonly offset = new THREE.Vector3();
  readonly mid = new THREE.Vector3();
  readonly normal = new THREE.Vector3();
  readonly jointK: number;
  readonly flexK: number;
  readonly jointC: number;
  readonly flexC: number;
  readonly flutter: number;
  readonly phase: number;
  constructor(readonly idx: number, readonly o: LeafOpts, phase: number) {
    this.jointK = o.jointK ?? 140;
    this.flexK = o.flexK ?? 90;
    this.jointC = 2 * 0.16 * Math.sqrt(this.jointK);
    this.flexC = 2 * 0.2 * Math.sqrt(this.flexK);
    this.flutter = o.flutter ?? 0.03;
    this.phase = phase;
    const up = o.upHint ?? AY;
    const right = new THREE.Vector3().crossVectors(o.fwd, up);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const f = o.fwd.clone().normalize();
    const nrm = new THREE.Vector3().crossVectors(right, f).normalize();
    this.restQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f, nrm));
    if (o.offset) this.offset.copy(o.offset);
  }
}

/* ---- GLSL: a blade as a function of (x, v) and its two parameter vectors ---- */

const GLSL_BLADE = /* glsl */ `
attribute vec4 aShape;
attribute vec4 aDyn;
attribute float aAr;
uniform float uTime;
vec3 bladePos(vec2 p, vec4 S, vec4 D, float ar) {
  float v = p.y;
  float x = p.x;
  float ang = (S.x + D.x) * v * v;
  float crease = abs(x) * S.y * sin(3.14159 * min(1.0, v * 1.1));
  float wave = S.z * pow(abs(x) * 2.0, 2.0) * sin(v * 11.0 + x * 5.0 + D.w) * sin(3.14159 * v);
  float flut = D.z * sin(uTime * 4.2 + v * 6.0 + D.w) * v * v;
  float tw = (S.w + D.y) * v;
  vec3 q = vec3(x, cos(ang) * v, -sin(ang) * v + crease + wave + flut);
  float c = cos(tw);
  float s = sin(tw);
  // twist about the blade's length axis, done in real proportions (x is in widths, z in lengths)
  float xr = q.x * ar;
  return vec3((c * xr - s * q.z) / ar, q.y, s * xr + c * q.z);
}
`;

type Uni = {
  uTime: { value: number };
  uTouch: { value: THREE.Vector4 };
  uTouchDir: { value: THREE.Vector3 };
  uTouchInst: { value: number };
  uTouchR: { value: number };
};

function patchLeaf(mat: THREE.MeshStandardMaterial, uni: Uni) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         ${GLSL_BLADE}
         uniform vec4 uTouch;
         uniform vec3 uTouchDir;
         uniform float uTouchInst;
         uniform float uTouchR;`
      )
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 bladeP = bladePos(position.xy, aShape, aDyn, aAr);
         vec3 bladePu = bladePos(position.xy + vec2(0.012, 0.0), aShape, aDyn, aAr);
         vec3 bladePv = bladePos(position.xy + vec2(0.0, 0.012), aShape, aDyn, aAr);
         vec3 objectNormal = normalize(cross(bladePu - bladeP, bladePv - bladeP));
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3( tangent.xyz );
         #endif`
      )
      .replace("#include <begin_vertex>", "vec3 transformed = bladeP;")
      .replace(
        "#include <project_vertex>",
        `vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         if (uTouch.w > 0.001 && float(gl_InstanceID) == uTouchInst) {
           float dd = distance(worldPos.xyz, uTouch.xyz);
           worldPos.xyz += uTouchDir * uTouch.w * exp(-(dd * dd) / (uTouchR * uTouchR));
         }
         vec4 mvPosition = viewMatrix * worldPos;
         gl_Position = projectionMatrix * mvPosition;`
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       if (!gl_FrontFacing) {
         diffuseColor.rgb = diffuseColor.rgb * vec3(1.16, 1.22, 0.84) + vec3(0.03, 0.045, 0.008);
       }`
    );
  };
  mat.customProgramCacheKey = () => "foliage-leaf";
}

/** the same bend and dent, for scanned leaves normalised to length 1 along +y */
function patchScanned(mat: THREE.MeshStandardMaterial, uni: Uni) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec4 aDyn;
         uniform float uTime;
         uniform vec4 uTouch;
         uniform vec3 uTouchDir;
         uniform float uTouchInst;
         uniform float uTouchR;`
      )
      .replace(
        "#include <beginnormal_vertex>",
        `float bv = clamp(position.y, 0.0, 1.0);
         float bAng = aDyn.x * bv * bv;
         float bc = cos(bAng);
         float bs = sin(bAng);
         vec3 objectNormal = vec3(normal.x, normal.y * bc + normal.z * bs, -normal.y * bs + normal.z * bc);
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3( tangent.xyz );
         #endif`
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position.x, position.y * bc + position.z * bs, -position.y * bs + position.z * bc);
         transformed.z += sin(uTime * 4.2 + bv * 6.0 + aDyn.w) * aDyn.z * bv * bv;
         {
           float tw = aDyn.y * bv * 0.6;
           float tc = cos(tw);
           float ts = sin(tw);
           transformed.xz = vec2(tc * transformed.x - ts * transformed.z, ts * transformed.x + tc * transformed.z);
         }`
      )
      .replace(
        "#include <project_vertex>",
        `vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         if (uTouch.w > 0.001 && float(gl_InstanceID) == uTouchInst) {
           float dd = distance(worldPos.xyz, uTouch.xyz);
           worldPos.xyz += uTouchDir * uTouch.w * exp(-(dd * dd) / (uTouchR * uTouchR));
         }
         vec4 mvPosition = viewMatrix * worldPos;
         gl_Position = projectionMatrix * mvPosition;`
      );
  };
  mat.customProgramCacheKey = () => "foliage-scanned";
}

function patchScannedDepth(mat: THREE.MeshDepthMaterial, uni: Uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aDyn;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `float bv = clamp(position.y, 0.0, 1.0);
         float bAng = aDyn.x * bv * bv;
         vec3 transformed = vec3(position.x, position.y * cos(bAng) + position.z * sin(bAng), -position.y * sin(bAng) + position.z * cos(bAng));`
      );
  };
  mat.customProgramCacheKey = () => "foliage-scanned-depth";
}

function patchDepth(mat: THREE.MeshDepthMaterial, uni: Uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${GLSL_BLADE}`)
      .replace("#include <begin_vertex>", "vec3 transformed = bladePos(position.xy, aShape, aDyn, aAr);");
  };
  mat.customProgramCacheKey = () => "foliage-depth";
}

/* ---- CPU copy of the blade centreline, for hit-testing ---- */

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Möller–Trumbore, two-sided. Returns t or -1. */
function rayTri(o: THREE.Vector3, d: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  _e1.subVectors(b, a);
  _e2.subVectors(c, a);
  _p.crossVectors(d, _e2);
  const det = _e1.dot(_p);
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  _q.subVectors(o, a);
  const u = _q.dot(_p) * inv;
  if (u < 0 || u > 1) return -1;
  _r.crossVectors(_q, _e1);
  const v = d.dot(_r) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = _e2.dot(_r) * inv;
  return t > 0 ? t : -1;
}

const K_STRIPS = 6;

/* ---- the plant ---- */

type FoliageOpts = {
  tex?: LeafTex;
  /** photo-scanned leaf shapes: when given, blades are these meshes, not the flat grid */
  scanned?: LeafLibrary;
  maxLeaves: number;
  grid: [number, number];
  /** half-width of the blade at v, in units of its width (0..0.5), for hit-testing and taper */
  halfWidth: (v: number) => number;
  /** bake the width profile into the mesh (a snake-plant blade) instead of using an alpha cut-out */
  bakeTaper?: boolean;
  rough: number;
  bump: number;
  opaque?: boolean;
};

class Foliage {
  readonly group = new THREE.Group();
  readonly chains: Chain[] = [];
  readonly leaves: Leaf[] = [];
  readonly uni: Uni = {
    uTime: { value: 0 },
    uTouch: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTouchDir: { value: new THREE.Vector3(0, 0, -1) },
    uTouchInst: { value: -1 },
    uTouchR: { value: 0.03 },
  };
  private meshes: THREE.InstancedMesh[] = [];
  private dyns: THREE.InstancedBufferAttribute[] = [];
  private meshUni: Uni[] = [];
  private stemMesh!: THREE.InstancedMesh;
  private jointMesh!: THREE.InstancedMesh;
  private built = false;
  private readonly inv = new THREE.Matrix4();
  private readonly invQ = new THREE.Quaternion();
  private scale = 1;
  // pointer, in plant space
  private ray: { o: THREE.Vector3; d: THREE.Vector3 } | null = null;
  private vel = new THREE.Vector3();
  private lastLeaf = -1;
  private touchStrength = 0;
  private rustleAmt = 0;
  touching = false;
  private readonly R: () => number;

  constructor(private kit: Kit, private o: FoliageOpts, seed: number) {
    this.R = rng(seed * 7 + 3);
  }

  rand() {
    return this.R();
  }

  addChain(points: THREE.Vector3[], o: ChainOpts) {
    const c = new Chain(points, o, this.R() * 20);
    this.chains.push(c);
    return c;
  }

  addLeaf(o: LeafOpts) {
    const l = new Leaf(this.leaves.length, o, this.R() * 20);
    this.leaves.push(l);
    return l;
  }

  /** after all chains and leaves have been added */
  build() {
    const { o } = this;
    if (o.scanned) this.buildScannedLeaves(o.scanned);
    else this.buildGridLeaves();
    this.buildStems();
    this.built = true;
    this.pose();
  }

  private buildScannedLeaves(lib: LeafLibrary) {
    const { kit, o } = this;
    void o;
    const byVariant = new Map<number, Leaf[]>();
    for (const l of this.leaves) {
      const v = ((l.o.variant ?? 0) % lib.variants.length + lib.variants.length) % lib.variants.length;
      const list = byVariant.get(v) ?? [];
      list.push(l);
      byVariant.set(v, list);
    }
    const base = kit.track(
      new THREE.MeshStandardMaterial({
        color: 0x9db89a,
        map: lib.map,
        normalMap: lib.normal,
        roughnessMap: lib.rough,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.9,
      })
    );
    for (const [v, list] of byVariant) {
      const geo = lib.variants[v].geo.clone();
      kit.track(geo);
      const dyn = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
      dyn.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aDyn", dyn);
      const uni: Uni = { ...this.uni, uTouchInst: { value: -1 } };
      const mat = kit.track(base.clone());
      patchScanned(mat, uni);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const depth = kit.track(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
      patchScannedDepth(depth, uni);
      mesh.customDepthMaterial = depth;
      const mi = this.meshes.length;
      list.forEach((l, i) => {
        l.mesh = mi;
        l.slot = i;
        mesh.setColorAt(i, l.o.tint);
      });
      this.meshes.push(mesh);
      this.dyns.push(dyn);
      this.meshUni.push(uni);
      this.group.add(mesh);
    }
  }

  private buildGridLeaves() {
    const { kit } = this;
    const o = this.o as FoliageOpts & { tex: LeafTex };
    // blade geometry: x −0.5…0.5 (tapered if baked), y 0…1; UV is the unwarped (x+0.5, y)
    const geo = new THREE.PlaneGeometry(1, 1, o.grid[0], o.grid[1]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = pos.getY(i) + 0.5;
      const x = pos.getX(i);
      pos.setXYZ(i, o.bakeTaper ? x * 2 * o.halfWidth(v) : x, v, 0);
      uv.setXY(i, x + 0.5, v);
    }
    kit.track(geo);

    const n = Math.max(1, this.leaves.length);
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const dyn = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    dyn.setUsage(THREE.DynamicDrawUsage);
    const ar = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute("aAr", ar);
    geo.setAttribute("aShape", shape);
    geo.setAttribute("aDyn", dyn);

    const mat = kit.track(
      new THREE.MeshPhysicalMaterial({
        map: o.tex.map,
        bumpMap: o.tex.bump,
        bumpScale: o.bump,
        alphaTest: o.opaque ? 0 : 0.42,
        alphaToCoverage: !o.opaque,
        side: THREE.DoubleSide,
        roughness: o.rough,
        metalness: 0,
        clearcoat: 0.28,
        clearcoatRoughness: 0.38,
        sheen: 0.35,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0x9fc48a),
        // thin leaves glow a little where the light passes through them
        emissive: new THREE.Color(0x24401c),
        emissiveMap: o.tex.map,
        emissiveIntensity: 0.07,
      })
    );
    patchLeaf(mat, this.uni);
    const leafMesh = new THREE.InstancedMesh(geo, mat, n);
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    leafMesh.frustumCulled = false;
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    const depth = kit.track(
      new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.opaque ? null : o.tex.map, alphaTest: o.opaque ? 0 : 0.42 })
    );
    patchDepth(depth, this.uni);
    leafMesh.customDepthMaterial = depth;
    this.leaves.forEach((l, i) => {
      // fold and ruffle are given in widths; the blade is scaled by its length in z
      const r = l.o.w / l.o.l;
      shape.setXYZW(i, l.o.shape[0], l.o.shape[1] * r, l.o.shape[2] * r, l.o.shape[3]);
      ar.setX(i, r);
      leafMesh.setColorAt(i, l.o.tint);
      l.mesh = 0;
      l.slot = i;
    });
    this.group.add(leafMesh);
    this.meshes.push(leafMesh);
    this.dyns.push(dyn);
    this.meshUni.push(this.uni);
  }

  private buildStems() {
    const { kit } = this;
    // stems: constant-radius segments joined by spheres
    let segs = 0;
    for (const c of this.chains) {
      c.segStart = segs;
      if (!c.hidden) segs += c.n;
    }
    const sm = kit.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58 }));
    const cyl = kit.track(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
    cyl.translate(0, 0.5, 0);
    this.stemMesh = new THREE.InstancedMesh(cyl, sm, Math.max(1, segs));
    this.stemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stemMesh.frustumCulled = false;
    this.stemMesh.castShadow = true;
    this.stemMesh.receiveShadow = true;
    this.stemMesh.count = segs;
    const ball = kit.track(new THREE.SphereGeometry(1, 8, 6));
    this.jointMesh = new THREE.InstancedMesh(ball, sm, Math.max(1, segs));
    this.jointMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.jointMesh.frustumCulled = false;
    this.jointMesh.castShadow = true;
    this.jointMesh.count = segs;
    for (const c of this.chains) {
      if (c.hidden) continue;
      for (let i = 0; i < c.n; i++) {
        this.stemMesh.setColorAt(c.segStart + i, c.color[i]);
        this.jointMesh.setColorAt(c.segStart + i, c.color[i]);
      }
    }
    this.group.add(this.stemMesh, this.jointMesh);
  }

  refresh() {
    this.group.updateMatrixWorld(true);
    this.inv.copy(this.group.matrixWorld).invert();
    this.group.getWorldQuaternion(this.invQ).invert();
    this.scale = this.group.getWorldScale(_s).x;
  }

  touch(ray: { origin: THREE.Vector3; dir: THREE.Vector3 } | null, velocity: THREE.Vector3) {
    if (!ray) {
      this.ray = null;
      return;
    }
    const o = ray.origin.clone().applyMatrix4(this.inv);
    const d = ray.dir.clone().transformDirection(this.inv).normalize();
    this.ray = { o, d };
    this.vel.copy(velocity).applyQuaternion(this.invQ).divideScalar(this.scale);
  }

  /** place every leaf from the chains' current FK state */
  private pose() {
    const m = new THREE.Matrix4();
    const sc = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const qp = new THREE.Quaternion();
    const qr = new THREE.Quaternion();
    for (const c of this.chains) c.fk();
    for (const l of this.leaves) {
      const c = l.o.chain;
      const node = l.o.node;
      const frame = node > 0 ? c.cum[node - 1] : _qi.identity();
      l.pos.copy(c.pts[node]).add(_a.copy(l.offset).applyQuaternion(frame));
      qp.setFromAxisAngle(AX, l.pitch);
      qr.setFromAxisAngle(AY, l.roll);
      q.copy(frame).multiply(l.restQuat).multiply(qp).multiply(qr);
      l.quat.copy(q);
      if (this.o.scanned) sc.set(l.o.l, l.o.l, l.o.l);
      else sc.set(l.o.w, l.o.l, l.o.l);
      m.compose(l.pos, l.quat, sc);
      this.meshes[l.mesh].setMatrixAt(l.slot, m);
      // geometric helpers
      const ang = (l.o.shape[0] + l.flex) * 1.0;
      l.tip.set(0, Math.cos(ang), -Math.sin(ang)).multiplyScalar(l.o.l).applyQuaternion(l.quat).add(l.pos);
      l.mid.set(0, 0.5, 0).multiplyScalar(l.o.l).applyQuaternion(l.quat).add(l.pos);
      l.normal.copy(AZ).applyQuaternion(l.quat);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;

    // stems
    const up = AY;
    for (const c of this.chains) {
      if (c.hidden) continue;
      for (let i = 0; i < c.n; i++) {
        const dir = _b.subVectors(c.pts[i + 1], c.pts[i]);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.divideScalar(len || 1));
        sc.set(c.radius[i], len, c.radius[i]);
        m.compose(c.pts[i], q, sc);
        this.stemMesh.setMatrixAt(c.segStart + i, m);
        const r = Math.max(c.radius[i], c.radius[Math.min(c.n - 1, i + 1)]);
        m.makeScale(r, r, r).setPosition(c.pts[i + 1]);
        this.jointMesh.setMatrixAt(c.segStart + i, m);
      }
    }
    this.stemMesh.instanceMatrix.needsUpdate = true;
    this.jointMesh.instanceMatrix.needsUpdate = true;
  }

  /** nearest blade under the pointer: leaf index, ray parameter, point in plant space, v along the blade */
  private pick() {
    if (!this.ray) return null;
    const { o, d } = this.ray;
    let best: { leaf: Leaf; t: number; v: number; point: THREE.Vector3 } | null = null;
    const hw = this.o.halfWidth;
    for (const l of this.leaves) {
      _qi.copy(l.quat).invert();
      _o.copy(o).sub(l.pos).applyQuaternion(_qi);
      _s.set(l.o.w, l.o.l, l.o.l);
      _o.divide(_s);
      _d.copy(d).applyQuaternion(_qi).divide(_s);
      const droop = l.o.shape[0] + l.flex;
      let prevY = 0;
      let prevZ = 0;
      let prevW = hw(0) + 0.1;
      for (let j = 1; j <= K_STRIPS; j++) {
        const v = j / K_STRIPS;
        const ang = droop * v * v;
        const y = Math.cos(ang) * v;
        const z = -Math.sin(ang) * v;
        const w = hw(v) + 0.1; // a forgiving finger
        _a.set(-prevW, prevY, prevZ);
        _b.set(prevW, prevY, prevZ);
        _c.set(-w, y, z);
        let t = rayTri(_o, _d, _a, _b, _c);
        if (t < 0) {
          _a.set(prevW, prevY, prevZ);
          _b.set(w, y, z);
          _c.set(-w, y, z);
          t = rayTri(_o, _d, _a, _b, _c);
        }
        if (t > 0 && (!best || t < best.t)) {
          best = { leaf: l, t, v: v - 0.5 / K_STRIPS, point: new THREE.Vector3().copy(o).addScaledVector(d, t) };
        }
        prevY = y;
        prevZ = z;
        prevW = w;
      }
    }
    return best;
  }

  private stemHit() {
    if (!this.ray) return null;
    const { o, d } = this.ray;
    let best: { chain: Chain; seg: number; t: number; point: THREE.Vector3 } | null = null;
    for (const c of this.chains) {
      if (c.hidden) continue;
      for (let i = 0; i < c.n; i++) {
        const a = c.pts[i];
        const b = c.pts[i + 1];
        // closest points between the ray and the segment
        _e1.subVectors(b, a);
        _e2.subVectors(o, a);
        const aa = _e1.dot(_e1);
        const bb = _e1.dot(d);
        const cc = d.dot(d);
        const dd = _e1.dot(_e2);
        const ee = d.dot(_e2);
        const den = aa * cc - bb * bb;
        let s = den > 1e-9 ? (bb * ee - cc * dd) / den : 0;
        s = clamp(s, 0, 1);
        const t = (bb * s + ee) / cc;
        if (t < 0) continue;
        _p.copy(a).addScaledVector(_e1, s);
        _q.copy(o).addScaledVector(d, t);
        const dist = _p.distanceTo(_q);
        if (dist < c.radius[i] + 0.014 && (!best || t < best.t)) best = { chain: c, seg: i, t, point: _p.clone() };
      }
    }
    return best;
  }

  /** torque on the joints below a contact point; F in plant space */
  private pushChain(c: Chain, upTo: number, at: THREE.Vector3, F: THREE.Vector3, gain: number) {
    // lever arm × force, applied as an angular acceleration on every joint below the contact:
    // the base joints, with the longest arm, give the most
    for (let j = 0; j < upTo; j++) {
      _r.subVectors(at, c.pts[j]);
      _p.crossVectors(_r, F);
      c.fx[j] += _p.x * gain;
      c.fz[j] += _p.z * gain;
    }
  }

  update(t: number, dt: number) {
    if (!this.built) return;
    this.uni.uTime.value = t;
    const dtf = Math.min(dt, 1 / 30);
    const h = dtf / 2;
    const gust = 0.65 + 0.35 * Math.sin(t * 0.23) * Math.sin(t * 0.11 + 1.0);

    // ---- the finger ----
    let touched: Leaf | null = null;
    let touchPoint: THREE.Vector3 | null = null;
    let touchV = 0;
    const press = new THREE.Vector3();
    const speed = this.vel.length();
    if (this.ray) {
      const hit = this.pick();
      const sh = this.stemHit();
      const useStem = sh && (!hit || sh.t < hit.t - 0.004);
      if (hit && !useStem) {
        touched = hit.leaf;
        touchPoint = hit.point;
        touchV = hit.v;
        const l = hit.leaf;
        const c = l.o.chain;
        // continuous press along the ray, plus the pointer's own motion
        press.copy(this.ray.d).multiplyScalar(60).addScaledVector(this.vel, 46);
        if (l.idx !== this.lastLeaf) {
          // first contact: a poke, so a still pointer landing on a leaf moves it
          press.addScaledVector(this.ray.d, 70);
        }
        this.pushChain(c, l.o.node, hit.point, press, 0.55);
        // the blade's own joint, in its local axes
        _qi.copy(l.quat);
        _r.subVectors(hit.point, l.pos);
        _p.crossVectors(_r, press);
        const ex = _a.copy(AX).applyQuaternion(_qi);
        const ey = _b.copy(AY).applyQuaternion(_qi);
        l.vp += _p.dot(ex) * 8 * dtf;
        l.vr += _p.dot(ey) * 6 * dtf;
        // flex: the tip is pushed along the ray's component on the blade's normal
        const n = l.normal;
        const along = press.dot(n);
        l.vf += -along * (0.3 + touchV * 0.7) * 0.45 * dtf; // droop > 0 bends toward −normal
        this.rustleAmt = Math.min(1, this.rustleAmt + (speed * 0.6 + (l.idx !== this.lastLeaf ? 0.6 : 0.05)) * 0.5);
      } else if (sh) {
        const c = sh.chain;
        press.copy(this.ray.d).multiplyScalar(55).addScaledVector(this.vel, 42);
        this.pushChain(c, sh.seg + 1, sh.point, press, 0.7);
        this.rustleAmt = Math.min(1, this.rustleAmt + speed * 0.2);
      }
      // brushing: leaves the finger passes close to, but is not on, are swept along
      if (speed > 0.06) {
        for (const l of this.leaves) {
          if (l === touched) continue;
          _p.subVectors(l.mid, this.ray.o);
          const tt = _p.dot(this.ray.d);
          if (tt < 0) continue;
          _q.copy(this.ray.d).multiplyScalar(tt);
          const d2 = _p.sub(_q).length();
          const reach = 0.05 + l.o.l * 0.3;
          if (d2 < reach) {
            const f = Math.exp(-Math.pow(d2 / (reach * 0.6), 2));
            press.copy(this.vel).multiplyScalar(34 * f);
            this.pushChain(l.o.chain, l.o.node, l.mid, press, 0.4);
            _r.subVectors(l.mid, l.pos);
            _p.crossVectors(_r, press);
            l.vp += _p.dot(_a.copy(AX).applyQuaternion(l.quat)) * 5 * dtf;
            l.vf += -press.dot(l.normal) * 0.3 * dtf;
          }
        }
      }
    }
    this.lastLeaf = touched ? touched.idx : -1;
    this.touching = !!touched;
    this.rustleAmt = Math.max(0, this.rustleAmt - dt * 2.2);

    // the dent in the shader
    const target = touched ? 1 : 0;
    this.touchStrength += (target - this.touchStrength) * Math.min(1, dt * (target ? 14 : 8));
    if (touched && touchPoint) {
      this.meshUni.forEach((u, mi) => {
        u.uTouchInst.value = mi === touched.mesh ? touched.slot : -1;
      });
      this.uni.uTouch.value.set(touchPoint.x, touchPoint.y, touchPoint.z, 0).applyMatrix4(this.group.matrixWorld);
      this.uni.uTouchDir.value.copy(this.ray!.d).transformDirection(this.group.matrixWorld);
      this.uni.uTouchR.value = 0.03 * this.scale + touched.o.l * 0.08;
    }
    this.uni.uTouch.value.w = this.touchStrength * 0.014 * this.scale;

    // ---- the physics, two substeps ----
    for (let sub = 0; sub < 2; sub++) {
      for (const c of this.chains) {
        for (let i = 0; i < c.n; i++) {
          const w = c.wind * gust;
          const nx = Math.sin(t * 0.9 + c.phase + i * 0.7) * 0.7 + Math.sin(t * 2.1 + c.phase * 1.7) * 0.3;
          const nz = Math.sin(t * 0.7 + c.phase * 1.3 + i) * 0.7 + Math.sin(t * 1.9 + c.phase) * 0.3;
          const px = i > 0 ? c.accX[i - 1] : 0;
          const pz = i > 0 ? c.accZ[i - 1] : 0;
          c.accX[i] = -c.k[i] * c.ax[i] - c.c[i] * c.vx[i] + c.fx[i] + nx * 1.6 * w - 0.35 * px;
          c.accZ[i] = -c.k[i] * c.az[i] - c.c[i] * c.vz[i] + c.fz[i] + nz * 1.6 * w - 0.35 * pz;
          c.vx[i] += c.accX[i] * h;
          c.vz[i] += c.accZ[i] * h;
          c.ax[i] = clamp(c.ax[i] + c.vx[i] * h, -0.75, 0.75);
          c.az[i] = clamp(c.az[i] + c.vz[i] * h, -0.75, 0.75);
        }
      }
    }
    for (const c of this.chains) {
      c.fx.fill(0);
      c.fz.fill(0);
    }
    this.pose();

    // ---- blades: own joint, flex along the length, twist ----
    const hh = Math.min(dt, 1 / 30);
    for (const l of this.leaves) {
      const w = gust;
      const ph = l.phase;
      // inertia: the tip accelerating along the normal makes the blade lag
      _p.subVectors(l.tip, l.prevTip);
      const vN = hh > 0 ? _p.dot(l.normal) / hh : 0;
      const aN = hh > 0 ? (vN - l.prevVTipN.v) / hh : 0;
      l.prevVTipN.v = vN;
      l.prevTip.copy(l.tip);
      const lag = clamp(aN / Math.max(0.05, l.o.l), -60, 60);
      const ambient = Math.sin(t * 1.1 + ph) * 0.6 + Math.sin(t * 2.3 + ph * 1.9) * 0.4;
      for (let sub = 0; sub < 2; sub++) {
        l.vp += (-l.jointK * l.pitch - l.jointC * l.vp + ambient * 2.2 * w) * h;
        l.vr += (-l.jointK * 1.4 * l.roll - l.jointC * l.vr + Math.sin(t * 1.4 + ph * 0.7) * 1.4 * w) * h;
        l.vf += (-l.flexK * l.flex - l.flexC * l.vf + 0.4 * lag + ambient * 2.0 * w) * h;
        l.vt += (-l.flexK * 1.6 * l.twist - l.flexC * l.vt + 0.12 * lag * (ph % 1 > 0.5 ? 1 : -1)) * h;
        l.pitch = clamp(l.pitch + l.vp * h, -0.9, 0.9);
        l.roll = clamp(l.roll + l.vr * h, -0.7, 0.7);
        l.flex = clamp(l.flex + l.vf * h, -1.1, 1.1);
        l.twist = clamp(l.twist + l.vt * h, -0.8, 0.8);
      }
      this.dyns[l.mesh].setXYZW(l.slot, l.flex, l.twist, l.flutter * (0.6 + 0.4 * Math.sin(t * 0.21 + ph)) * (1 + this.rustleAmt * 2), ph);
    }
    for (const d of this.dyns) d.needsUpdate = true;
  }

  asPlant(): Plant {
    return {
      group: this.group,
      refresh: () => this.refresh(),
      touch: (r, v) => this.touch(r, v),
      update: (t, dt) => this.update(t, dt),
      state: () => ({ touching: this.touching, rustle: this.rustleAmt }),
    };
  }
}

/* ================================ helpers ================================ */

const col = (hex: number) => new THREE.Color(hex);

/** n+1 points along a polyline-through-points curve */
function sample(points: THREE.Vector3[], n: number) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return curve.getPoints(n);
}

const heartHalf = (v: number) => 0.46 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, v)), 0.68)), 0.8) + 0.02;

/* ================================ plants ================================ */

export type PothosOpts = {
  seed: number;
  vines: number;
  /** nodes along each vine, and leaf size (blade length, m) */
  nodes: number;
  leafSize: number;
  potR: number;
  potH: number;
  potColor: number;
  /** free hang below the rim, m */
  dropMin: number;
  dropMax: number;
  /** vines that, once they reach the surface under the pot, run along it for this far */
  creep?: number;
  /** the scanned leaves; without them the flat painted ones are used */
  lib?: LeafLibrary | null;
};

/**
 * Trailing pothos: vines that arch over the rim and hang under their own
 * weight, a heart leaf at nearly every node. Soft joints, so a touch sets a
 * whole vine swinging. With a leaf library the leaves are the scanned ones.
 */
export function buildPothos(kit: Kit, o: PothosOpts): Plant {
  const F = new Foliage(
    kit,
    o.lib
      ? { scanned: o.lib, maxLeaves: o.vines * o.nodes + 8, grid: [4, 6], halfWidth: heartHalf, rough: 0.4, bump: 1 }
      : { tex: heartTexture(), maxLeaves: o.vines * o.nodes + 8, grid: [6, 10], halfWidth: heartHalf, rough: 0.4, bump: 1.0 },
    o.seed
  );
  potAndSoil(kit, F.group, o.potR, o.potH, o.potColor, 0.55);
  const vineBase = col(0x3f5a2e);
  const vineTip = col(0x6f8f47);
  const top = o.potH * 0.93;
  for (let v = 0; v < o.vines; v++) {
    const a = (v / o.vines) * Math.PI * 2 + F.rand() * 0.8;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const drop = o.dropMin + F.rand() * (o.dropMax - o.dropMin);
    const upright = v % 4 === 3; // a few shoots climb before they fall
    const ctrl: THREE.Vector3[] = [new THREE.Vector3(dx * o.potR * 0.25, top, dz * o.potR * 0.25)];
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const rr = o.potR * 0.3 + (o.potR * 0.85 + drop * 0.18) * Math.sin(Math.min(1, u * 1.5) * Math.PI * 0.5);
      let y = top + (upright ? 0.09 : 0.03) * Math.sin(Math.PI * Math.min(1, u * 1.4)) - drop * Math.pow(u, 1.75);
      const wob = (F.rand() - 0.5) * 0.012;
      let px = dx * rr - dz * wob;
      let pz = dz * rr + dx * wob;
      if (o.creep && y < 0.007) {
        // reached the surface: carry on along it
        y = 0.007 + 0.002 * Math.sin(u * 14 + v);
        const run = o.creep * (0.4 + F.rand() * 0.6) * (u - 0.6);
        px += dx * run;
        pz += dz * run;
      }
      ctrl.push(new THREE.Vector3(px, y, pz));
    }
    const n = o.nodes;
    const pts = sample(ctrl, n);
    const chain = F.addChain(pts, {
      points: pts,
      radius: (j, nn) => 0.0017 * (1 - 0.3 * (j / nn)),
      color: (j, nn) => vineBase.clone().lerp(vineTip, j / nn),
      k: 34,
      taper: 0.2,
      zeta: 0.2,
      wind: 1.2,
    });
    for (let i = 2; i <= n; i++) {
      const tan = _a.subVectors(pts[Math.min(n, i + 1)], pts[i - 1]).normalize();
      const side = i % 2 ? 1 : -1;
      const dir = new THREE.Vector3(-tan.z * side, 0.0, tan.x * side).multiplyScalar(0.85).add(new THREE.Vector3(0, -0.4, 0)).normalize();
      const size = o.leafSize * (1.05 - (i / n) * 0.35) * (0.85 + F.rand() * 0.3);
      F.addLeaf({
        chain,
        node: i,
        fwd: dir,
        upHint: new THREE.Vector3(tan.x * 0.4, 1, tan.z * 0.4),
        offset: dir.clone().multiplyScalar(0.005),
        w: size * 0.9,
        l: size,
        shape: [0.55 + F.rand() * 0.5, 0.1, 0.04, (F.rand() - 0.5) * 0.4],
        tint: col(0xffffff).multiplyScalar(0.82 + F.rand() * 0.22),
        jointK: 36 + F.rand() * 18,
        flexK: 50,
        flutter: 0.04 + F.rand() * 0.03,
        variant: Math.floor(F.rand() * 99),
      });
    }
  }
  F.build();
  return F.asPlant();
}
