import * as THREE from "three";
import { rng, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture, linkBuilder, pulseMaterial } from "./pulse";

/**
 * Stage — the agentic AI work. A network you fly through, layer by layer,
 * with signal moving along the edges and each layer carrying its own colour
 * (teal into violet into rose into amber). Above it, an agent loop of four
 * roles, each its own colour, with tokens circulating between them.
 */

const LAYER_COLORS = [0x2dd4bf, 0x38bdf8, 0x818cf8, 0xc084fc, 0xf472b6, 0xfbbf24];
const ROLES: { name: string; color: number }[] = [
  { name: "PLANNER", color: 0xfbbf24 },
  { name: "TOOLS", color: 0x2dd4bf },
  { name: "MEMORY", color: 0xa78bfa },
  { name: "CRITIC", color: 0xf472b6 },
];

export function buildNeural(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(21);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };

  const layers = opts.quality === "high" ? [5, 8, 10, 10, 7, 3] : [4, 6, 7, 7, 5, 3];
  const spacing = 16;
  const nodes: THREE.Vector3[][] = layers.map((n, li) => {
    // stacked along -z: the camera flies through them, with the signal
    const z = -(li - (layers.length - 1) / 2) * spacing;
    return Array.from({ length: n }, () => {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 10.5;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.8, z + (R() - 0.5) * 3);
    });
  });
  const cols = LAYER_COLORS.map((c) => new THREE.Color(c));

  // edges: coloured from source layer to target layer, with a pulse
  const lb = linkBuilder();
  for (let l = 0; l < layers.length - 1; l++) {
    for (const a of nodes[l]) {
      const picks = [...nodes[l + 1]].sort(() => R() - 0.5).slice(0, 3);
      for (const b of picks) lb.add(a, b, cols[l], cols[l + 1], R());
    }
  }
  const eGeo = track(lb.geometry());
  const eMat = track(pulseMaterial({ base: 0.2, speed: 0.22 }));
  group.add(new THREE.LineSegments(eGeo, eMat));

  // nodes: small bright cores + coloured glows
  const flat: { p: THREE.Vector3; layer: number }[] = [];
  nodes.forEach((arr, li) => arr.forEach((p) => flat.push({ p, layer: li })));
  const sGeo = track(new THREE.SphereGeometry(1, 14, 10));
  const coreMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const core = new THREE.InstancedMesh(sGeo, coreMat, flat.length);
  const m = new THREE.Matrix4();
  const sizes = flat.map(() => 0.26 + R() * 0.3);
  const phases = flat.map(() => R() * 6.28);
  const tmp = new THREE.Color();
  flat.forEach((n, i) => {
    m.compose(n.p, new THREE.Quaternion(), new THREE.Vector3().setScalar(sizes[i]));
    core.setMatrixAt(i, m);
    core.setColorAt(i, tmp.copy(cols[n.layer]).lerp(new THREE.Color(1, 1, 1), 0.45));
  });
  group.add(core);
  track(core);

  const glowGeo = track(new THREE.BufferGeometry().setFromPoints(flat.map((n) => n.p)));
  glowGeo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(flat.flatMap((n) => [cols[n.layer].r, cols[n.layer].g, cols[n.layer].b]), 3)
  );
  const glowMat = track(
    new THREE.PointsMaterial({
      map: glowTexture(),
      size: 3.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    })
  );
  group.add(new THREE.Points(glowGeo, glowMat));

  // the agent loop above the network
  const loopCenter = new THREE.Vector3(0, 24, 0);
  const loopPts = ROLES.map((_, i) => {
    const a = (i / ROLES.length) * Math.PI * 2 + 0.4;
    return new THREE.Vector3(Math.cos(a) * 15, Math.sin(a * 2) * 2.5, Math.sin(a) * 15).add(loopCenter);
  });
  const curve = new THREE.CatmullRomCurve3(loopPts, true, "catmullrom", 0.5);
  const ll = linkBuilder();
  const samples = curve.getPoints(160);
  const roleCols = ROLES.map((r) => new THREE.Color(r.color));
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const f0 = (i / samples.length) * ROLES.length;
    const f1 = ((i + 1) / samples.length) * ROLES.length;
    const c0 = roleCols[Math.floor(f0) % 4].clone().lerp(roleCols[(Math.floor(f0) + 1) % 4], f0 % 1);
    const c1 = roleCols[Math.floor(f1) % 4].clone().lerp(roleCols[(Math.floor(f1) + 1) % 4], f1 % 1);
    ll.add(a, b, c0, c1, 0.3);
    ll.t[ll.t.length - 2] = i / samples.length;
    ll.t[ll.t.length - 1] = (i + 1) / samples.length;
  }
  const lGeo = track(ll.geometry());
  const lMat = track(pulseMaterial({ base: 0.5, speed: 0.18 }));
  group.add(new THREE.LineSegments(lGeo, lMat));

  const labels: THREE.Mesh[] = [];
  const ringGeo = track(new THREE.RingGeometry(1.7, 1.82, 48));
  loopPts.forEach((p, i) => {
    const color = new THREE.Color(ROLES[i].color);
    const s = new THREE.Mesh(sGeo, track(new THREE.MeshBasicMaterial({ color, toneMapped: false })));
    s.position.copy(p);
    s.scale.setScalar(0.95);
    group.add(s);
    const ring = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: true })));
    ring.position.copy(p);
    group.add(ring);
    const halo = new THREE.Sprite(
      track(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    halo.position.copy(p);
    halo.scale.setScalar(9);
    group.add(halo);
    const label = textPlane(ROLES[i].name, { width: 7, letterSpacing: 0.12, px: 80, weight: 700, color: "#" + color.getHexString() });
    label.position.copy(p).add(new THREE.Vector3(0, 3.4, 0));
    group.add(label);
    labels.push(label);
    tracked.push(label.geometry, label.material);
  });

  // tokens circulating the loop
  const TOK = 7;
  const tokPos = new Float32Array(TOK * 3);
  const tokCol = new Float32Array(TOK * 3);
  const tokGeo = track(new THREE.BufferGeometry());
  tokGeo.setAttribute("position", new THREE.BufferAttribute(tokPos, 3));
  tokGeo.setAttribute("color", new THREE.BufferAttribute(tokCol, 3));
  const tokens = new THREE.Points(
    tokGeo,
    track(new THREE.PointsMaterial({ map: glowTexture(), size: 2.4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
  tokens.frustumCulled = false;
  group.add(tokens);

  // the way into the case study
  const gate = buildGate({
    id: "agentic-ai-hackathon",
    slug: "agentic-ai-hackathon",
    title: "AGENTIC AI",
    subtitle: "HACKATHON WORK · OPEN CASE STUDY",
    width: 30,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 20, -26);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    gate.update(dt);
    eMat.uniforms.uTime.value = time;
    lMat.uniforms.uTime.value = time;
    for (let i = 0; i < flat.length; i++) {
      const s = sizes[i] * (1 + Math.sin(time * 1.4 + phases[i]) * 0.14);
      m.compose(flat[i].p, q, sc.setScalar(s));
      core.setMatrixAt(i, m);
    }
    core.instanceMatrix.needsUpdate = true;
    for (const l of labels) l.lookAt(cam);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);

    for (let i = 0; i < TOK; i++) {
      const u = (time * 0.07 + i / TOK) % 1;
      curve.getPoint(u, v);
      tokPos[i * 3] = v.x;
      tokPos[i * 3 + 1] = v.y;
      tokPos[i * 3 + 2] = v.z;
      const f = u * ROLES.length;
      const c = roleCols[Math.floor(f) % 4].clone().lerp(roleCols[(Math.floor(f) + 1) % 4], f % 1);
      tokCol[i * 3] = c.r * 1.3;
      tokCol[i * 3 + 1] = c.g * 1.3;
      tokCol[i * 3 + 2] = c.b * 1.3;
    }
    tokGeo.attributes.position.needsUpdate = true;
    tokGeo.attributes.color.needsUpdate = true;
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "agentic-ai-hackathon"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
