import * as THREE from "three";
import { clamp, rng, textPlane } from "./util";

/**
 * Stage 3 — the city grid (Sunūwā, civic technology). A dark architectural
 * model: extruded blocks with white edge lines, a clear central avenue for
 * the camera, light beacons, and data pulses running along the streets.
 */
export function buildCity(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(5);

  const N = high ? 17 : 13;
  const pitch = 8;
  const half = (N - 1) / 2;
  const extent = (N * pitch) / 2;

  type B = { x: number; z: number; w: number; d: number; h: number };
  const boxes: B[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === half) continue; // the avenue the camera flies down
      const cx = (i - half) * pitch;
      const cz = (j - half) * pitch;
      const dist = Math.hypot(cx, cz) / extent;
      const falloff = clamp(1.15 - dist, 0.12, 1);
      const count = 1 + Math.floor(R() * 2.6);
      for (let k = 0; k < count; k++) {
        const w = 2 + R() * 2.4;
        const d = 2 + R() * 2.4;
        const ox = (R() - 0.5) * (5.2 - w);
        const oz = (R() - 0.5) * (5.2 - d);
        let h = 1.2 + Math.pow(R(), 2.3) * 10 * falloff;
        if (dist < 0.2 && k === 0) h = Math.min(17, h + 5 + R() * 6);
        boxes.push({ x: cx + ox, z: cz + oz, w, d, h });
      }
    }
  }

  // solids
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.15 });
  const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  boxes.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    col.setScalar(0.05 + (b.h / 17) * 0.1 + R() * 0.02);
    mesh.setColorAt(i, col);
  });
  group.add(mesh);
  tracked.push(geo, mat, mesh);

  // edges of every box, merged into one draw call
  const ev: number[] = [];
  for (const b of boxes) {
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    const z0 = b.z - b.d / 2;
    const z1 = b.z + b.d / 2;
    const y1 = b.h;
    const c = [
      [x0, 0, z0],
      [x1, 0, z0],
      [x1, 0, z1],
      [x0, 0, z1],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const e = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, bb] of e) ev.push(...c[a], ...c[bb]);
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute("position", new THREE.Float32BufferAttribute(ev, 3));
  const eMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, fog: true });
  group.add(new THREE.LineSegments(eGeo, eMat));
  tracked.push(eGeo, eMat);

  // ground + street lines
  const gGeo = new THREE.PlaneGeometry(extent * 3, extent * 3);
  const gMat = new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 1 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);
  tracked.push(gGeo, gMat);

  const sl: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = (i - N / 2) * pitch;
    sl.push(p, 0.02, -extent, p, 0.02, extent, -extent, 0.02, p, extent, 0.02, p);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.Float32BufferAttribute(sl, 3));
  const sMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, fog: true });
  group.add(new THREE.LineSegments(sGeo, sMat));
  tracked.push(sGeo, sMat);

  // beacons: vertical hairlines that fade to black
  const bp: number[] = [];
  const bc: number[] = [];
  for (let i = 0; i < 9; i++) {
    const b = boxes[Math.floor(R() * boxes.length)];
    bp.push(b.x, b.h, b.z, b.x, b.h + 38 + R() * 30, b.z);
    bc.push(1, 1, 1, 0, 0, 0);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  bGeo.setAttribute("color", new THREE.Float32BufferAttribute(bc, 3));
  const bMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: true });
  group.add(new THREE.LineSegments(bGeo, bMat));
  tracked.push(bGeo, bMat);

  // data pulses along streets
  const P = high ? 170 : 90;
  const pPos = new Float32Array(P * 3);
  const pulses = Array.from({ length: P }, () => ({
    axis: R() < 0.5 ? 0 : 1,
    line: Math.floor(R() * (N + 1)),
    off: (R() - 0.5) * extent * 2,
    speed: (R() < 0.5 ? -1 : 1) * (5 + R() * 9),
  }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.1,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  group.add(new THREE.Points(pGeo, pMat));
  tracked.push(pGeo, pMat);

  // district ring, pulsing
  const ringGeo = new THREE.RingGeometry(9, 9.18, 72);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    fog: true,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(14, 0.06, -10);
  group.add(ring);
  tracked.push(ringGeo, ringMat);

  // skyline title
  const title = textPlane("SUNŪWĀ", {
    width: 104,
    font: opts.fonts.hero,
    weight: 900,
    px: 200,
    letterSpacing: 0.02,
  });
  title.position.set(0, 30, -extent - 4);
  group.add(title);
  const sub = textPlane("CIVIC TECHNOLOGY", { width: 36, px: 90, letterSpacing: 0.3, weight: 600, color: "#c9c9c4" });
  sub.position.set(0, 18, -extent - 4);
  group.add(sub);
  tracked.push(title.geometry, title.material, sub.geometry, sub.material);

  const update = (time: number, dt: number) => {
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      p.off += p.speed * dt;
      if (p.off > extent) p.off -= extent * 2;
      if (p.off < -extent) p.off += extent * 2;
      const line = (p.line - N / 2) * pitch;
      if (p.axis === 0) {
        pPos[i * 3] = p.off;
        pPos[i * 3 + 2] = line;
      } else {
        pPos[i * 3] = line;
        pPos[i * 3 + 2] = p.off;
      }
      pPos[i * 3 + 1] = 0.25;
    }
    pGeo.attributes.position.needsUpdate = true;
    ring.scale.setScalar(1 + Math.sin(time * 1.6) * 0.1 + ((time * 0.4) % 1) * 0.15);
    ringMat.opacity = 0.55 - ((time * 0.4) % 1) * 0.35;
  };

  return {
    group,
    update,
    dispose() {
      tracked.forEach((d) => d.dispose());
    },
  };
}
