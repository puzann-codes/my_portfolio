import * as THREE from "three";
import { clamp, rng, smoothstep, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture, linkBuilder, pulseMaterial } from "./pulse";

/**
 * Stage: Crash Capsule.
 * The project is a witness network: a phone records a rolling buffer, an
 * impact seals a signed capsule, nearby opted-in phones seal their own, the
 * capsules upload when the network returns, and a server verifies them and
 * scores how well they corroborate. This scene plays that sequence on a
 * loop, over an abstract road, using only what the project says it records
 * (location, speed, impact). It draws no second vehicle, no collision
 * diagram and no verdict: the project's own rule is "never invent evidence".
 *
 *  0 – 5 s    one phone rides: its GPS trace and speed are drawn as recorded
 *  5 – 5.8    an impact is detected
 *  5.8 – 8.5  a BLE ping travels out; phones it reaches each seal a capsule
 *  8.5 – 12   capsules upload to the server
 *  12 – 15    the server verifies and links them: corroboration
 *  15 – 18    hold, then the scene lets go and starts again
 */

const CYAN = 0x6fe4ff;
const AMBER = 0xffb454;
const CYCLE = 18;

export function buildCrash(opts: { fonts: { hero: string } }) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const R = rng(17);
  const billboards: THREE.Object3D[] = [];
  const faders: { mat: THREE.Material & { opacity: number }; a: number; b: number; peak: number }[] = [];

  // ---- ground ----
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(170, 170)),
    track(new THREE.MeshStandardMaterial({ color: 0x0b141c, roughness: 0.95 }))
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const grid = new THREE.GridHelper(160, 32, 0x1d4a5e, 0x12303f);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  grid.position.y = 0.03;
  group.add(grid);
  tracked.push(grid.geometry, grid.material as THREE.Material);

  // ---- the road: one curved ribbon, with a dashed centre line ----
  const road = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-70, 0, 20),
    new THREE.Vector3(-36, 0, 12),
    new THREE.Vector3(-8, 0, 6),
    new THREE.Vector3(16, 0, -3),
    new THREE.Vector3(40, 0, -16),
    new THREE.Vector3(70, 0, -34),
  ]);
  const SEG = 140;
  const rv: number[] = [];
  const ri: number[] = [];
  const side = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const p = road.getPointAt(u);
    const t = road.getTangentAt(u);
    side.set(-t.z, 0, t.x).normalize();
    rv.push(p.x + side.x * 4, 0.06, p.z + side.z * 4, p.x - side.x * 4, 0.06, p.z - side.z * 4);
    if (i < SEG) ri.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const rg = track(new THREE.BufferGeometry());
  rg.setAttribute("position", new THREE.Float32BufferAttribute(rv, 3));
  rg.setIndex(ri);
  group.add(new THREE.Mesh(rg, track(new THREE.MeshBasicMaterial({ color: 0x151d26, side: THREE.DoubleSide }))));
  const dashPts: THREE.Vector3[] = [];
  for (let i = 0; i < 70; i++) {
    const u = i / 70;
    const a = road.getPointAt(u);
    const b = road.getPointAt(Math.min(1, u + 0.008));
    dashPts.push(a.setY(0.08), b.setY(0.08));
  }
  group.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(dashPts)), track(new THREE.LineBasicMaterial({ color: 0x8aa0ae, transparent: true, opacity: 0.55 }))));

  // ---- the ride: GPS trace + speed wall, revealed as the phone moves ----
  const IMPACT_U = 0.58;
  const N = 120;
  const trace: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) trace.push(road.getPointAt((i / N) * IMPACT_U).setY(0.25));
  const traceGeo = track(new THREE.BufferGeometry().setFromPoints(trace));
  traceGeo.setDrawRange(0, 0);
  const traceLine = new THREE.Line(traceGeo, track(new THREE.LineBasicMaterial({ color: CYAN })));
  group.add(traceLine);

  const wv: number[] = [];
  const wi: number[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const p = trace[i];
    const speed = 1.6 + 6.2 * smoothstep(0, 0.85, f) + 0.35 * Math.sin(f * 48);
    wv.push(p.x, 0.25, p.z, p.x, 0.25 + speed, p.z);
    if (i < N) wi.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const wg = track(new THREE.BufferGeometry());
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wv, 3));
  wg.setIndex(wi);
  wg.setDrawRange(0, 0);
  const wallMat = track(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const wall = new THREE.Mesh(wg, wallMat);
  group.add(wall);

  const rider = new THREE.Mesh(track(new THREE.BoxGeometry(1.0, 0.16, 1.9)), track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  group.add(rider);
  const riderGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTexture(), color: CYAN, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  riderGlow.scale.setScalar(7);
  group.add(riderGlow);
  const impactPos = road.getPointAt(IMPACT_U).setY(0.25);

  // ---- impact ----
  const ringMat = track(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const impactRing = new THREE.Mesh(track(new THREE.RingGeometry(0.9, 1, 56)), ringMat);
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.position.copy(impactPos).setY(0.3);
  group.add(impactRing);
  const spike = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 14, 6)), track(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, toneMapped: false })));
  spike.position.copy(impactPos).setY(7.2);
  group.add(spike);
  const bleMat = track(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  const bleRing = new THREE.Mesh(track(new THREE.RingGeometry(0.97, 1, 72)), bleMat);
  bleRing.rotation.x = -Math.PI / 2;
  bleRing.position.copy(impactPos).setY(0.32);
  group.add(bleRing);

  // ---- witnesses: scattered, silent, until the ping reaches them ----
  const SERVER = new THREE.Vector3(impactPos.x + 2, 34, impactPos.z - 8);
  type Witness = { pos: THREE.Vector3; phone: THREE.Mesh; mat: THREE.MeshBasicMaterial; cap: THREE.Mesh; capMat: THREE.MeshBasicMaterial; dist: number; delay: number };
  const witnesses: Witness[] = [];
  const spots: [number, number][] = [[-14, -6], [-9, 15], [12, 12], [18, -14], [-2, -18], [26, 5]];
  const grey = new THREE.Color(0x56646f);
  for (const [dx, dz] of spots) {
    const pos = new THREE.Vector3(impactPos.x + dx, 0.2, impactPos.z + dz);
    const mat = track(new THREE.MeshBasicMaterial({ color: grey.getHex(), toneMapped: false }));
    const phone = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.16, 1.7)), mat);
    phone.position.copy(pos);
    phone.rotation.y = R() * 3;
    group.add(phone);
    const capMat = track(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85, wireframe: true, toneMapped: false }));
    const cap = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 1.6, 1.6)), capMat);
    cap.position.copy(pos).setY(4.2);
    cap.visible = false;
    group.add(cap);
    witnesses.push({ pos, phone, mat, cap, capMat, dist: Math.hypot(dx, dz), delay: R() * 0.4 });
  }
  // the rider's own capsule hangs over the impact
  const ownMat = track(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, wireframe: true, toneMapped: false }));
  const ownCap = new THREE.Mesh(track(new THREE.BoxGeometry(2.2, 2.2, 2.2)), ownMat);
  ownCap.position.copy(impactPos).setY(7);
  ownCap.visible = false;
  group.add(ownCap);

  // ---- the server: concentric rings that close when everything verifies ----
  const serverGroup = new THREE.Group();
  serverGroup.position.copy(SERVER);
  const rings: THREE.Mesh[] = [];
  for (const r of [3, 5, 7.5]) {
    const m = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.12, 8, 64)), track(new THREE.MeshBasicMaterial({ color: 0x5fb6d4, transparent: true, opacity: 0.55, toneMapped: false })));
    m.rotation.x = Math.PI / 2;
    serverGroup.add(m);
    rings.push(m);
  }
  group.add(serverGroup);

  // ---- uplinks and corroboration ----
  const upB = linkBuilder();
  const all = [...witnesses.map((w) => w.cap.position.clone()), ownCap.position.clone()];
  all.forEach((p, i) => upB.add(p, SERVER, new THREE.Color(CYAN), new THREE.Color(0xffffff), (i * 0.23) % 1));
  const upMat = track(pulseMaterial({ base: 0.0, speed: 0.5 }));
  const upLines = new THREE.LineSegments(track(upB.geometry()), upMat);
  upLines.frustumCulled = false;
  upLines.visible = false;
  group.add(upLines);

  const corPts: THREE.Vector3[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) < 34) corPts.push(all[i], all[j]);
    }
  }
  const corMat = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
  group.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(corPts)), corMat));

  // ---- the sequence as a strip on the ground ----
  const stripY = 0.35;
  const stripZ = impactPos.z + 26;
  const strip = new THREE.Group();
  strip.position.set(impactPos.x - 26, stripY, stripZ);
  group.add(strip);
  const stripLine = new THREE.Mesh(track(new THREE.PlaneGeometry(52, 0.18)), track(new THREE.MeshBasicMaterial({ color: 0x3a6b80, toneMapped: false })));
  stripLine.rotation.x = -Math.PI / 2;
  stripLine.position.x = 26;
  strip.add(stripLine);
  const marker = new THREE.Mesh(track(new THREE.CircleGeometry(0.6, 20)), track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  marker.rotation.x = -Math.PI / 2;
  strip.add(marker);
  const stages: [number, string][] = [
    [0.0, "RECORD"],
    [5.8 / CYCLE, "SEAL"],
    [8.5 / CYCLE, "UPLOAD"],
    [12 / CYCLE, "VERIFY"],
  ];
  for (const [at, text] of stages) {
    const l = textPlane(text, { width: 7, px: 64, letterSpacing: 0.16, weight: 600, color: "#bfeaf6" });
    l.rotation.x = -Math.PI / 2;
    l.position.set(at * 52 + 3.4, 0, 1.4);
    strip.add(l);
    tracked.push(l.geometry, l.material);
    const t = new THREE.Mesh(track(new THREE.PlaneGeometry(0.16, 0.9)), track(new THREE.MeshBasicMaterial({ color: 0x8fd3e8, toneMapped: false })));
    t.rotation.x = -Math.PI / 2;
    t.position.set(at * 52, 0, 0);
    strip.add(t);
  }

  // ---- labels that appear with their phase ----
  const phaseLabel = (text: string, p: THREE.Vector3, w: number, a: number, b: number, color = "#e8fbff") => {
    const l = textPlane(text, { width: w, px: 64, letterSpacing: 0.12, weight: 600, color });
    l.position.copy(p);
    group.add(l);
    tracked.push(l.geometry, l.material);
    billboards.push(l);
    faders.push({ mat: l.material as THREE.Material & { opacity: number }, a, b, peak: 0.95 });
  };
  phaseLabel("RECORDING · GPS · SPEED · MOTION", impactPos.clone().add(new THREE.Vector3(-22, 12, 4)), 22, 0.5, 5.4);
  phaseLabel("IMPACT DETECTED", impactPos.clone().add(new THREE.Vector3(0, 17, 0)), 13, 5.0, 7.2, "#ffd9a0");
  phaseLabel("SEALED · SHA-256 · SIGNED", impactPos.clone().add(new THREE.Vector3(0, 11, 0)), 18, 6.8, 11.5);
  phaseLabel("VERIFIED · CORROBORATED ACROSS DEVICES", SERVER.clone().add(new THREE.Vector3(0, 7, 0)), 30, 12.5, 17);
  phaseLabel("DOES NOT DECIDE FAULT", impactPos.clone().add(new THREE.Vector3(0, -2, 17)), 17, 13.5, 17.5, "#9fc9d8");

  const gate = buildGate({
    id: "crash-capsule",
    slug: "crash-capsule",
    title: "CRASH CAPSULE",
    subtitle: "TAMPER-EVIDENT CRASH EVIDENCE · OPEN CASE STUDY",
    width: 32,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 12, -34);
  group.add(gate.group);

  const tmpC = new THREE.Color();
  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    gate.update(dt);
    const t = time % CYCLE;
    const fade = 1 - smoothstep(16.8, 18, t);
    const rideU = clamp(t / 5);
    const shown = Math.floor(rideU * N);
    traceGeo.setDrawRange(0, t < 16.8 ? shown + 1 : 0);
    wg.setDrawRange(0, t < 16.8 ? shown * 6 : 0);
    const rp = road.getPointAt(rideU * IMPACT_U);
    rider.position.set(rp.x, 0.32, rp.z);
    riderGlow.position.set(rp.x, 0.6, rp.z);
    const rt = road.getTangentAt(rideU * IMPACT_U);
    rider.rotation.y = Math.atan2(rt.x, rt.z);
    (riderGlow.material as THREE.SpriteMaterial).opacity = 0.9 * fade;
    wallMat.opacity = 0.22 * fade;

    // impact
    const ik = clamp((t - 5) / 0.9);
    ringMat.opacity = (1 - ik) * 0.9 * (t > 5 ? 1 : 0);
    impactRing.scale.setScalar(0.4 + ik * 11);
    (spike.material as THREE.MeshBasicMaterial).opacity = t > 5 && t < 9 ? 0.8 * (1 - smoothstep(6.5, 9, t)) : 0;

    // ble ping: a ring that outruns the witnesses
    const bk = clamp((t - 5.8) / 2.7);
    const bleR = bk * 34;
    bleRing.scale.setScalar(Math.max(0.01, bleR));
    bleMat.opacity = t > 5.8 && t < 8.7 ? 0.55 * (1 - bk) : 0;

    // witnesses
    const uploaded = smoothstep(8.5, 11, t);
    for (const w of witnesses) {
      const reached = t > 5.8 && bleR > w.dist;
      tmpC.copy(grey).lerp(new THREE.Color(CYAN), reached ? 1 : 0);
      w.mat.color.copy(tmpC);
      const sealT = clamp((t - (5.8 + (w.dist / 34) * 2.7 + w.delay)) / 0.7);
      w.cap.visible = reached && fade > 0.01;
      w.cap.scale.setScalar(Math.max(0.001, sealT));
      w.cap.rotation.y = time * 0.6;
      w.capMat.opacity = 0.85 * fade;
      w.cap.position.y = 4.2 + 0.2 * Math.sin(time * 1.4 + w.dist);
    }
    ownCap.visible = t > 6.2 && fade > 0.01;
    ownCap.scale.setScalar(clamp((t - 6.2) / 0.7) * 1);
    ownCap.rotation.y = -time * 0.5;
    ownMat.opacity = 0.9 * fade;

    // upload + verify
    upLines.visible = t > 8.5 && fade > 0.01;
    upMat.uniforms.uTime.value = time;
    upMat.uniforms.uBase.value = 0.35 * uploaded * fade;
    upMat.uniforms.uHead.value = fade;
    const ver = smoothstep(12, 13.4, t) * fade;
    rings.forEach((r, i) => {
      (r.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * ver * (i === 0 ? 1 : 0.7);
      r.rotation.z = time * (0.2 + i * 0.15) * (i % 2 ? -1 : 1);
      (r.material as THREE.MeshBasicMaterial).color.setHex(ver > 0.5 ? 0xbff4ff : 0x5fb6d4);
    });
    corMat.opacity = 0.5 * ver;

    marker.position.x = (t / CYCLE) * 52;
    for (const f of faders) {
      const k = smoothstep(f.a, f.a + 0.5, t) * (1 - smoothstep(f.b - 0.6, f.b, t));
      f.mat.opacity = f.peak * k;
    }
    for (const b of billboards) b.lookAt(cam.x, b.position.y, cam.z);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
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
