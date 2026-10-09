import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clamp, easeInOut, rng, textPlane } from "./util";

/**
 * Stage 4 — accident reconstruction (Crash Capsule). A T-bone at an
 * intersection drawn like a forensic diagram: survey grid, dimension
 * lines, skid marks, ghost frames — and the two vehicles replay the
 * collision, then scrub back to the start, over and over.
 */

type Pose = { x: number; z: number; yaw: number };

const IMPACT = new THREE.Vector3(0, 0, 0);

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

export function buildCrash() {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(13);

  // ---- ground, roads, markings ----
  const gGeo = new THREE.PlaneGeometry(400, 400);
  const gMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  group.add(ground);
  tracked.push(gGeo, gMat);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95 });
  const roadA = new THREE.Mesh(new THREE.PlaneGeometry(130, 9), roadMat);
  roadA.rotation.x = -Math.PI / 2;
  roadA.position.set(0, -0.02, 0);
  const roadB = new THREE.Mesh(new THREE.PlaneGeometry(9, 130), roadMat);
  roadB.rotation.x = -Math.PI / 2;
  roadB.position.set(0, -0.019, 0);
  group.add(roadA, roadB);
  tracked.push(roadA.geometry, roadB.geometry, roadMat);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: true });
  const faint = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, fog: true });
  tracked.push(lineMat, faint);
  const segs = (pts: number[], mat: THREE.LineBasicMaterial) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    tracked.push(g);
    const l = new THREE.LineSegments(g, mat);
    group.add(l);
    return l;
  };

  // curbs + dashed centre lines + crosswalks
  const curb: number[] = [];
  for (const s of [-4.5, 4.5]) {
    curb.push(-65, 0.01, s, -4.5, 0.01, s, 4.5, 0.01, s, 65, 0.01, s);
    curb.push(s, 0.01, -65, s, 0.01, -4.5, s, 0.01, 4.5, s, 0.01, 65);
  }
  segs(curb, lineMat);
  const dash: number[] = [];
  for (let d = -62; d < 62; d += 6) {
    if (Math.abs(d) < 8) continue;
    dash.push(d, 0.01, 0, d + 3, 0.01, 0, 0, 0.01, d, 0, 0.01, d + 3);
  }
  segs(dash, lineMat);
  const cross: number[] = [];
  for (let i = -3; i <= 3; i++) {
    cross.push(i * 1.1, 0.01, 6, i * 1.1, 0.01, 8.4, i * 1.1, 0.01, -6, i * 1.1, 0.01, -8.4);
    cross.push(6, 0.01, i * 1.1, 8.4, 0.01, i * 1.1, -6, 0.01, i * 1.1, -8.4, 0.01, i * 1.1);
  }
  segs(cross, faint);

  // survey grid + concentric range rings around the point of impact
  const grid: number[] = [];
  for (let i = -10; i <= 10; i++) {
    grid.push(i * 10, 0, -100, i * 10, 0, 100, -100, 0, i * 10, 100, 0, i * 10);
  }
  segs(grid, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, fog: true }));
  const rings: number[] = [];
  for (const r of [10, 20, 30]) {
    for (let a = 0; a < 96; a++) {
      const a0 = (a / 96) * Math.PI * 2;
      const a1 = ((a + 1) / 96) * Math.PI * 2;
      if (a % 2) continue;
      rings.push(Math.cos(a0) * r, 0.01, Math.sin(a0) * r, Math.cos(a1) * r, 0.01, Math.sin(a1) * r);
    }
  }
  segs(rings, faint);

  // ---- vehicles ----
  const bodyGeo = new RoundedBoxGeometry(4.4, 0.8, 1.9, 2, 0.16);
  const cabGeo = new RoundedBoxGeometry(2.4, 0.7, 1.7, 2, 0.22);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const bodyEdges = new THREE.EdgesGeometry(bodyGeo, 30);
  const cabEdges = new THREE.EdgesGeometry(cabGeo, 30);
  tracked.push(bodyGeo, cabGeo, wheelGeo, bodyEdges, cabEdges);

  const makeCar = (color: number) => {
    const car = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
    const wm = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 });
    tracked.push(m, wm);
    const body = new THREE.Mesh(bodyGeo, m);
    body.position.y = 0.78;
    const cab = new THREE.Mesh(cabGeo, m);
    cab.position.set(-0.2, 1.45, 0);
    car.add(body, cab);
    for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(wheelGeo, wm);
      w.position.set(x, 0.38, z);
      car.add(w);
    }
    const em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    tracked.push(em);
    const e1 = new THREE.LineSegments(bodyEdges, em);
    e1.position.copy(body.position);
    const e2 = new THREE.LineSegments(cabEdges, em);
    e2.position.copy(cab.position);
    car.add(e1, e2);
    return car;
  };
  const carA = makeCar(0xe6e6e2);
  const carB = makeCar(0x232326);
  group.add(carA, carB);

  const ghostCar = (opacity: number) => {
    const g = new THREE.Group();
    const em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, fog: true });
    tracked.push(em);
    const e1 = new THREE.LineSegments(bodyEdges, em);
    e1.position.y = 0.78;
    const e2 = new THREE.LineSegments(cabEdges, em);
    e2.position.set(-0.2, 1.45, 0);
    g.add(e1, e2);
    return g;
  };
  const placePose = (o: THREE.Object3D, p: Pose) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.yaw;
  };
  [0, 0.17, 0.34].forEach((u, i) => {
    const a = ghostCar(0.12 + i * 0.1);
    placePose(a, poseA(u));
    const b = ghostCar(0.12 + i * 0.1);
    placePose(b, poseB(u));
    group.add(a, b);
  });
  [0.64, 0.82, 1].forEach((u, i) => {
    const a = ghostCar(0.34 - i * 0.09);
    placePose(a, poseA(u));
    const b = ghostCar(0.34 - i * 0.09);
    placePose(b, poseB(u));
    group.add(a, b);
  });

  // ---- skid marks (wheel tracks sampled from the poses) ----
  const skid: number[] = [];
  const track = (pose: (u: number) => Pose, u0: number, u1: number) => {
    const n = 40;
    for (const side of [-0.95, 0.95]) {
      let prev: [number, number] | null = null;
      for (let i = 0; i <= n; i++) {
        const u = u0 + ((u1 - u0) * i) / n;
        const p = pose(u);
        // rear wheel position in world space
        const lx = -1.4;
        const lz = side;
        const x = p.x + lx * Math.cos(p.yaw) + lz * Math.sin(p.yaw);
        const z = p.z - lx * Math.sin(p.yaw) + lz * Math.cos(p.yaw);
        if (prev) skid.push(prev[0], 0.03, prev[1], x, 0.03, z);
        prev = [x, z];
      }
    }
  };
  track(poseA, 0.2, 0.5);
  track(poseB, 0.24, 0.5);
  track(poseA, 0.5, 1);
  track(poseB, 0.5, 1);
  segs(skid, new THREE.LineBasicMaterial({ color: 0xcfcfca, transparent: true, opacity: 0.5, fog: true }));

  // ---- dimension lines + labels ----
  const dim: number[] = [];
  const dimLine = (x0: number, z0: number, x1: number, z1: number, tx: number, tz: number) => {
    dim.push(x0, 0.05, z0, x1, 0.05, z1);
    dim.push(x0 - tz * 0.9, 0.05, z0 - tx * 0.9, x0 + tz * 0.9, 0.05, z0 + tx * 0.9);
    dim.push(x1 - tz * 0.9, 0.05, z1 - tx * 0.9, x1 + tz * 0.9, 0.05, z1 + tx * 0.9);
  };
  dimLine(-46, -7.5, -2.4, -7.5, 0, 1);
  dimLine(8, 38, 8, 0.4, 1, 0);
  segs(dim, lineMat);

  const flatLabel = (text: string, x: number, z: number, w: number, rot = 0, color = "#f2f2ee") => {
    const l = textPlane(text, { width: w, px: 72, letterSpacing: 0.06, weight: 600, color });
    l.rotation.x = -Math.PI / 2;
    l.rotation.z = rot;
    l.position.set(x, 0.08, z);
    group.add(l);
    tracked.push(l.geometry, l.material);
  };
  flatLabel("43.6 m", -24, -10, 10);
  flatLabel("37.6 m", 12.5, 19, 10, Math.PI / 2);
  flatLabel("POINT OF IMPACT", 10.5, -2.4, 17, 0, "#ffffff");
  flatLabel("T − 3.2 s", -40, 5.4, 8, 0, "#aeaea9");
  flatLabel("T + 2.4 s", 13, -11.5, 8, 0, "#aeaea9");
  flatLabel("CRASH CAPSULE", 0, 56, 40, 0, "#ffffff");

  // timeline strip below the scene
  const tl: number[] = [-30, 0.05, 48, 30, 0.05, 48];
  for (let i = 0; i <= 12; i++) tl.push(-30 + i * 5, 0.05, 47.2, -30 + i * 5, 0.05, 48.8);
  segs(tl, lineMat);
  const headGeo = new THREE.ConeGeometry(0.9, 1.8, 3);
  headGeo.rotateX(Math.PI);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(-30, 1.2, 48);
  group.add(head);
  tracked.push(headGeo, headMat);

  // ---- impact effects ----
  const ringGeo = new THREE.RingGeometry(1, 1.07, 72);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.07, 0);
  group.add(ring);
  tracked.push(ringGeo, ringMat);

  const DEB = 44;
  const debGeo = new THREE.BoxGeometry(0.28, 0.12, 0.2);
  const debMat = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.5 });
  const deb = new THREE.InstancedMesh(debGeo, debMat, DEB);
  const dirs = Array.from({ length: DEB }, () => {
    const a = R() * Math.PI * 2;
    return { dx: Math.cos(a), dz: Math.sin(a), sp: 3 + R() * 9, sp2: R() * 6.28, sc: 0.5 + R() * 1.4 };
  });
  group.add(deb);
  tracked.push(debGeo, debMat, deb);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const update = (time: number) => {
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
    ringMat.opacity = (1 - k) * 0.8;

    for (let i = 0; i < DEB; i++) {
      const d = dirs[i];
      const kk = clamp((u - 0.5) / 0.5);
      const dist = (1 - Math.pow(1 - kk, 2.4)) * d.sp * 1.6;
      m.compose(
        new THREE.Vector3(IMPACT.x + d.dx * dist, 0.1 + (kk > 0 && kk < 0.2 ? Math.sin((kk / 0.2) * Math.PI) * 1.2 : 0), IMPACT.z + d.dz * dist),
        q.setFromEuler(e.set(0, d.sp2 + kk * 3, 0)),
        new THREE.Vector3().setScalar(kk > 0 ? d.sc : 0)
      );
      deb.setMatrixAt(i, m);
    }
    deb.instanceMatrix.needsUpdate = true;
  };

  return {
    group,
    update,
    dispose() {
      tracked.forEach((d) => d.dispose());
    },
  };
}
