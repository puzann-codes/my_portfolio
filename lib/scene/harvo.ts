import * as THREE from "three";
import { clamp, rng, smoothstep, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture, linkBuilder, pulseMaterial } from "./pulse";
import { makeTerrain } from "./terrain";

/**
 * Stage: Harvo, a digital supply chain from farm to buyer.
 * A patchwork of fields at golden hour. Produce leaves each farm in crates
 * along a lit, direct route to the market hall and the buyers beyond it,
 * while a faint, grey, winding route through anonymous middle steps stays
 * dim in the background: the thing the platform is there to shorten.
 * Only the idea comes from the project's own description (listings, orders,
 * status tracking, direct farmer-to-buyer); the landscape is a metaphor.
 */

const height = (x: number, z: number) => {
  const swell = 2.4 * Math.sin(x * 0.034 + 1.3) * Math.cos(z * 0.028) + 1.3 * Math.sin(x * 0.085 + z * 0.06) + 0.7 * Math.sin(z * 0.11 + 2);
  const lane = smoothstep(26, 6, Math.abs(x)); // the valley the market sits in
  const rise = smoothstep(-30, -170, z) * 14 + smoothstep(70, 190, Math.abs(x)) * 10;
  return swell * (1 - 0.55 * lane) + rise - 1.2;
};

export function buildHarvo(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const R = rng(61);
  const tmp = new THREE.Color();

  // ---- land ----
  const terr = makeTerrain({
    size: 240,
    seg: high ? 120 : 70,
    height,
    color: (h, x, z) => {
      const patch = Math.sin(x * 0.07) * Math.cos(z * 0.06) + Math.sin(x * 0.17 + z * 0.12) * 0.5;
      tmp.setHex(0x4f7a38).lerp(new THREE.Color(0xc9a24a), clamp(patch * 0.5 + 0.5));
      tmp.lerp(new THREE.Color(0x8c8a6a), clamp((h - 8) / 12));
      return tmp.clone().multiplyScalar(0.85 + 0.15 * Math.sin(x * 0.4 + z * 0.3));
    },
  });
  track(terr.geometry);
  track(terr.material);
  group.add(terr.mesh);
  const at = (x: number, z: number, lift = 0) => new THREE.Vector3(x, height(x, z) + lift, z);

  // ---- farms ----
  const farms = [
    { x: -62, z: 22 },
    { x: -38, z: 52 },
    { x: -16, z: 14 },
    { x: 20, z: 46 },
    { x: 44, z: 12 },
    { x: 68, z: 40 },
  ];
  const MARKET = at(0, -44);
  const wallMat = track(new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.9 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: 0xb8502f, roughness: 0.8 }));
  const houseGeo = track(new THREE.BoxGeometry(5, 3.4, 4));
  const roofGeo = track(new THREE.ConeGeometry(4.1, 2.2, 4));
  roofGeo.rotateY(Math.PI / 4);
  for (const f of farms) {
    const p = at(f.x, f.z);
    const h = new THREE.Mesh(houseGeo, wallMat);
    h.position.copy(p).setY(p.y + 1.7);
    group.add(h);
    const r = new THREE.Mesh(roofGeo, roofMat);
    r.position.copy(p).setY(p.y + 3.4 + 1.1);
    group.add(r);
    // fields: rows of crop
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const rx = f.x + 10 + i * 1.7;
      const row = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.9, 0.35, 13)),
        track(new THREE.MeshStandardMaterial({ color: i % 2 ? 0xd3b050 : 0x7ea84a, roughness: 0.9 }))
      );
      const rp = at(rx, f.z - 2, 0.18);
      row.position.copy(rp);
      group.add(row);
    }
  }

  // ---- market hall ----
  const hall = new THREE.Group();
  hall.position.copy(MARKET);
  const body = new THREE.Mesh(track(new THREE.BoxGeometry(26, 7, 11)), track(new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.85 })));
  body.position.y = 3.5;
  hall.add(body);
  const awnC = document.createElement("canvas");
  awnC.width = 256;
  awnC.height = 64;
  const actx = awnC.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    actx.fillStyle = i % 2 ? "#f5efe0" : "#c8553a";
    actx.fillRect(i * 32, 0, 32, 64);
  }
  const awnTex = track(new THREE.CanvasTexture(awnC));
  awnTex.colorSpace = THREE.SRGBColorSpace;
  const awning = new THREE.Mesh(track(new THREE.BoxGeometry(27, 0.5, 5)), track(new THREE.MeshStandardMaterial({ map: awnTex, roughness: 0.8 })));
  awning.position.set(0, 5.6, 7.6);
  awning.rotation.x = 0.28;
  hall.add(awning);
  const lintel = new THREE.Mesh(track(new THREE.BoxGeometry(26.4, 0.6, 11.4)), track(new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 })));
  lintel.position.y = 7.2;
  hall.add(lintel);
  group.add(hall);

  // buyers beyond the market: small lit squares on the far slope
  const buyers = [-22, 0, 24].map((x) => at(x, -86, 1.2));
  const buyerMat = track(new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
  const buyerGeo = track(new THREE.BoxGeometry(3, 2.4, 3));
  for (const b of buyers) {
    const m = new THREE.Mesh(buyerGeo, buyerMat);
    m.position.copy(b);
    group.add(m);
    const g = new THREE.Sprite(
      track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc870, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    g.position.copy(b).setY(b.y + 0.5);
    g.scale.setScalar(14);
    group.add(g);
  }

  // ---- routes: direct (lit) and the grey detour ----
  const lb = linkBuilder();
  const curves: THREE.CatmullRomCurve3[] = [];
  const door = MARKET.clone().add(new THREE.Vector3(0, 0.6, 6.5));
  farms.forEach((f, i) => {
    const s = at(f.x, f.z + 3, 0.5);
    const mid = at((f.x + door.x) / 2 + (R() - 0.5) * 8, (f.z + door.z) / 2, 0.5);
    const c = new THREE.CatmullRomCurve3([s, mid, at(door.x + (f.x > 0 ? 3 : -3), door.z + 3, 0.5), door.clone()]);
    curves.push(c);
    const ca = new THREE.Color(0xffd27a);
    const cb = new THREE.Color(0xfff2c8);
    const pts = c.getPoints(36);
    for (let k = 0; k < pts.length - 1; k++) lb.add(pts[k], pts[k + 1], ca, cb, (i * 0.17 + k * 0.001) % 1);
  });
  // from the market on to each buyer
  buyers.forEach((b, i) => {
    const c = new THREE.CatmullRomCurve3([door.clone().setY(door.y + 0.6), at(b.x * 0.5, -62, 1.4), b.clone().setY(b.y + 1)]);
    curves.push(c);
    const pts = c.getPoints(24);
    for (let k = 0; k < pts.length - 1; k++) lb.add(pts[k], pts[k + 1], new THREE.Color(0xfff2c8), new THREE.Color(0xffffff), 0.1 + i * 0.2);
  });
  const routeMat = track(pulseMaterial({ base: 0.5, speed: 0.22 }));
  const routes = new THREE.LineSegments(track(lb.geometry()), routeMat);
  routes.frustumCulled = false;
  group.add(routes);

  // the detour: one winding grey path through anonymous steps
  const detour = new THREE.CatmullRomCurve3(
    [at(-62, 25, 0.4), at(-90, 0, 0.4), at(-48, -20, 0.4), at(-70, -42, 0.4), at(-34, -50, 0.4), at(-18, -44, 0.4)],
    false,
    "catmullrom",
    0.6
  );
  const dGeo = track(new THREE.BufferGeometry().setFromPoints(detour.getPoints(80)));
  const dLine = new THREE.Line(dGeo, track(new THREE.LineDashedMaterial({ color: 0x8c8a86, dashSize: 1.4, gapSize: 1.2, transparent: true, opacity: 0.55 })));
  dLine.computeLineDistances();
  group.add(dLine);
  for (const t of [0.22, 0.5, 0.78]) {
    const p = detour.getPointAt(t);
    const ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(1.1, 0.12, 8, 24)),
      track(new THREE.MeshBasicMaterial({ color: 0x9c9a94, transparent: true, opacity: 0.7 }))
    );
    ring.position.copy(p).setY(p.y + 1.4);
    group.add(ring);
  }

  // ---- crates on the move ----
  const NC = 24;
  const crateGeo = track(new THREE.BoxGeometry(1.3, 0.9, 1.3));
  const crateMat = track(new THREE.MeshStandardMaterial({ color: 0xc58a3e, roughness: 0.7, emissive: 0x4a2a05, emissiveIntensity: 0.5 }));
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, NC);
  crates.frustumCulled = false;
  group.add(crates);
  const crateRoute = Array.from({ length: NC }, (_, i) => i % farms.length);
  const crateOff = Array.from({ length: NC }, (_, i) => (i / NC + (i % 3) * 0.13) % 1);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  // ---- labels ----
  const labels: THREE.Object3D[] = [];
  const label = (text: string, p: THREE.Vector3, w: number) => {
    const l = textPlane(text, { width: w, px: 64, letterSpacing: 0.12, weight: 600, color: "#fff2d6" });
    l.position.copy(p);
    group.add(l);
    tracked.push(l.geometry, l.material);
    labels.push(l);
  };
  label("LISTED", at(farms[2].x, farms[2].z, 9), 7);
  label("ORDERED", at(door.x, door.z, 15), 8);
  label("DELIVERED", at(buyers[1].x, -86, 8), 9);
  label("THE LONG WAY", at(-62, -4, 6), 10);

  // ---- gate ----
  const gate = buildGate({
    id: "harvo",
    slug: "harvo",
    title: "HARVO",
    subtitle: "FARM TO BUYER · OPEN CASE STUDY",
    width: 30,
    fonts: opts.fonts,
    tone: "dark",
  });
  gate.group.position.set(0, 26, -52);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    gate.update(dt);
    routeMat.uniforms.uTime.value = time;
    for (let i = 0; i < NC; i++) {
      const c = curves[crateRoute[i]];
      const f = (time * 0.045 + crateOff[i]) % 1;
      c.getPointAt(f, v);
      v.y += 0.55 + Math.sin(time * 3 + i) * 0.02;
      const tan = c.getTangentAt(f);
      q.setFromUnitVectors(up, up);
      q.setFromAxisAngle(up, Math.atan2(tan.x, tan.z));
      sc.setScalar(f < 0.04 ? f / 0.04 : f > 0.94 ? (1 - f) / 0.06 : 1);
      m4.compose(v, q, sc);
      crates.setMatrixAt(i, m4);
    }
    crates.instanceMatrix.needsUpdate = true;
    for (const l of labels) l.lookAt(cam.x, l.position.y, cam.z);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "harvo"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
      crates.dispose();
    },
  };
}
