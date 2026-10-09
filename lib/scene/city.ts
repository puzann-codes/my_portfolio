import * as THREE from "three";
import { canvasTexture, clamp, makeCanvas, rng } from "./util";
import { buildGate } from "./gate";
import { facadeMaterial } from "./facade";
import { glowTexture } from "./pulse";

/**
 * Stage — Sunūwā, the citizen–government complaint platform, as a city at
 * dusk. The idea of the product is the picture: homes all over town send
 * complaints (coloured packets of light) along arcs to the department that
 * should handle them, each department with its own colour. Around that,
 * enough life to read as a place: lit windows, traffic with headlights, lamp
 * pools on the street, trees, a domed civic hall at the end of the avenue
 * and hills against the sunset.
 */

const DEPT_COLORS = [0x2fd1c4, 0xffb347, 0xff6f91, 0x9b8cff]; // teal, amber, rose, violet
const FACADES = [0xcdbda2, 0xb97c5c, 0x8fa7ba, 0xd9d3c4, 0x707e8d, 0xc9906c, 0xa6b59b, 0xe0c9a6];
const CAR_COLORS = [0xd8d8d0, 0x2b2f36, 0xb53a35, 0x2f6fa8, 0xd9a43a, 0x3e8a64, 0x8a8f99];
const TREE_COLORS = [0x3f6b4a, 0x4d7c52, 0x2f5a46, 0x5f8a4a, 0xb8703a, 0x3a6a5a];

function roadTexture(N: number) {
  const size = 2048;
  const cs = size / N;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#262830";
  ctx.fillRect(0, 0, size, size);
  // speckle
  const R = rng(4);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${R() < 0.5 ? "255,255,255" : "0,0,0"},${0.02 + R() * 0.04})`;
    ctx.fillRect(R() * size, R() * size, 2, 2);
  }
  // blocks: sidewalk ring + courtyard
  const inset = (3 / 8) * cs * 0.5;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = i * cs + inset;
      const y = j * cs + inset;
      const w = cs - inset * 2;
      ctx.fillStyle = "#4a4743";
      ctx.beginPath();
      ctx.roundRect(x, y, w, w, 6);
      ctx.fill();
      ctx.fillStyle = "#35342f";
      ctx.beginPath();
      ctx.roundRect(x + 9, y + 9, w - 18, w - 18, 4);
      ctx.fill();
    }
  }
  // lane dashes + crosswalks
  ctx.strokeStyle = "rgba(240,200,110,0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 14]);
  for (let k = 0; k <= N; k++) {
    ctx.beginPath();
    ctx.moveTo(k * cs, 0);
    ctx.lineTo(k * cs, size);
    ctx.moveTo(0, k * cs);
    ctx.lineTo(size, k * cs);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(235,235,230,0.55)";
  const sw = (3 / 8) * cs * 0.5;
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N; b++) {
      const cx = a * cs;
      const cy = b * cs;
      for (let s = -3; s <= 3; s++) {
        ctx.fillRect(cx + s * 7 - 2, cy - sw - 16, 4, 12);
        ctx.fillRect(cx + s * 7 - 2, cy + sw + 4, 4, 12);
        ctx.fillRect(cx - sw - 16, cy + s * 7 - 2, 12, 4);
        ctx.fillRect(cx + sw + 4, cy + s * 7 - 2, 12, 4);
      }
    }
  }
  const t = canvasTexture(c, 8);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function buildCity(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(5);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };

  const N = high ? 17 : 13;
  const pitch = 8;
  const half = (N - 1) / 2;
  const extent = (N * pitch) / 2;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  // ---------- ground ----------
  const roadTex = track(roadTexture(N));
  const roads = new THREE.Mesh(
    track(new THREE.PlaneGeometry(N * pitch, N * pitch)),
    track(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, metalness: 0.05 }))
  );
  roads.rotation.x = -Math.PI / 2;
  group.add(roads);
  const apron = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1400, 1400)),
    track(new THREE.MeshStandardMaterial({ color: 0x241c26, roughness: 1 }))
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  group.add(apron);

  // ---------- buildings ----------
  type B = { x: number; z: number; w: number; d: number; h: number };
  const boxes: B[] = [];
  const depts: { x: number; z: number; h: number; w: number }[] = [];
  const deptBlocks = [
    [-3, -2],
    [3, -3],
    [-4, 3],
    [4, 4],
  ];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === half) continue; // the avenue to the civic hall
      const cx = (i - half) * pitch;
      const cz = (j - half) * pitch;
      const di = deptBlocks.findIndex(([a, b]) => a === i - half && b === j - half);
      if (di >= 0) {
        const h = 15 + R() * 3;
        boxes.push({ x: cx, z: cz, w: 4.4, d: 4.4, h });
        depts.push({ x: cx, z: cz, h, w: 4.4 });
        continue;
      }
      const dist = Math.hypot(cx, cz) / extent;
      const falloff = clamp(1.2 - dist, 0.12, 1);
      const count = 1 + Math.floor(R() * 2.6);
      for (let k = 0; k < count; k++) {
        const w = 2 + R() * 2.4;
        const d = 2 + R() * 2.4;
        const ox = (R() - 0.5) * (5.2 - w);
        const oz = (R() - 0.5) * (5.2 - d);
        let h = 1.6 + Math.pow(R(), 2.1) * 10 * falloff;
        if (dist < 0.22 && k === 0) h = Math.min(15, h + 4 + R() * 5);
        boxes.push({ x: cx + ox, z: cz + oz, w, d, h });
      }
    }
  }
  const facade = facadeMaterial({ lit: 0.46, emit: 1.6 });
  track(facade.material);
  const bGeo = track(new THREE.BoxGeometry(1, 1, 1));
  bGeo.translate(0, 0.5, 0);
  const buildings = new THREE.InstancedMesh(bGeo, facade.material, boxes.length);
  const col = new THREE.Color();
  boxes.forEach((b, i) => {
    m4.compose(v.set(b.x, 0, b.z), q.identity(), s3.set(b.w, b.h, b.d));
    buildings.setMatrixAt(i, m4);
    col.setHex(FACADES[Math.floor(R() * FACADES.length)]).multiplyScalar(0.72 + R() * 0.3);
    buildings.setColorAt(i, col);
  });
  group.add(buildings);
  track(buildings);

  // roof caps: a darker slab on top of each building, for edge definition
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.9 }));
  const caps = new THREE.InstancedMesh(bGeo, capMat, boxes.length);
  boxes.forEach((b, i) => {
    m4.compose(v.set(b.x, b.h, b.z), q.identity(), s3.set(b.w + 0.25, 0.22, b.d + 0.25));
    caps.setMatrixAt(i, m4);
  });
  group.add(caps);
  track(caps);

  // ---------- the civic hall, at the end of the avenue ----------
  const hall = new THREE.Group();
  hall.position.set(0, 0, -extent - 8);
  const stone = track(new THREE.MeshStandardMaterial({ color: 0xdccdb0, roughness: 0.7, metalness: 0.05 }));
  const patina = track(new THREE.MeshStandardMaterial({ color: 0x5fb0a0, roughness: 0.45, metalness: 0.35 }));
  const glowStrip = track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.position.set(x, y, z);
    hall.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(30, 1.2, 17), stone, 0, 0.6, 0); // plinth
  add(new THREE.BoxGeometry(26, 7.5, 13), stone, 0, 4.95, -0.5); // body
  add(new THREE.BoxGeometry(27, 0.8, 14), stone, 0, 9.1, -0.5); // cornice
  const colGeo = track(new THREE.CylinderGeometry(0.62, 0.7, 7.5, 16));
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(colGeo, stone);
    c.position.set(-10.8 + i * 2.4, 4.95, 6.6);
    hall.add(c);
  }
  // pediment
  const ped = new THREE.Shape();
  ped.moveTo(-13, 0);
  ped.lineTo(13, 0);
  ped.lineTo(0, 4.2);
  ped.closePath();
  const pedMesh = new THREE.Mesh(track(new THREE.ExtrudeGeometry(ped, { depth: 1.2, bevelEnabled: false })), stone);
  pedMesh.position.set(0, 9.5, 6);
  hall.add(pedMesh);
  // dome on a drum
  add(new THREE.CylinderGeometry(5.2, 5.6, 3.2, 40), stone, 0, 10.9, -1);
  const dome = add(new THREE.SphereGeometry(5.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), patina, 0, 12.5, -1);
  dome.scale.y = 0.95;
  add(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 12), patina, 0, 18.2, -1);
  add(new THREE.SphereGeometry(0.55, 14, 10), glowStrip, 0, 19.7, -1);
  // lit trims: window slots and cornice line
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(1.5, 3.4, 0.2), glowStrip, -9.5 + i * 3.8, 5, 6.1 - 0.0);
  add(new THREE.BoxGeometry(27.2, 0.14, 0.14), glowStrip, 0, 8.6, 6.6);
  group.add(hall);
  // warm uplight wash on the facade: a few soft additive cones read as floodlights
  const flood = track(
    new THREE.MeshBasicMaterial({
      map: track(glowTexture()),
      color: 0xffb870,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const floodMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(44, 26)), flood);
  floodMesh.position.set(0, 7, -extent - 8 + 7.6);
  group.add(floodMesh);

  // ---------- trees ----------
  const tGeo = track(new THREE.IcosahedronGeometry(0.95, 1));
  tGeo.translate(0, 1.7, 0);
  const trunkGeo = track(new THREE.CylinderGeometry(0.1, 0.14, 1.5, 6));
  trunkGeo.translate(0, 0.75, 0);
  const treeN = high ? 520 : 240;
  const trees = new THREE.InstancedMesh(tGeo, track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true })), treeN);
  const trunks = new THREE.InstancedMesh(trunkGeo, track(new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 })), treeN);
  for (let i = 0; i < treeN; i++) {
    const bi = Math.floor(R() * N);
    const bj = Math.floor(R() * N);
    if (bi === half) {
      // the avenue gets two tidy rows
    }
    const cx = (bi - half) * pitch;
    const cz = (bj - half) * pitch;
    const side = Math.floor(R() * 4);
    const off = (R() - 0.5) * 4.4;
    const edge = 2.9;
    const x = cx + (side < 2 ? off : side === 2 ? -edge : edge);
    const z = cz + (side >= 2 ? off : side === 0 ? -edge : edge);
    const sc = 0.75 + R() * 0.7;
    m4.compose(v.set(x, 0, z), q.identity(), s3.set(sc, sc, sc));
    trees.setMatrixAt(i, m4);
    trunks.setMatrixAt(i, m4);
    col.setHex(TREE_COLORS[Math.floor(R() * TREE_COLORS.length)]);
    trees.setColorAt(i, col);
  }
  group.add(trees, trunks);
  track(trees);
  track(trunks);

  // ---------- street lamps with light pools ----------
  const lampN = (N + 1) * (N + 1);
  const poleGeo = track(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6));
  poleGeo.translate(0, 1.6, 0);
  const poles = new THREE.InstancedMesh(poleGeo, track(new THREE.MeshStandardMaterial({ color: 0x1c1b22, roughness: 0.7 })), lampN);
  const heads = new THREE.InstancedMesh(
    track(new THREE.SphereGeometry(0.26, 10, 8)),
    track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })),
    lampN
  );
  const poolMat = track(
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xffb870,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const pools = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 1)), poolMat, lampN);
  let li = 0;
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N; b++) {
      const x = (a - N / 2) * pitch + 1.45;
      const z = (b - N / 2) * pitch + 1.45;
      m4.compose(v.set(x, 0, z), q.identity(), s3.set(1, 1, 1));
      poles.setMatrixAt(li, m4);
      m4.compose(v.set(x, 3.25, z), q.identity(), s3.set(1, 1, 1));
      heads.setMatrixAt(li, m4);
      m4.compose(v.set(x, 0.06, z), q.setFromEuler(e.set(-Math.PI / 2, 0, 0)), s3.set(7, 7, 1));
      pools.setMatrixAt(li, m4);
      li++;
    }
  }
  group.add(poles, heads, pools);
  track(poles);
  track(heads);
  track(pools);

  // ---------- traffic ----------
  const carN = high ? 84 : 44;
  type Car = { axis: 0 | 1; street: number; dir: 1 | -1; pos: number; speed: number };
  const cars: Car[] = Array.from({ length: carN }, () => ({
    axis: (R() < 0.5 ? 0 : 1) as 0 | 1,
    street: Math.floor(R() * (N + 1)),
    dir: (R() < 0.5 ? 1 : -1) as 1 | -1,
    pos: (R() - 0.5) * extent * 2,
    speed: 3 + R() * 5,
  }));
  const carBody = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(1.7, 0.55, 0.82)),
    track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.35 })),
    carN
  );
  const carCab = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(0.9, 0.4, 0.7)),
    track(new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.2, metalness: 0.6 })),
    carN
  );
  const lightGeo = track(new THREE.BoxGeometry(0.07, 0.12, 0.24));
  const headL = new THREE.InstancedMesh(lightGeo, track(new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false })), carN * 2);
  const tailL = new THREE.InstancedMesh(lightGeo, track(new THREE.MeshBasicMaterial({ color: 0xff3a30, toneMapped: false })), carN * 2);
  cars.forEach((c, i) => {
    col.setHex(CAR_COLORS[Math.floor(R() * CAR_COLORS.length)]);
    carBody.setColorAt(i, col);
  });
  group.add(carBody, carCab, headL, tailL);
  track(carBody);
  track(carCab);
  track(headL);
  track(tailL);

  // ---------- complaints: packets of light from homes to departments ----------
  type Flow = {
    curve: THREE.QuadraticBezierCurve3;
    color: THREE.Color;
    speed: number;
    phase: number;
    dept: number;
    last: number;
  };
  const homes = boxes.filter((b) => b.h < 8 && b.w < 4.3);
  const targets = [...depts.map((d) => new THREE.Vector3(d.x, d.h + 0.4, d.z)), new THREE.Vector3(0, 21, -extent - 8)];
  const flowN = high ? 18 : 10;
  const flows: Flow[] = Array.from({ length: flowN }, (_, i) => {
    const src = homes[Math.floor(R() * homes.length)];
    const dept = i % 4;
    const dst = targets[dept];
    const a = new THREE.Vector3(src.x, src.h + 0.3, src.z);
    const mid = a.clone().lerp(dst, 0.5);
    mid.y += 16 + R() * 14;
    return {
      curve: new THREE.QuadraticBezierCurve3(a, mid, dst.clone()),
      color: new THREE.Color(DEPT_COLORS[dept]),
      speed: 0.09 + R() * 0.1,
      phase: R(),
      dept,
      last: 0,
    };
  });
  const arcPts: number[] = [];
  const arcCols: number[] = [];
  for (const f of flows) {
    const pts = f.curve.getPoints(28);
    for (let i = 0; i < pts.length - 1; i++) {
      arcPts.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      arcCols.push(f.color.r, f.color.g, f.color.b, f.color.r, f.color.g, f.color.b);
    }
  }
  const arcGeo = track(new THREE.BufferGeometry());
  arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(arcPts, 3));
  arcGeo.setAttribute("color", new THREE.Float32BufferAttribute(arcCols, 3));
  group.add(
    new THREE.LineSegments(
      arcGeo,
      track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }))
    )
  );
  const TRAIL = 12;
  const pPos = new Float32Array(flowN * TRAIL * 3);
  const pCol = new Float32Array(flowN * TRAIL * 3);
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const packets = new THREE.Points(
    pGeo,
    track(
      new THREE.PointsMaterial({
        map: glowTexture(),
        size: 2.6,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  packets.frustumCulled = false;
  group.add(packets);

  // department towers: a coloured crown and a ring that pulses on delivery
  const crowns = depts.map((d, i) => {
    const mat = track(new THREE.MeshBasicMaterial({ color: DEPT_COLORS[i], toneMapped: false }));
    const crown = new THREE.Mesh(track(new THREE.BoxGeometry(d.w + 0.2, 0.6, d.w + 0.2)), mat);
    crown.position.set(d.x, d.h + 0.35, d.z);
    group.add(crown);
    const beacon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 9, 6)), mat);
    beacon.position.set(d.x, d.h + 5, d.z);
    group.add(beacon);
    const rMat = track(
      new THREE.MeshBasicMaterial({ color: DEPT_COLORS[i], transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(2.2, 2.5, 48)), rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.x, d.h + 0.8, d.z);
    group.add(ring);
    return { ring, rMat, pulse: 0 };
  });

  // ---------- hills against the sunset ----------
  const hillLayers: [number, number, number][] = [
    [330, 40, 0x2b2240],
    [430, 62, 0x1f1a33],
  ];
  hillLayers.forEach(([radius, height, color], li2) => {
    const seg = 160;
    const pos: number[] = [];
    const idx: number[] = [];
    const Rh = rng(70 + li2);
    let hh = 0.5;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      hh += (Rh() - 0.5) * 0.35;
      hh = clamp(hh, 0.08, 1);
      const ridge = Math.max(0.1, hh * (0.6 + 0.4 * Math.sin(a * 3.0 + li2)));
      pos.push(Math.cos(a) * radius, -8, Math.sin(a) * radius, Math.cos(a) * radius, -8 + ridge * height, Math.sin(a) * radius);
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    group.add(new THREE.Mesh(g, track(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true }))));
  });

  // ---------- the way into the case study ----------
  const gate = buildGate({
    id: "sunuwa",
    slug: "sunuwa",
    title: "SUNŪWĀ",
    subtitle: "CIVIC TECHNOLOGY · OPEN CASE STUDY",
    width: 62,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 40, -extent - 18);
  group.add(gate.group);

  // ---------- per-frame ----------
  const uTime = facade.uniforms.uTime;
  const hq = new THREE.Quaternion();
  const update = (time: number, dt: number) => {
    gate.update(dt);
    uTime.value = time;

    // traffic
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.pos += c.dir * c.speed * dt;
      if (c.pos > extent) c.pos -= extent * 2;
      if (c.pos < -extent) c.pos += extent * 2;
      const street = (c.street - N / 2) * pitch;
      // cars keep to their own side of the street
      const x = c.axis === 0 ? c.pos : street - c.dir * 0.75;
      const z = c.axis === 0 ? street + c.dir * 0.75 : c.pos;
      const yaw = c.axis === 0 ? (c.dir === 1 ? 0 : Math.PI) : c.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      hq.setFromEuler(e.set(0, yaw, 0));
      m4.compose(v.set(x, 0.4, z), hq, s3.set(1, 1, 1));
      carBody.setMatrixAt(i, m4);
      m4.compose(v.set(x, 0.78, z), hq, s3.set(1, 1, 1));
      carCab.setMatrixAt(i, m4);
      const fx = Math.cos(yaw) * 0.85;
      const fz = -Math.sin(yaw) * 0.85;
      const sx = Math.sin(yaw) * 0.28;
      const sz = Math.cos(yaw) * 0.28;
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? 1 : -1;
        m4.compose(v.set(x + fx + sx * sg, 0.45, z + fz + sz * sg), hq, s3.set(1, 1, 1));
        headL.setMatrixAt(i * 2 + s, m4);
        m4.compose(v.set(x - fx + sx * sg, 0.45, z - fz + sz * sg), hq, s3.set(1, 1, 1));
        tailL.setMatrixAt(i * 2 + s, m4);
      }
    }
    carBody.instanceMatrix.needsUpdate = true;
    carCab.instanceMatrix.needsUpdate = true;
    headL.instanceMatrix.needsUpdate = true;
    tailL.instanceMatrix.needsUpdate = true;

    // complaints in flight
    for (let i = 0; i < flows.length; i++) {
      const f = flows[i];
      const u = (time * f.speed + f.phase) % 1;
      if (u < f.last) crowns[f.dept < crowns.length ? f.dept : 0].pulse = 1;
      f.last = u;
      for (let j = 0; j < TRAIL; j++) {
        const uj = u - j * 0.013;
        const k = (i * TRAIL + j) * 3;
        if (uj < 0) {
          pPos[k] = pPos[k + 1] = pPos[k + 2] = 0;
          pCol[k] = pCol[k + 1] = pCol[k + 2] = 0;
          continue;
        }
        f.curve.getPoint(uj, v);
        pPos[k] = v.x;
        pPos[k + 1] = v.y;
        pPos[k + 2] = v.z;
        const fade = Math.pow(1 - j / TRAIL, 1.6) * (j === 0 ? 1.4 : 1);
        pCol[k] = f.color.r * fade;
        pCol[k + 1] = f.color.g * fade;
        pCol[k + 2] = f.color.b * fade;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    for (const c of crowns) {
      c.pulse = Math.max(0, c.pulse - dt * 1.3);
      c.ring.scale.setScalar(1 + (1 - c.pulse) * 4.5);
      c.rMat.opacity = c.pulse * 0.9;
    }
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "sunuwa"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
