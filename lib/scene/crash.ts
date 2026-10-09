import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, clamp, easeInOut, makeCanvas, rng, textPlane } from "./util";
import { buildGate } from "./gate";
import { facadeMaterial } from "./facade";
import { glowTexture } from "./pulse";

/**
 * Stage — Crash Capsule: a post-crash evidence-reconstruction concept, drawn
 * as a scene on a blue-hour intersection. Two vehicles replay the collision
 * and scrub back; around them the things a reconstruction is made of:
 * numbered evidence markers, police tape, a scanner sweeping the scene,
 * skid marks, dimension lines, ghost frames. A police car flashes at the
 * kerb, lamps pool on wet asphalt, and the corner buildings are lived-in.
 */

type Pose = { x: number; z: number; yaw: number };

// Vehicle A drives +x, vehicle B drives −z (yaw π/2 maps local +x → −z).
function poseA(u: number): Pose {
  if (u <= 0.5) {
    const s = u / 0.5;
    return { x: THREE.MathUtils.lerp(-46, -2.4, 1 - Math.pow(1 - s, 1.25)), z: 0, yaw: 0 };
  }
  const e = 1 - Math.pow(1 - (u - 0.5) / 0.5, 3);
  return { x: -2.4 + e * 17, z: -e * 7.5, yaw: e * 1.15 };
}
function poseB(u: number): Pose {
  if (u <= 0.5) {
    const s = u / 0.5;
    return { x: 1.0, z: THREE.MathUtils.lerp(38, 0.4, 1 - Math.pow(1 - s, 1.25)), yaw: Math.PI / 2 };
  }
  const e = 1 - Math.pow(1 - (u - 0.5) / 0.5, 3);
  return { x: 1.0 + e * 3.8, z: 0.4 - e * 19, yaw: Math.PI / 2 - e * 0.62 };
}

const CYAN = 0x7fd6ff;

function roadTexture() {
  const S = 2048;
  const px = S / 150; // px per metre over a 150 m plane
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#101820";
  ctx.fillRect(0, 0, S, S);
  const R = rng(2);
  const road = "#1d2733";
  const rw = 9 * px;
  const mid = S / 2;
  ctx.fillStyle = road;
  ctx.fillRect(0, mid - rw / 2, S, rw);
  ctx.fillRect(mid - rw / 2, 0, rw, S);
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = `rgba(${R() < 0.5 ? "170,200,230" : "0,0,0"},${0.02 + R() * 0.05})`;
    ctx.fillRect(R() * S, R() * S, 2, 2);
  }
  // wet sheen near the middle
  const sheen = ctx.createRadialGradient(mid, mid, 10, mid, mid, S * 0.34);
  sheen.addColorStop(0, "rgba(120,170,210,0.16)");
  sheen.addColorStop(1, "rgba(120,170,210,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, S, S);
  // markings
  const white = "rgba(236,238,240,0.82)";
  ctx.strokeStyle = white;
  ctx.lineWidth = 3;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, mid + d * (rw / 2 - 5));
    ctx.lineTo(mid - rw / 2, mid + d * (rw / 2 - 5));
    ctx.moveTo(mid + rw / 2, mid + d * (rw / 2 - 5));
    ctx.lineTo(S, mid + d * (rw / 2 - 5));
    ctx.moveTo(mid + d * (rw / 2 - 5), 0);
    ctx.lineTo(mid + d * (rw / 2 - 5), mid - rw / 2);
    ctx.moveTo(mid + d * (rw / 2 - 5), mid + rw / 2);
    ctx.lineTo(mid + d * (rw / 2 - 5), S);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,200,90,0.9)";
  for (const o of [-2.5, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(0, mid + o);
    ctx.lineTo(mid - rw / 2 - 12, mid + o);
    ctx.moveTo(mid + rw / 2 + 12, mid + o);
    ctx.lineTo(S, mid + o);
    ctx.moveTo(mid + o, 0);
    ctx.lineTo(mid + o, mid - rw / 2 - 12);
    ctx.moveTo(mid + o, mid + rw / 2 + 12);
    ctx.lineTo(mid + o, S);
    ctx.stroke();
  }
  // crosswalks
  ctx.fillStyle = white;
  const stripes = 9;
  for (let i = 0; i < stripes; i++) {
    const t = (i - (stripes - 1) / 2) * (rw / (stripes + 1)) * 1.1;
    for (const side of [-1, 1]) {
      ctx.fillRect(mid + t - 7, mid + side * (rw / 2 + 28) - 22, 14, 44);
      ctx.fillRect(mid + side * (rw / 2 + 28) - 22, mid + t - 7, 44, 14);
    }
  }
  const tex = canvasTexture(c, 8);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function numberSprite(n: number) {
  const c = makeCanvas(96, 96);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffd23a";
  ctx.beginPath();
  ctx.arc(48, 48, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16130a";
  ctx.font = "800 54px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 48, 52);
  return canvasTexture(c, 4);
}

function tapeTexture() {
  const c = makeCanvas(128, 32);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f2c230";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#14120a";
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 24, 0);
    ctx.lineTo(i * 24 + 12, 0);
    ctx.lineTo(i * 24 + 28, 32);
    ctx.lineTo(i * 24 + 16, 32);
    ctx.closePath();
    ctx.fill();
  }
  const t = canvasTexture(c, 4);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function buildCrash(opts: { fonts: { hero: string } }) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(13);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  // ---- ground and roads ----
  const roads = new THREE.Mesh(
    track(new THREE.PlaneGeometry(150, 150)),
    track(new THREE.MeshStandardMaterial({ map: track(roadTexture()), roughness: 0.42, metalness: 0.25 }))
  );
  roads.rotation.x = -Math.PI / 2;
  group.add(roads);
  const apron = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1200, 1200)),
    track(new THREE.MeshStandardMaterial({ color: 0x0c131b, roughness: 1 }))
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.06;
  group.add(apron);

  // pavements on the four corners + the buildings behind them
  const paveMat = track(new THREE.MeshStandardMaterial({ color: 0x38414b, roughness: 0.85 }));
  const facade = facadeMaterial({ lit: 0.5, emit: 1.8 });
  track(facade.material);
  const bGeo = track(new THREE.BoxGeometry(1, 1, 1));
  bGeo.translate(0, 0.5, 0);
  const nBuild = 24;
  const buildings = new THREE.InstancedMesh(bGeo, facade.material, nBuild);
  const col = new THREE.Color();
  const palette = [0x8a9fb4, 0xb89a7c, 0x6f7f90, 0xc4b59a, 0x7b8b84];
  let bi = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pave = new THREE.Mesh(track(new THREE.BoxGeometry(44, 0.22, 44)), paveMat);
      pave.position.set(sx * 26.5, 0.1, sz * 26.5);
      group.add(pave);
      for (let k = 0; k < 6; k++) {
        const w = 8 + R() * 8;
        const d = 8 + R() * 8;
        const h = 8 + R() * 16;
        const bx = sx * (12 + R() * 28);
        const bz = sz * (12 + R() * 28);
        if (Math.abs(bx) < 12 && Math.abs(bz) < 12) continue;
        m4.compose(v.set(bx, 0.2, bz), q.identity(), sc.set(w, h, d));
        buildings.setMatrixAt(bi, m4);
        col.setHex(palette[Math.floor(R() * palette.length)]).multiplyScalar(0.3 + R() * 0.2);
        buildings.setColorAt(bi, col);
        bi++;
      }
    }
  }
  buildings.count = bi;
  group.add(buildings);
  track(buildings);

  // ---- street lamps and their pools ----
  const lampPos: [number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      lampPos.push([sx * 6.2, sz * 6.2], [sx * 26, sz * 6.2], [sx * 6.2, sz * 26]);
    }
  }
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.6, metalness: 0.5 }));
  const headMat = track(new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }));
  const poolMat = track(
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb060, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const poleGeo = track(new THREE.CylinderGeometry(0.1, 0.14, 7.5, 8));
  const armGeo = track(new THREE.BoxGeometry(2.2, 0.12, 0.12));
  const headGeo = track(new THREE.BoxGeometry(0.9, 0.16, 0.4));
  const poolGeo = track(new THREE.PlaneGeometry(1, 1));
  lampPos.forEach(([x, z]) => {
    const dirX = x > 0 ? -1 : 1;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 3.75, z);
    group.add(pole);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(x + dirX * 1.1, 7.4, z);
    group.add(arm);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x + dirX * 2.1, 7.3, z);
    group.add(head);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + dirX * 2.1, 0.07, z);
    pool.scale.set(16, 16, 1);
    group.add(pool);
  });

  // ---- vehicles ----
  const bodyGeo = new RoundedBoxGeometry(4.4, 0.8, 1.9, 3, 0.2);
  const cabGeo = new RoundedBoxGeometry(2.4, 0.7, 1.7, 3, 0.25);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18);
  wheelGeo.rotateX(Math.PI / 2);
  tracked.push(bodyGeo, cabGeo, wheelGeo);
  const glassMat = track(new THREE.MeshPhysicalMaterial({ color: 0x0a1018, roughness: 0.08, metalness: 0.2, clearcoat: 1 }));
  const wheelMat = track(new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.8 }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }));
  const tailMat = track(new THREE.MeshBasicMaterial({ color: 0xff3a30, toneMapped: false }));
  const beamMat = track(
    new THREE.MeshBasicMaterial({ color: 0xffe9bd, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  // a cone whose apex is at the lamp and which widens along +x
  const beamGeo = track(new THREE.ConeGeometry(2.6, 14, 24, 1, true));
  beamGeo.translate(0, -7, 0); // apex at the origin, widening toward -y
  beamGeo.rotateZ(Math.PI / 2); // …now widening toward +x

  const carLightGeo = track(new THREE.BoxGeometry(0.1, 0.22, 0.42));
  const roofGeo = track(new RoundedBoxGeometry(2.1, 0.08, 1.6, 2, 0.04));
  const makeCar = (color: number, beams: boolean) => {
    const car = new THREE.Group();
    const paint = track(new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    const body = new THREE.Mesh(bodyGeo, paint);
    body.position.y = 0.78;
    const cab = new THREE.Mesh(cabGeo, glassMat);
    cab.position.set(-0.2, 1.46, 0);
    const roof = new THREE.Mesh(roofGeo, paint);
    roof.position.set(-0.2, 1.84, 0);
    car.add(body, cab, roof);
    for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.38, z);
      car.add(w);
    }
    for (const z of [-0.62, 0.62]) {
      const h = new THREE.Mesh(carLightGeo, lampMat);
      h.position.set(2.18, 0.86, z);
      const t = new THREE.Mesh(carLightGeo, tailMat);
      t.position.set(-2.18, 0.9, z);
      car.add(h, t);
    }
    if (beams) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(2.2, 0.8, 0);
      car.add(b);
    }
    return car;
  };
  const carA = makeCar(0xe9e6df, true); // pearl white
  const carB = makeCar(0xb3282b, true); // deep red
  group.add(carA, carB);

  const ghostGeo = track(new THREE.BoxGeometry(4.4, 1.5, 1.9));
  const ghostEdges = track(new THREE.EdgesGeometry(ghostGeo));
  const ghostCar = (opacity: number) => {
    const g = new THREE.Group();
    const em = track(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity, depthWrite: false }));
    const e1 = new THREE.LineSegments(ghostEdges, em);
    e1.position.y = 0.85;
    g.add(e1);
    return g;
  };
  const placePose = (o: THREE.Object3D, p: Pose) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.yaw;
  };
  [0, 0.17, 0.34].forEach((u, i) => {
    const a = ghostCar(0.2 + i * 0.12);
    placePose(a, poseA(u));
    const b = ghostCar(0.2 + i * 0.12);
    placePose(b, poseB(u));
    group.add(a, b);
  });
  [0.64, 0.82, 1].forEach((u, i) => {
    const a = ghostCar(0.5 - i * 0.12);
    placePose(a, poseA(u));
    const b = ghostCar(0.5 - i * 0.12);
    placePose(b, poseB(u));
    group.add(a, b);
  });

  // ---- skid marks: rubber, darker than the road ----
  const skid: number[] = [];
  const wheelTrack = (pose: (u: number) => Pose, u0: number, u1: number) => {
    const n = 40;
    for (const side of [-0.95, 0.95]) {
      let prev: [number, number] | null = null;
      for (let i = 0; i <= n; i++) {
        const u = u0 + ((u1 - u0) * i) / n;
        const p = pose(u);
        const lx = -1.4;
        const x = p.x + lx * Math.cos(p.yaw) + side * Math.sin(p.yaw);
        const z = p.z - lx * Math.sin(p.yaw) + side * Math.cos(p.yaw);
        if (prev) skid.push(prev[0], 0.03, prev[1], x, 0.03, z);
        prev = [x, z];
      }
    }
  };
  wheelTrack(poseA, 0.2, 0.5);
  wheelTrack(poseB, 0.24, 0.5);
  wheelTrack(poseA, 0.5, 1);
  wheelTrack(poseB, 0.5, 1);
  const addLines = (pts: number[], mat: THREE.Material) => {
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, mat);
    group.add(l);
    return l;
  };
  addLines(skid, track(new THREE.LineBasicMaterial({ color: 0x03060a, transparent: true, opacity: 0.9 })));

  // ---- measurements, in cyan ----
  const dimMat = track(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7 }));
  const dim: number[] = [];
  const dimLine = (x0: number, z0: number, x1: number, z1: number, tx: number, tz: number) => {
    dim.push(x0, 0.06, z0, x1, 0.06, z1);
    dim.push(x0 - tz * 0.9, 0.06, z0 - tx * 0.9, x0 + tz * 0.9, 0.06, z0 + tx * 0.9);
    dim.push(x1 - tz * 0.9, 0.06, z1 - tx * 0.9, x1 + tz * 0.9, 0.06, z1 + tx * 0.9);
  };
  dimLine(-46, -7.5, -2.4, -7.5, 0, 1);
  dimLine(8, 38, 8, 0.4, 1, 0);
  addLines(dim, dimMat);

  const flatLabel = (text: string, x: number, z: number, w: number, rot = 0, color = "#bfeaff") => {
    const l = textPlane(text, { width: w, px: 72, letterSpacing: 0.06, weight: 600, color });
    l.rotation.x = -Math.PI / 2;
    l.rotation.z = rot;
    l.position.set(x, 0.09, z);
    group.add(l);
    tracked.push(l.geometry, l.material);
  };
  flatLabel("43.6 m", -24, -10, 10);
  flatLabel("37.6 m", 12.5, 19, 10, Math.PI / 2);
  flatLabel("POINT OF IMPACT", 10.5, -2.4, 17, 0, "#ffffff");
  flatLabel("T − 3.2 s", -40, 5.6, 8, 0, "#ffd98a");
  flatLabel("T + 2.4 s", 13, -11.5, 8, 0, "#ff9ab0");

  // range rings around the point of impact
  const rings: number[] = [];
  for (const r of [10, 20, 30]) {
    for (let a = 0; a < 96; a += 2) {
      const a0 = (a / 96) * Math.PI * 2;
      const a1 = ((a + 1) / 96) * Math.PI * 2;
      rings.push(Math.cos(a0) * r, 0.04, Math.sin(a0) * r, Math.cos(a1) * r, 0.04, Math.sin(a1) * r);
    }
  }
  addLines(rings, track(new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.16 })));

  // ---- timeline strip, coloured by what happens: approach, impact, aftermath ----
  const seg = (x0: number, x1: number, color: number) => {
    const m = new THREE.Mesh(
      track(new THREE.PlaneGeometry(x1 - x0, 0.8)),
      track(new THREE.MeshBasicMaterial({ color, toneMapped: false }))
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.08, 48);
    group.add(m);
  };
  seg(-30, 0, 0xffb347);
  seg(0, 8, 0xff5f6d);
  seg(8, 30, 0x5ad1c4);
  const tick: number[] = [];
  for (let i = 0; i <= 12; i++) tick.push(-30 + i * 5, 0.08, 47, -30 + i * 5, 0.08, 49);
  addLines(tick, track(new THREE.LineBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.6 })));
  const headGeo2 = track(new THREE.ConeGeometry(0.9, 1.8, 3));
  headGeo2.rotateX(Math.PI);
  const head = new THREE.Mesh(headGeo2, track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  head.position.set(-30, 1.2, 48);
  group.add(head);

  // ---- impact effects ----
  const ringMat = track(new THREE.MeshBasicMaterial({ color: 0xff8a6a, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const ring = new THREE.Mesh(track(new THREE.RingGeometry(1, 1.08, 72)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.09, 0);
  group.add(ring);

  const DEB = 56;
  const debGeo = track(new THREE.BoxGeometry(0.24, 0.1, 0.18));
  const debMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 }));
  const deb = new THREE.InstancedMesh(debGeo, debMat, DEB);
  const dirs = Array.from({ length: DEB }, (_, i) => {
    const a = R() * Math.PI * 2;
    col.setHex([0xdff3ff, 0xbfe6ff, 0xff7a7a, 0xe9e6df][i % 4]);
    deb.setColorAt(i, col);
    return { dx: Math.cos(a), dz: Math.sin(a), sp: 3 + R() * 9, sp2: R() * 6.28, sc: 0.5 + R() * 1.4 };
  });
  group.add(deb);
  track(deb);

  // ---- the scene a reconstruction works from ----
  // evidence markers: yellow numbered tents with a floating tag
  const evidence: [number, number][] = [
    [-8, -3.5],
    [-3, 4.5],
    [4.5, -6],
    [9.5, -9],
    [13, -2.5],
    [3, 9],
  ];
  const tentGeo = track(new THREE.ConeGeometry(0.42, 0.85, 4));
  const tentMat = track(new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.5, emissive: 0x6a5200, emissiveIntensity: 0.6 }));
  const tags: THREE.Sprite[] = [];
  evidence.forEach(([x, z], i) => {
    const tent = new THREE.Mesh(tentGeo, tentMat);
    tent.position.set(x, 0.42, z);
    tent.rotation.y = Math.PI / 4;
    group.add(tent);
    const tex = track(numberSprite(i + 1));
    const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
    sp.position.set(x, 1.7, z);
    sp.scale.set(0.9, 0.9, 1);
    group.add(sp);
    tags.push(sp);
  });

  // police tape around the scene
  const corners: [number, number][] = [[-16, -13], [20, -13], [20, 12], [-16, 12]];
  const postMat = track(new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7 }));
  const postGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8));
  corners.forEach(([x, z], i) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x, 0.7, z);
    group.add(p);
    const [nx, nz] = corners[(i + 1) % 4];
    const len = Math.hypot(nx - x, nz - z);
    const tapeTex = track(tapeTexture());
    tapeTex.repeat.set(len / 3, 1);
    const t = new THREE.Mesh(
      track(new THREE.PlaneGeometry(len, 0.14)),
      track(new THREE.MeshBasicMaterial({ map: tapeTex, side: THREE.DoubleSide }))
    );
    t.position.set((x + nx) / 2, 1.05, (z + nz) / 2);
    t.rotation.y = -Math.atan2(nz - z, nx - x);
    group.add(t);
  });

  // the scanner: a tripod, and a ring of light that sweeps the scene
  const scanner = new THREE.Group();
  scanner.position.set(-11, 0, 10);
  const legGeo = track(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(legGeo, postMat);
    leg.position.set(Math.cos(a) * 0.4, 0.7, Math.sin(a) * 0.4);
    leg.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);
    scanner.add(leg);
  }
  const head2 = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 20)),
    track(new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.4 }))
  );
  head2.position.y = 1.6;
  scanner.add(head2);
  const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 10, 8)), track(new THREE.MeshBasicMaterial({ color: 0x5ad1c4, toneMapped: false })));
  eye.position.set(0.2, 1.6, 0);
  scanner.add(eye);
  group.add(scanner);
  const scanMat = track(new THREE.MeshBasicMaterial({ color: 0x5ad1c4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const scan = new THREE.Mesh(track(new THREE.RingGeometry(0.97, 1, 96)), scanMat);
  scan.rotation.x = -Math.PI / 2;
  scan.position.set(-11, 0.1, 10);
  group.add(scan);

  // a police car at the kerb, lights going
  const cop = new THREE.Group();
  cop.position.set(-19, 0, -6.2);
  cop.rotation.y = 0.05;
  const copBody = new THREE.Mesh(bodyGeo, track(new THREE.MeshPhysicalMaterial({ color: 0xf0f2f5, roughness: 0.35, metalness: 0.4, clearcoat: 0.7 })));
  copBody.position.y = 0.78;
  const copCab = new THREE.Mesh(cabGeo, glassMat);
  copCab.position.set(-0.2, 1.46, 0);
  const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(4.42, 0.22, 1.92)), track(new THREE.MeshStandardMaterial({ color: 0x1b3f9a, roughness: 0.5 })));
  stripe.position.y = 0.72;
  cop.add(copBody, copCab, stripe);
  const redMat = track(new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }));
  const blueMat = track(new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false }));
  const barGeo = track(new THREE.BoxGeometry(0.34, 0.12, 0.5));
  const redL = new THREE.Mesh(barGeo, redMat);
  redL.position.set(-0.2, 1.93, -0.4);
  const blueL = new THREE.Mesh(barGeo, blueMat);
  blueL.position.set(-0.2, 1.93, 0.4);
  cop.add(redL, blueL);
  group.add(cop);
  const flashMat = (color: number) =>
    track(new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flashGeo = track(new THREE.PlaneGeometry(1, 1));
  const redFlash = new THREE.Mesh(flashGeo, flashMat(0xff2a3a));
  const blueFlash = new THREE.Mesh(flashGeo, flashMat(0x2a6bff));
  for (const f of [redFlash, blueFlash]) {
    f.rotation.x = -Math.PI / 2;
    f.scale.set(22, 22, 1);
    f.position.set(-19, 0.1, -6.2);
    group.add(f);
  }

  // ---- the way into the case study ----
  const gate = buildGate({
    id: "crash-capsule",
    slug: "crash-capsule",
    title: "CRASH CAPSULE",
    subtitle: "EVIDENCE RECONSTRUCTION · OPEN CASE STUDY",
    width: 26,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 5.5, -24);
  group.add(gate.group);

  // ---- per-frame ----
  const euler = new THREE.Euler();
  const update = (time: number, dt: number) => {
    gate.update(dt);
    facade.uniforms.uTime.value = time;
    const tt = time % 10;
    let u: number;
    if (tt < 7.2) u = tt / 7.2;
    else if (tt < 9.6) u = 1 - easeInOut((tt - 7.2) / 2.4);
    else u = 0;

    placePose(carA, poseA(u));
    placePose(carB, poseB(u));
    head.position.x = -30 + u * 60;

    const k = clamp((u - 0.5) / 0.22);
    ring.visible = k > 0 && k < 1;
    ring.scale.setScalar(0.6 + k * 15);
    ringMat.opacity = (1 - k) * 0.9;

    for (let i = 0; i < DEB; i++) {
      const d = dirs[i];
      const kk = clamp((u - 0.5) / 0.5);
      const dist = (1 - Math.pow(1 - kk, 2.4)) * d.sp * 1.6;
      m4.compose(
        v.set(d.dx * dist, 0.1 + (kk > 0 && kk < 0.2 ? Math.sin((kk / 0.2) * Math.PI) * 1.2 : 0), d.dz * dist),
        q.setFromEuler(euler.set(0, d.sp2 + kk * 3, 0)),
        sc.setScalar(kk > 0 ? d.sc : 0)
      );
      deb.setMatrixAt(i, m4);
    }
    deb.instanceMatrix.needsUpdate = true;

    // the scanner sweeps every 7 s; evidence markers swell as it passes
    const s = (time % 7) / 7;
    const sr = s * 46;
    scan.scale.setScalar(Math.max(sr, 0.01));
    scanMat.opacity = (1 - s) * 0.55 * smooth(0, 0.04, s);
    evidence.forEach(([x, z], i) => {
      const dd = Math.hypot(x + 11, z - 10);
      const near = Math.max(0, 1 - Math.abs(dd - sr) / 4);
      tags[i].scale.setScalar(0.9 + near * 0.6);
    });

    // emergency lights
    const flip = Math.floor(time * 4) % 2;
    redL.visible = flip === 0;
    blueL.visible = flip === 1;
    (redFlash.material as THREE.MeshBasicMaterial).opacity = flip === 0 ? 0.5 : 0;
    (blueFlash.material as THREE.MeshBasicMaterial).opacity = flip === 1 ? 0.5 : 0;
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "crash-capsule"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
