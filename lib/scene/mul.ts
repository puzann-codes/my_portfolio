import * as THREE from "three";
import { clamp, rng, smoothstep, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture, linkBuilder, pulseMaterial } from "./pulse";
import { makeTerrain } from "./terrain";

/**
 * Stage: Mul, a spring and the question of why it is declining.
 * A hillside at first light: water comes out of rock, runs down a terraced
 * slope past a village. Above the slope, the investigation: the candidate
 * explanations named in the project's design document (rainfall, the
 * recharge area, vegetation, a road altering runoff, groundwater extraction)
 * float as orbs tied to the spring. Evidence strengthens some links and
 * dims others, and the line that survives ends at a gate marked for human
 * review: the agent recommends, a person decides.
 */

const SPRING = new THREE.Vector3(-4, 0, -6);

const height = (x: number, z: number) => {
  // a slope falling from the back (−z, high) to the valley (+z), with a bench at the spring
  const slope = smoothstep(80, -90, z) * 34;
  const ridge = Math.sin(x * 0.045 + 0.8) * 3.4 * smoothstep(-20, -80, z) + Math.sin(x * 0.11 + z * 0.07) * 1.1;
  const bench = Math.exp(-((x - SPRING.x) ** 2 + (z - SPRING.z) ** 2) / 380) * 2.5;
  const terraces = Math.round(slope / 2.2) * 2.2 * 0.45 + slope * 0.55;
  return terraces + ridge + bench - 6;
};

function streamPath(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const zs = [-6, 8, 22, 36, 52, 70];
  const xs = [-4, -9, -2, 7, 3, 10];
  zs.forEach((z, i) => pts.push(new THREE.Vector3(xs[i], height(xs[i], z) + 0.4, z)));
  return new THREE.CatmullRomCurve3(pts);
}

export function buildMul(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const R = rng(91);
  const billboards: THREE.Object3D[] = [];
  const tmp = new THREE.Color();
  const grass = new THREE.Color(0x4d7a4a);
  const dry = new THREE.Color(0x9a9a6c);
  const rock = new THREE.Color(0x7d8184);

  // ---- land ----
  const terr = makeTerrain({
    size: 240,
    seg: high ? 120 : 70,
    height,
    color: (h, x, z) => {
      tmp.copy(grass).lerp(dry, clamp(Math.sin(x * 0.05 + z * 0.04) * 0.5 + 0.35));
      tmp.lerp(rock, clamp((h - 8) / 18));
      return tmp.clone();
    },
  });
  track(terr.geometry);
  track(terr.material);
  group.add(terr.mesh);

  // ---- the spring: a mouth of stones, and a pool ----
  const stoneMat = track(new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.95 }));
  const sy = height(SPRING.x, SPRING.z);
  const stoneGeo = track(new THREE.DodecahedronGeometry(1, 0));
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 22);
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const rad = 3.2 + R() * 1.4;
    const s = 0.9 + R() * 1.1;
    e.set(R() * 3, R() * 3, R() * 3);
    q.setFromEuler(e);
    m4.compose(
      new THREE.Vector3(SPRING.x + Math.cos(a) * rad, sy + 0.2 + s * 0.3, SPRING.z - Math.abs(Math.sin(a)) * rad * 0.5),
      q,
      new THREE.Vector3(s, s * 0.8, s)
    );
    stones.setMatrixAt(i, m4);
  }
  group.add(stones);
  const pool = new THREE.Mesh(
    track(new THREE.CircleGeometry(3.6, 36)),
    track(new THREE.MeshBasicMaterial({ color: 0x6fd0d8, transparent: true, opacity: 0.85, toneMapped: false }))
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(SPRING.x, sy + 0.28, SPRING.z + 1.5);
  group.add(pool);

  // ---- the stream: a ribbon with moving light ----
  const curve = streamPath();
  const SEG = 90;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const side = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    side.set(-t.z, 0, t.x).normalize();
    const w = 1.1 + u * 1.4;
    verts.push(p.x + side.x * w, p.y + 0.55, p.z + side.z * w, p.x - side.x * w, p.y + 0.55, p.z - side.z * w);
    uvs.push(0, u, 1, u);
    if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const sGeo = track(new THREE.BufferGeometry());
  sGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  sGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  sGeo.setIndex(idx);
  const sMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFlow: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uFlow;
        void main() {
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float s = sin(vUv.y * 90.0 - uTime * 2.4 * uFlow + sin(vUv.x * 9.0) * 1.4) * 0.5 + 0.5;
          float s2 = sin(vUv.y * 40.0 - uTime * 1.5 * uFlow + vUv.x * 11.0) * 0.5 + 0.5;
          vec3 deep = vec3(0.12, 0.42, 0.52);
          vec3 lite = vec3(0.7, 0.95, 0.96);
          vec3 c = mix(deep, lite, pow(s * 0.6 + s2 * 0.4, 3.0));
          gl_FragColor = vec4(c, edge * 0.92);
        }`,
    })
  );
  const stream = new THREE.Mesh(sGeo, sMat);
  stream.renderOrder = 2;
  group.add(stream);

  // ---- terrace trees and a village ----
  const trunkGeo = track(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6));
  const crownGeo = track(new THREE.IcosahedronGeometry(1.5, 0));
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
  const crownMat = track(new THREE.MeshStandardMaterial({ color: 0x3f7a45, roughness: 0.9 }));
  const NT = high ? 46 : 24;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NT);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, NT);
  const c = new THREE.Color();
  for (let i = 0; i < NT; i++) {
    const x = (R() - 0.5) * 110;
    const z = -30 + R() * 120;
    if (Math.abs(x - SPRING.x) < 10 && z < 12) continue;
    const y = height(x, z);
    const s = 0.8 + R() * 0.9;
    m4.compose(new THREE.Vector3(x, y + 0.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y + 2.4 * s, z), q.identity(), new THREE.Vector3(s, s * 1.05, s));
    crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, c.setHex(0x3f7a45).offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.1));
  }
  group.add(trunks, crowns);

  const houseMat = track(new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.9 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.85 }));
  const winMat = track(new THREE.MeshBasicMaterial({ color: 0xffd48a, toneMapped: false }));
  const hGeo = track(new THREE.BoxGeometry(3.6, 2.6, 3));
  const rGeo = track(new THREE.ConeGeometry(3, 1.6, 4));
  rGeo.rotateY(Math.PI / 4);
  const wGeo = track(new THREE.PlaneGeometry(0.7, 0.7));
  const village = [
    [12, 56], [20, 62], [6, 66], [26, 52], [16, 72], [-2, 60],
  ];
  for (const [x, z] of village) {
    const y = height(x, z);
    const h = new THREE.Mesh(hGeo, houseMat);
    h.position.set(x, y + 1.3, z);
    const r = new THREE.Mesh(rGeo, roofMat);
    r.position.set(x, y + 3.4, z);
    const w = new THREE.Mesh(wGeo, winMat);
    w.position.set(x, y + 1.4, z + 1.52);
    group.add(h, r, w);
  }

  // ---- the investigation, floating above the slope ----
  const sensorTop = new THREE.Vector3(SPRING.x + 2.5, sy + 5.5, SPRING.z + 2.5);
  const sensor = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.08, 5, 8)), track(new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.5, metalness: 0.7 })));
  sensor.position.set(sensorTop.x, sy + 2.8, sensorTop.z);
  group.add(sensor);
  const beacon = new THREE.Sprite(
    track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7ff0e0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  beacon.position.copy(sensorTop);
  beacon.scale.setScalar(3);
  group.add(beacon);

  type Hyp = { text: string; at: THREE.Vector3; col: number };
  const hyps: Hyp[] = [
    { text: "RAINFALL", at: new THREE.Vector3(-30, 22, -18), col: 0x8fc9ff },
    { text: "RECHARGE AREA", at: new THREE.Vector3(-14, 30, -36), col: 0x9fe5a0 },
    { text: "VEGETATION COVER", at: new THREE.Vector3(8, 26, -30), col: 0xd9e58a },
    { text: "ROAD RUNOFF", at: new THREE.Vector3(24, 20, -12), col: 0xffc78a },
    { text: "EXTRACTION", at: new THREE.Vector3(34, 14, 6), col: 0xe9a0c8 },
  ];
  const orbMats: THREE.SpriteMaterial[] = [];
  const hypObjs = hyps.map((h, i) => {
    const mat = track(new THREE.SpriteMaterial({ map: glowTexture(), color: h.col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    orbMats.push(mat);
    const s = new THREE.Sprite(mat);
    s.position.copy(h.at);
    s.scale.setScalar(8);
    group.add(s);
    const core = new THREE.Mesh(track(new THREE.SphereGeometry(1.1, 16, 12)), track(new THREE.MeshBasicMaterial({ color: h.col, toneMapped: false })));
    core.position.copy(h.at);
    group.add(core);
    const l = textPlane(h.text, { width: 11, px: 64, letterSpacing: 0.14, weight: 600, color: "#eefaf6" });
    l.position.copy(h.at).add(new THREE.Vector3(0, 3.2, 0));
    group.add(l);
    tracked.push(l.geometry, l.material);
    billboards.push(l);
    return { s, core, h, i };
  });

  // links from each hypothesis down to the spring, brightness = how well it is holding up
  const linkMats: THREE.LineBasicMaterial[] = [];
  hyps.forEach((h, i) => {
    const lm = track(new THREE.LineBasicMaterial({ color: h.col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
    linkMats.push(lm);
    const mid = h.at.clone().lerp(sensorTop, 0.5).add(new THREE.Vector3(0, 4, 0));
    const curveL = new THREE.QuadraticBezierCurve3(h.at.clone(), mid, sensorTop.clone());
    const g = track(new THREE.BufferGeometry().setFromPoints(curveL.getPoints(24)));
    group.add(new THREE.Line(g, lm));
    void i;
  });
  const lb = linkBuilder();
  const pulseMat = track(pulseMaterial({ base: 0.0, speed: 0.3 }));
  hyps.forEach((h, i) => {
    const mid = h.at.clone().lerp(sensorTop, 0.5).add(new THREE.Vector3(0, 4, 0));
    const pts = new THREE.QuadraticBezierCurve3(h.at.clone(), mid, sensorTop.clone()).getPoints(24);
    for (let k = 0; k < pts.length - 1; k++) lb.add(pts[k], pts[k + 1], new THREE.Color(h.col), new THREE.Color(0x7ff0e0), i * 0.19);
  });
  const pulses = new THREE.LineSegments(track(lb.geometry()), pulseMat);
  pulses.frustumCulled = false;
  group.add(pulses);

  // the human review gate: a plain arch at the end of the strongest line
  const archMat = track(new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false }));
  const arch = new THREE.Group();
  for (const x of [-3, 3]) {
    const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 7, 0.4)), archMat);
    post.position.set(x, 3.5, 0);
    arch.add(post);
  }
  const beam = new THREE.Mesh(track(new THREE.BoxGeometry(6.8, 0.4, 0.4)), archMat);
  beam.position.y = 7;
  arch.add(beam);
  arch.position.set(26, height(26, -24) + 0.2, -24);
  group.add(arch);
  const review = textPlane("HUMAN REVIEW", { width: 11, px: 64, letterSpacing: 0.16, weight: 600, color: "#fff3d0" });
  review.position.set(arch.position.x, arch.position.y + 10, arch.position.z);
  group.add(review);
  tracked.push(review.geometry, review.material);
  billboards.push(review);

  // ---- mist ----
  const NM = high ? 120 : 50;
  const mp = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++) mp.set([(R() - 0.5) * 120, 1 + R() * 9, -20 + R() * 100], i * 3);
  const mGeo = track(new THREE.BufferGeometry());
  mGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  const mist = new THREE.Points(mGeo, track(new THREE.PointsMaterial({ map: glowTexture(), color: 0xe8f4f0, size: 9, transparent: true, opacity: 0.12, depthWrite: false })));
  mist.frustumCulled = false;
  group.add(mist);

  // ---- gate ----
  const gate = buildGate({
    id: "mul",
    slug: "mul",
    title: "MUL",
    subtitle: "WHY IS THE SPRING DECLINING · OPEN CASE STUDY",
    width: 22,
    fonts: opts.fonts,
    tone: "dark",
  });
  gate.group.position.set(0, 34, -50);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    gate.update(dt);
    sMat.uniforms.uTime.value = time;
    pulseMat.uniforms.uTime.value = time;
    beacon.material.opacity = 0.55 + 0.4 * Math.sin(time * 2.2);
    // the weight of each explanation rises and falls: no fixed winner, this is a picture of the method
    for (const o of hypObjs) {
      const v = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.35 + o.i * 1.26));
      orbMats[o.i].opacity = 0.25 + 0.65 * v;
      linkMats[o.i].opacity = 0.1 + 0.6 * v;
      o.core.scale.setScalar(0.7 + 0.6 * v);
      o.s.scale.setScalar(5 + 5 * v);
      o.s.position.y = o.h.at.y + Math.sin(time * 0.6 + o.i * 1.7) * 0.5;
      o.core.position.y = o.s.position.y;
    }
    for (const b of billboards) b.lookAt(cam.x, b.position.y, cam.z);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "mul"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
      stones.dispose();
      trunks.dispose();
      crowns.dispose();
    },
  };
}
