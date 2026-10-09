import * as THREE from "three";
import { rng, textPlane } from "./util";

/**
 * Stage 2 — the neural network, plus an "agent loop" floating above it.
 * Edges are single straight segments; a shader sends bright pulses along
 * them so activations visibly travel layer to layer.
 */

const PULSE_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  uniform float uTime;
  varying float vT;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vT = aT;
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const PULSE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uBase;
  uniform float uSpeed;
  varying float vT;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    float head = fract(uTime * uSpeed * (0.6 + vSeed * 0.8) + vSeed * 7.0);
    float d = vT - head;
    float pulse = smoothstep(0.1, 0.0, abs(d)) * (d < 0.0 ? 1.0 : 0.6);
    float a = uBase + pulse * 0.95;
    gl_FragColor = vec4(vec3(1.0), a);
    #include <fog_fragment>
  }`;

function pulseMaterial(base: number, speed: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uBase: { value: base }, uSpeed: { value: speed } },
    ]),
    vertexShader: PULSE_VERT,
    fragmentShader: PULSE_FRAG,
  });
}

export function buildNeural(opts: { quality: "high" | "low" }) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(21);

  const layers = opts.quality === "high" ? [5, 8, 10, 10, 7, 3] : [4, 6, 7, 7, 5, 3];
  const spacing = 16;
  const nodes: THREE.Vector3[][] = layers.map((n, li) => {
    // layers are stacked along -z: the camera flies through them, with the signal
    const z = -(li - (layers.length - 1) / 2) * spacing;
    return Array.from({ length: n }, () => {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 10.5;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.8, z + (R() - 0.5) * 3);
    });
  });

  // edges
  const pos: number[] = [];
  const t: number[] = [];
  const seed: number[] = [];
  for (let l = 0; l < layers.length - 1; l++) {
    for (const a of nodes[l]) {
      const links = 3;
      const picks = [...nodes[l + 1]].sort(() => R() - 0.5).slice(0, links);
      for (const b of picks) {
        const s = R();
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        t.push(0, 1);
        seed.push(s, s);
      }
    }
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  eGeo.setAttribute("aT", new THREE.Float32BufferAttribute(t, 1));
  eGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  const eMat = pulseMaterial(0.13, 0.22);
  group.add(new THREE.LineSegments(eGeo, eMat));
  tracked.push(eGeo, eMat);

  // nodes: small bright cores + soft additive glows
  const flat = nodes.flat();
  const sGeo = new THREE.SphereGeometry(1, 14, 10);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const core = new THREE.InstancedMesh(sGeo, coreMat, flat.length);
  const m = new THREE.Matrix4();
  const sizes = flat.map(() => 0.22 + R() * 0.26);
  const phases = flat.map(() => R() * 6.28);
  flat.forEach((p, i) => {
    m.compose(p, new THREE.Quaternion(), new THREE.Vector3().setScalar(sizes[i]));
    core.setMatrixAt(i, m);
  });
  group.add(core);

  const gc = document.createElement("canvas");
  gc.width = gc.height = 64;
  const gctx = gc.getContext("2d")!;
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(gc);
  const glowGeo = new THREE.BufferGeometry().setFromPoints(flat);
  const glowMat = new THREE.PointsMaterial({
    map: glowTex,
    size: 4.2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  group.add(new THREE.Points(glowGeo, glowMat));
  tracked.push(sGeo, coreMat, glowTex, glowGeo, glowMat);

  // the agent loop: planner → tools → memory → critic → planner
  const loopCenter = new THREE.Vector3(0, 24, 0);
  const labels = ["PLANNER", "TOOLS", "MEMORY", "CRITIC"];
  const loopPts = labels.map((_, i) => {
    const a = (i / labels.length) * Math.PI * 2 + 0.4;
    return new THREE.Vector3(Math.cos(a) * 15, Math.sin(a * 2) * 2.5, Math.sin(a) * 15).add(loopCenter);
  });
  const curve = new THREE.CatmullRomCurve3(loopPts, true, "catmullrom", 0.5);
  const samples = curve.getPoints(160);
  const lpos: number[] = [];
  const lt: number[] = [];
  const ls: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    lpos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    lt.push(i / samples.length, (i + 1) / samples.length);
    ls.push(0.3, 0.3);
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute("position", new THREE.Float32BufferAttribute(lpos, 3));
  lGeo.setAttribute("aT", new THREE.Float32BufferAttribute(lt, 1));
  lGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(ls, 1));
  const lMat = pulseMaterial(0.35, 0.18);
  group.add(new THREE.LineSegments(lGeo, lMat));
  tracked.push(lGeo, lMat);

  const labelMeshes: THREE.Mesh[] = [];
  const agentMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    fog: true,
  });
  const ringGeo = new THREE.RingGeometry(1.7, 1.8, 48);
  tracked.push(agentMat, ringMat, ringGeo);
  loopPts.forEach((p, i) => {
    const s = new THREE.Mesh(sGeo, agentMat);
    s.position.copy(p);
    s.scale.setScalar(0.9);
    group.add(s);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(p);
    group.add(ring);
    const label = textPlane(labels[i], { width: 7, letterSpacing: 0.12, px: 80, weight: 700 });
    label.position.copy(p).add(new THREE.Vector3(0, 3.4, 0));
    group.add(label);
    labelMeshes.push(label);
    tracked.push(label.geometry, label.material);
  });

  // a ground grid so the network has something to float above
  const g: number[] = [];
  for (let i = -6; i <= 6; i++) {
    g.push(i * 10, -16, -60, i * 10, -16, 60, -60, -16, i * 10, 60, -16, i * 10);
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(g, 3));
  const gMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, fog: true });
  group.add(new THREE.LineSegments(gGeo, gMat));
  tracked.push(gGeo, gMat);

  const update = (time: number, cam: THREE.Vector3) => {
    eMat.uniforms.uTime.value = time;
    lMat.uniforms.uTime.value = time;
    // nodes breathe
    for (let i = 0; i < flat.length; i++) {
      const s = sizes[i] * (1 + Math.sin(time * 1.4 + phases[i]) * 0.12);
      m.compose(flat[i], new THREE.Quaternion(), new THREE.Vector3().setScalar(s));
      core.setMatrixAt(i, m);
    }
    core.instanceMatrix.needsUpdate = true;
    for (const l of labelMeshes) l.lookAt(cam);
  };

  return {
    group,
    update,
    dispose() {
      tracked.forEach((d) => d.dispose());
      core.dispose();
    },
  };
}
