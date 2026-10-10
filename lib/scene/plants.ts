import * as THREE from "three";
import { clamp, rng } from "./util";
import type { Kit } from "./props";

/**
 * Houseplants and the air that moves them.
 *
 * Every plant is a small hierarchy of joints (trunk/stem → leaf), and each
 * joint is a damped spring with its own stiffness. Nothing is keyframed.
 * The pointer's motion arrives as an airflow sample (a ray through the scene
 * and a world-space velocity); `blow` turns it into angular impulses on
 * whichever joints sit close to that ray, so the response is local, depends
 * on speed, and comes back to rest by itself. A stem passes a share of what
 * it feels on to its parent, which is what makes a disturbance travel through
 * a plant instead of twitching one leaf.
 *
 * Species: Monstera deliciosa (split, fenestrated leaves on petioles),
 * trailing pothos (connected vines, heart-shaped leaves) and a snake plant
 * (banded, upright blades). Leaf shape comes from a painted alpha texture on
 * a bent, midrib-folded blade, which gives believable splits and veins
 * without thousands of triangles.
 */

/* ============================== textures ============================== */

let monsteraTex: THREE.CanvasTexture | null = null;
let heartTex: THREE.CanvasTexture | null = null;
let bladeTex: THREE.CanvasTexture | null = null;

function leafCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** a Monstera blade: cordate outline, deep splits toward the midrib, holes, veins */
function monsteraTexture() {
  if (monsteraTex) return monsteraTex;
  const W = 384;
  const H = 480;
  const c = leafCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const halfW = (v: number) => {
    // v: 0 base → 1 tip. Rounded lobes at the base, long tapering tip.
    const body = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.85);
    const lobe = 0.12 * Math.exp(-Math.pow((v - 0.08) / 0.07, 2));
    return (body + lobe) * 0.46;
  };
  const notch = (v: number) => {
    // splits begin a third of the way up and run to the shoulder of the tip
    if (v < 0.24 || v > 0.9) return 0;
    const s = Math.max(0, Math.sin(v * Math.PI * 6.2 + 0.4));
    return Math.pow(s, 5) * 0.8 * Math.min(1, (v - 0.24) / 0.1);
  };
  const toPx = (u: number, v: number) => [W / 2 + u * W, H - 14 - v * (H - 28)] as const;

  // blade
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#20502f");
  grad.addColorStop(0.5, "#2f6b3d");
  grad.addColorStop(1, "#1d4a2b");
  ctx.fillStyle = grad;
  ctx.beginPath();
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    const w = halfW(v) * (1 - notch(v));
    const [x, y] = toPx(w, v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const v = i / N;
    // the far side is a touch different so the leaf is not mirrored
    const w = halfW(v) * (1 - notch(Math.min(1, v + 0.013 * Math.sin(v * 11))));
    const [x, y] = toPx(-w, v);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // holes near the midrib (fenestrations)
  ctx.globalCompositeOperation = "destination-out";
  for (const v of [0.34, 0.5, 0.66]) {
    for (const s of [-1, 1]) {
      const [x, y] = toPx(s * halfW(v) * 0.42, v);
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 15, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-atop";

  // veins and midrib
  ctx.strokeStyle = "rgba(190,225,170,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...toPx(0, 0));
  ctx.lineTo(...toPx(0, 0.97));
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(190,225,170,0.32)";
  for (let k = 0; k < 11; k++) {
    const v = 0.1 + k * 0.08;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(...toPx(0, v - 0.02));
      ctx.quadraticCurveTo(...toPx(s * halfW(v) * 0.5, v + 0.04), ...toPx(s * halfW(v) * 0.95, v + 0.1));
      ctx.stroke();
    }
  }
  // a little sheen toward one side
  const sheen = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(210,240,200,0.10)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  monsteraTex = new THREE.CanvasTexture(c);
  monsteraTex.colorSpace = THREE.SRGBColorSpace;
  monsteraTex.anisotropy = 8;
  return monsteraTex;
}

/** a pothos leaf: soft heart with a pointed tip, light mottling */
function heartTexture() {
  if (heartTex) return heartTex;
  const c = leafCanvas(192, 224);
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 192, 224);
  g.addColorStop(0, "#2c6a38");
  g.addColorStop(1, "#58a45a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(96, 210);
  ctx.bezierCurveTo(10, 170, -10, 70, 48, 60);
  ctx.bezierCurveTo(70, 56, 90, 70, 96, 90);
  ctx.bezierCurveTo(102, 70, 122, 56, 144, 60);
  ctx.bezierCurveTo(202, 70, 182, 170, 96, 210);
  ctx.closePath();
  // flipped so the tip points to +v
  ctx.save();
  ctx.translate(0, 224);
  ctx.scale(1, -1);
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(255,240,150,0.20)";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(40 + Math.random() * 110, 40 + Math.random() * 140, 8 + Math.random() * 14, 5 + Math.random() * 9, Math.random() * 3, 0, 7);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(220,240,190,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(96, 8);
  ctx.lineTo(96, 190);
  ctx.stroke();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  heartTex.anisotropy = 4;
  return heartTex;
}

/** a snake-plant blade: dark green with pale cross-banding and a yellow edge */
function bladeTexture() {
  if (bladeTex) return bladeTex;
  const c = leafCanvas(96, 384);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1f4a2c";
  ctx.fillRect(0, 0, 96, 384);
  ctx.fillStyle = "rgba(150,190,130,0.28)";
  for (let y = 0; y < 384; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + 4);
    ctx.bezierCurveTo(30, y - 6, 60, y + 14, 96, y + 2);
    ctx.lineTo(96, y + 11);
    ctx.bezierCurveTo(60, y + 22, 30, y + 2, 0, y + 13);
    ctx.fill();
  }
  ctx.fillStyle = "#c9c46a";
  ctx.fillRect(0, 0, 5, 384);
  ctx.fillRect(91, 0, 5, 384);
  bladeTex = new THREE.CanvasTexture(c);
  bladeTex.colorSpace = THREE.SRGBColorSpace;
  bladeTex.anisotropy = 4;
  return bladeTex;
}

/* ============================== geometry ============================== */

/** A blade on [0,1]² bent along its length, folded along the midrib, tip drooping. */
function bladeGeometry(len: number, width: number, droop: number, fold: number, su = 6, sv = 14) {
  const g = new THREE.PlaneGeometry(1, 1, su, sv);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i); // -0.5..0.5
    const v = pos.getY(i) + 0.5; // 0..1
    const ang = droop * v * v;
    const along = len * v;
    pos.setXYZ(i, u * width, Math.cos(ang) * along, -Math.sin(ang) * along - Math.abs(u) * fold * width * Math.sin(Math.PI * Math.min(1, v * 1.15)));
  }
  g.computeVertexNormals();
  return g;
}

function potGeometry(r: number, h: number) {
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.7, 0],
    [r * 0.78, h * 0.03],
    [r * 0.97, h * 0.7],
    [r, h * 0.97],
    [r * 0.95, h],
    [r * 0.86, h * 0.985],
    [r * 0.8, h * 0.93],
  ];
  return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48);
}

/* ============================ spring system =========================== */

class Joint {
  ax = 0;
  az = 0;
  vx = 0;
  vz = 0;
  readonly rx0: number;
  readonly rz0: number;
  readonly world = new THREE.Vector3();
  readonly invQ = new THREE.Quaternion();
  constructor(
    readonly obj: THREE.Object3D,
    readonly k: number,
    readonly c: number,
    readonly flex: number,
    readonly parent: Joint | null,
    readonly share: number,
    readonly idle: { amp: number; sp: number; ph: number }
  ) {
    this.rx0 = obj.rotation.x;
    this.rz0 = obj.rotation.z;
  }
  get energy() {
    return Math.abs(this.ax) + Math.abs(this.az) + Math.abs(this.vx) * 0.1 + Math.abs(this.vz) * 0.1;
  }
  kick(dx: number, dz: number) {
    this.vx += dx;
    this.vz += dz;
    if (this.parent) this.parent.kick(dx * this.share, dz * this.share);
  }
  step(dt: number, t: number) {
    const ax = -this.k * this.ax - this.c * this.vx;
    const az = -this.k * this.az - this.c * this.vz;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.ax = clamp(this.ax + this.vx * dt, -0.7, 0.7);
    this.az = clamp(this.az + this.vz * dt, -0.7, 0.7);
    const i = this.idle;
    this.obj.rotation.x = this.rx0 + this.ax + Math.sin(t * i.sp + i.ph) * i.amp;
    this.obj.rotation.z = this.rz0 + this.az + Math.cos(t * i.sp * 0.8 + i.ph) * i.amp * 0.6;
  }
}

export type Plant = {
  group: THREE.Group;
  /** call once the plant has been placed in the scene */
  refresh(): void;
  /** the pointer's air: a ray (origin, unit dir) and a world velocity (m/s) */
  blow(origin: THREE.Vector3, dir: THREE.Vector3, velocity: THREE.Vector3, strength: number): void;
  /** a small, uniform puff (hover feedback) */
  puff(amount: number): void;
  update(t: number, dt: number): void;
};

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _l = new THREE.Vector3();

function makePlant(group: THREE.Group, joints: Joint[], reach = 0.15): Plant {
  let active = 0;
  return {
    group,
    refresh() {
      group.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      for (const j of joints) {
        j.obj.parent?.updateWorldMatrix(true, false);
        j.obj.getWorldPosition(j.world);
        (j.obj.parent ?? j.obj).getWorldQuaternion(q);
        j.invQ.copy(q).invert();
      }
    },
    blow(origin, dir, velocity, strength) {
      const speed = Math.min(2.2, velocity.length());
      if (speed < 0.04) return;
      _v.copy(velocity).normalize();
      for (const j of joints) {
        _p.copy(j.world).sub(origin);
        const t = _p.dot(dir);
        if (t < 0) continue;
        _l.copy(dir).multiplyScalar(t);
        const d = _p.sub(_l).length();
        const f = Math.exp(-((d / reach) * (d / reach))) * speed * strength;
        if (f < 0.01) continue;
        // into the joint's own frame: bend about local X for wind along +Z, about Z for wind along -X
        _l.copy(_v).applyQuaternion(j.invQ);
        j.kick(_l.z * f * 5.5 * j.flex, -_l.x * f * 5.5 * j.flex);
        active = 3;
      }
    },
    puff(a) {
      for (const j of joints) j.kick((Math.random() - 0.5) * a * 2.2 * j.flex, (Math.random() - 0.5) * a * 2.2 * j.flex);
      active = 3;
    },
    update(t, dt) {
      const h = Math.min(dt, 1 / 30);
      // joints are cheap, but settled plants only need the idle breeze
      active = Math.max(0, active - h);
      for (const j of joints) {
        if (active > 0 || j.energy > 0.0005) j.step(h, t);
        else {
          const i = j.idle;
          j.obj.rotation.x = j.rx0 + Math.sin(t * i.sp + i.ph) * i.amp;
          j.obj.rotation.z = j.rz0 + Math.cos(t * i.sp * 0.8 + i.ph) * i.amp * 0.6;
        }
      }
    },
  };
}

const jointOf = (obj: THREE.Object3D, o: { stiff: number; flex: number; parent?: Joint | null; share?: number; idle?: number; R: () => number }) => {
  const k = 38 * o.stiff;
  const c = 2 * Math.sqrt(k) * 0.16;
  return new Joint(obj, k, c, o.flex, o.parent ?? null, o.share ?? 0.3, {
    amp: o.idle ?? 0.012,
    sp: 0.5 + o.R() * 0.35,
    ph: o.R() * 10,
  });
};

function potAndSoil(kit: Kit, g: THREE.Group, r: number, h: number, color: number, rough = 0.82) {
  const m = kit.mesh(
    potGeometry(r, h),
    kit.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, side: THREE.DoubleSide }))
  );
  g.add(m);
  const soil = kit.mesh(
    new THREE.CircleGeometry(r * 0.84, 32),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 })),
    false,
    true
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h * 0.9;
  g.add(soil);
  // a few pebbles of top-dressing, so the soil is not a flat disc
  const pebble = kit.track(new THREE.IcosahedronGeometry(1, 0));
  const pm = kit.track(new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 1 }));
  const R = rng(12);
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2;
    const rr = Math.sqrt(R()) * r * 0.7;
    const p = new THREE.Mesh(pebble, pm);
    p.scale.set(0.007 + R() * 0.006, 0.004, 0.007 + R() * 0.006);
    p.position.set(Math.cos(a) * rr, h * 0.9 + 0.002, Math.sin(a) * rr);
    p.rotation.y = R() * 3;
    g.add(p);
  }
}

/* ================================ plants ============================== */

/** Monstera deliciosa in a matte ceramic pot. About 38 cm tall at scale 1. */
export function buildMonstera(kit: Kit, seed = 3): Plant {
  const R = rng(seed);
  const g = new THREE.Group();
  const joints: Joint[] = [];
  potAndSoil(kit, g, 0.085, 0.14, 0xe8e5de);
  kit.addContact(g, 0.3, 0.3, { alpha: 0.7 });

  const tex = monsteraTexture();
  const mats = [0.92, 1.0, 1.08].map((s) =>
    kit.track(
      new THREE.MeshStandardMaterial({
        map: tex,
        color: new THREE.Color(s, s, s),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.42,
        metalness: 0,
      })
    )
  );
  const stemMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x4d6a3a, roughness: 0.7 }));
  const geos = [
    kit.track(bladeGeometry(0.2, 0.17, 0.9, 0.16)),
    kit.track(bladeGeometry(0.17, 0.145, 0.8, 0.14)),
    kit.track(bladeGeometry(0.13, 0.11, 0.6, 0.12)),
  ];

  const N = 9;
  const base = 0.12;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const az = i * 2.399963 + R() * 0.4;
    const lift = 0.1 + (0.12 + R() * 0.1) * (0.4 + 0.6 * k); // taller toward the heart
    const reach = (0.05 + (1 - k) * 0.1) * (0.8 + R() * 0.4);
    const dx = Math.cos(az);
    const dz = Math.sin(az);

    // each petiole is its own group, pivoting at the soil: it is the "branch" joint
    const stem = new THREE.Group();
    stem.position.set(0, base, 0);
    g.add(stem);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dx * reach * 0.15, lift * 0.55, dz * reach * 0.15),
      new THREE.Vector3(dx * reach * 0.6, lift * 0.95, dz * reach * 0.6),
      new THREE.Vector3(dx * reach, lift, dz * reach),
    ]);
    const tube = kit.mesh(new THREE.TubeGeometry(curve, 12, 0.0032, 6, false), stemMat, true, false);
    stem.add(tube);
    const stemJ = jointOf(stem, { stiff: 1.6, flex: 0.45, share: 0.15, idle: 0.004, R });
    joints.push(stemJ);

    const end = curve.getPoint(1);
    const holder = new THREE.Group();
    holder.position.copy(end);
    holder.rotation.y = -az + Math.PI / 2; // blade runs outward along the stem's azimuth
    stem.add(holder);
    const leaf = new THREE.Mesh(geos[k > 0.66 ? 2 : k > 0.33 ? 1 : 0], mats[i % 3]);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    leaf.rotation.x = 1.1 - k * 0.45 + (R() - 0.5) * 0.3; // blade leans out and over
    leaf.rotation.z = (R() - 0.5) * 0.3;
    leaf.scale.setScalar(0.85 + R() * 0.3);
    holder.add(leaf);
    const leafJ = jointOf(leaf, { stiff: 1.0, flex: 1.0, parent: stemJ, share: 0.35, idle: 0.01, R });
    joints.push(leafJ);
  }

  return makePlant(g, joints, 0.12);
}

/** A pothos in a small pot with vines that fall under their own weight. */
export function buildPothos(kit: Kit, seed = 5): Plant {
  const R = rng(seed);
  const g = new THREE.Group();
  const joints: Joint[] = [];
  potAndSoil(kit, g, 0.045, 0.068, 0xece9e2);
  const vineMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x35542c, roughness: 0.8 }));
  const leafMat = kit.track(
    new THREE.MeshStandardMaterial({ map: heartTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4 })
  );
  const leafGeo = kit.track(bladeGeometry(0.052, 0.044, 0.5, 0.1, 3, 6));

  const vines = 6;
  for (let v = 0; v < vines; v++) {
    const a = (v / vines) * Math.PI * 2 + R() * 0.8;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const out = 0.055 + R() * 0.04;
    const drop = 0.14 + R() * 0.2;
    const pivot = new THREE.Group();
    pivot.position.set(dx * 0.022, 0.07, dz * 0.022);
    g.add(pivot);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dx * out * 0.7, 0.032, dz * out * 0.7),
      new THREE.Vector3(dx * out * 1.15, 0.0, dz * out * 1.15),
      new THREE.Vector3(dx * out * 1.35 + (R() - 0.5) * 0.02, -drop * 0.4, dz * out * 1.35 + (R() - 0.5) * 0.02),
      new THREE.Vector3(dx * out * 1.3 + (R() - 0.5) * 0.03, -drop * 0.8, dz * out * 1.3 + (R() - 0.5) * 0.03),
      new THREE.Vector3(dx * out * 1.4, -drop, dz * out * 1.4),
    ]);
    pivot.add(kit.mesh(new THREE.TubeGeometry(curve, 28, 0.0017, 5, false), vineMat, false, false));
    const vineJ = jointOf(pivot, { stiff: 0.6, flex: 0.9, share: 0.2, idle: 0.01, R });
    joints.push(vineJ);

    const leaves = 6 + Math.floor(R() * 4);
    for (let i = 0; i < leaves; i++) {
      const t = 0.1 + (i / leaves) * 0.9;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const holder = new THREE.Group();
      holder.position.copy(p);
      // the leaf hangs from a short stalk: points away from the vine and down
      const side = i % 2 ? 1 : -1;
      const dir = new THREE.Vector3(-tan.z * side, 0, tan.x * side).multiplyScalar(0.8).add(new THREE.Vector3(0, -0.35, 0)).normalize();
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      pivot.add(holder);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.receiveShadow = true;
      leaf.position.y = 0.004;
      leaf.rotation.y = R() * 0.6 - 0.3;
      leaf.scale.setScalar(0.8 + R() * 0.45);
      holder.add(leaf);
      joints.push(jointOf(holder, { stiff: 0.45, flex: 1.3, parent: vineJ, share: 0.25, idle: 0.025, R }));
    }
  }
  return makePlant(g, joints, 0.1);
}

/** A compact snake plant for the desk. */
export function buildSnakePlant(kit: Kit, seed = 9): Plant {
  const R = rng(seed);
  const g = new THREE.Group();
  const joints: Joint[] = [];
  potAndSoil(kit, g, 0.05, 0.075, 0x2a2b2f, 0.7);
  kit.addContact(g, 0.17, 0.17, { alpha: 0.7 });
  const mat = kit.track(
    new THREE.MeshStandardMaterial({ map: bladeTexture(), side: THREE.DoubleSide, roughness: 0.38, metalness: 0 })
  );
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const len = 0.15 + R() * 0.15;
    const geo = kit.track(bladeGeometry(len, 0.026 + R() * 0.008, 0.18 + R() * 0.25, 0.35, 3, 10));
    // taper toward the tip
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const vv = pos.getY(k) / (len || 1);
      pos.setX(k, pos.getX(k) * (1 - 0.82 * Math.pow(Math.min(1, vv), 2.2)));
    }
    geo.computeVertexNormals();
    const holder = new THREE.Group();
    const a = (i / blades) * Math.PI * 2 + R() * 0.6;
    const r = 0.01 + R() * 0.02;
    holder.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
    holder.rotation.y = a + Math.PI / 2;
    const blade = new THREE.Mesh(geo, mat);
    blade.castShadow = true;
    blade.rotation.x = 0.06 + R() * 0.16;
    holder.add(blade);
    g.add(holder);
    joints.push(jointOf(blade, { stiff: 2.4, flex: 0.45, idle: 0.004, R }));
  }
  return makePlant(g, joints, 0.09);
}
