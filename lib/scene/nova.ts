import * as THREE from "three";
import { canvasTexture, clamp, makeCanvas, rng, smoothstep, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture } from "./pulse";

/**
 * Stage — Nova Render (AI research tool). The picture of a diffusion model:
 * a cloud of noise that resolves, particle by particle, into a form, then
 * dissolves and starts again. Behind it, five frames of the same image at
 * decreasing noise, the way a sampler steps toward a clean result.
 */

function stepTexture(noise: number, seed: number) {
  const S = 192;
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, "#2a1048");
  sky.addColorStop(0.55, "#d9487a");
  sky.addColorStop(1, "#ffb36b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S);
  const sun = ctx.createRadialGradient(S * 0.62, S * 0.58, 4, S * 0.62, S * 0.58, S * 0.3);
  sun.addColorStop(0, "#fff3c4");
  sun.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#1a0b2c";
  ctx.beginPath();
  ctx.moveTo(0, S);
  ctx.lineTo(0, S * 0.74);
  ctx.lineTo(S * 0.22, S * 0.6);
  ctx.lineTo(S * 0.38, S * 0.72);
  ctx.lineTo(S * 0.58, S * 0.56);
  ctx.lineTo(S * 0.8, S * 0.7);
  ctx.lineTo(S, S * 0.62);
  ctx.lineTo(S, S);
  ctx.closePath();
  ctx.fill();
  const R = rng(seed);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 255 * noise * 1.6;
    d[i] = clamp(d[i] * (1 - noise * 0.7) + 128 * noise * 0.7 + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] * (1 - noise * 0.7) + 128 * noise * 0.7 + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] * (1 - noise * 0.7) + 128 * noise * 0.7 + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, 4);
}

export function buildNova(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(41);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };

  // ---- the cloud ----
  const N = high ? 20000 : 8000;
  const start = new Float32Array(N * 3);
  const target = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const hue = new Float32Array(N);
  const P = 2;
  const Q = 3;
  for (let i = 0; i < N; i++) {
    // noise: a loose gaussian-ish ball
    const g = () => (R() + R() + R() - 1.5) * 2;
    start.set([g() * 14, g() * 11, g() * 14], i * 3);
    // target: a torus knot with a soft tube
    const t = R() * Math.PI * 2;
    const r = 2 + Math.cos(Q * t);
    const cx = r * Math.cos(P * t);
    const cy = r * Math.sin(P * t);
    const cz = -Math.sin(Q * t);
    const sx = 4.2;
    const tube = 0.9 * Math.sqrt(R());
    const a = R() * Math.PI * 2;
    const b = R() * Math.PI * 2;
    target.set(
      [cx * sx + Math.cos(a) * Math.cos(b) * tube, cy * sx + Math.sin(a) * tube, cz * sx + Math.cos(a) * Math.sin(b) * tube],
      i * 3
    );
    seed[i] = R();
    hue[i] = (t / (Math.PI * 2) + R() * 0.06) % 1;
  }
  const cGeo = track(new THREE.BufferGeometry());
  cGeo.setAttribute("position", new THREE.BufferAttribute(start, 3));
  cGeo.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
  cGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  cGeo.setAttribute("aHue", new THREE.BufferAttribute(hue, 1));
  const cMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMix: { value: 0 }, uTime: { value: 0 }, uSize: { value: 360 } },
      vertexShader: /* glsl */ `
        attribute vec3 aTarget;
        attribute float aSeed;
        attribute float aHue;
        uniform float uMix;
        uniform float uTime;
        uniform float uSize;
        varying vec3 vCol;
        varying float vA;
        void main() {
          float k = smoothstep(0.0, 1.0, clamp(uMix * 1.35 - aSeed * 0.35, 0.0, 1.0));
          vec3 wob = vec3(sin(uTime * 0.7 + aSeed * 21.0), cos(uTime * 0.6 + aSeed * 33.0), sin(uTime * 0.8 + aSeed * 14.0));
          vec3 n = position + wob * mix(1.4, 0.0, k);
          vec3 t = aTarget + wob * 0.12;
          vec3 p = mix(n, t, k);
          vec3 irid = 0.5 + 0.5 * cos(6.2831 * (aHue + vec3(0.0, 0.33, 0.67)) + uTime * 0.35);
          vec3 grey = vec3(0.62, 0.5, 0.74);
          vCol = mix(grey * 0.7, irid * 1.15, k);
          vA = mix(0.5, 0.95, k);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = mix(0.55, 0.36, k) * uSize / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vCol, a);
        }`,
    })
  );
  const cloud = new THREE.Points(cGeo, cMat);
  cloud.frustumCulled = false;
  group.add(cloud);

  // a warm glow on the floor under the cloud
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(70, 70)),
    track(new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xe0487a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -13;
  group.add(floor);

  // ---- the sampler's steps, behind ----
  const steps = [0.95, 0.7, 0.45, 0.2, 0];
  const labels = ["t = 1000", "t = 750", "t = 500", "t = 250", "t = 0"];
  steps.forEach((nz, i) => {
    const a = THREE.MathUtils.lerp(-0.9, 0.9, i / 4);
    const radius = 36;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * radius, 3 + Math.cos(i * 1.7) * 0.6, -Math.cos(a) * radius * 0.7 - 6);
    g.rotation.y = -a * 0.9;
    const tex = track(stepTexture(nz, 100 + i));
    const plane = new THREE.Mesh(
      track(new THREE.PlaneGeometry(9, 9)),
      track(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    );
    g.add(plane);
    const edges = new THREE.LineSegments(
      track(new THREE.EdgesGeometry(new THREE.PlaneGeometry(9.3, 9.3))),
      track(new THREE.LineBasicMaterial({ color: 0xffd9e8, transparent: true, opacity: 0.45 }))
    );
    g.add(edges);
    const lab = textPlane(labels[i], { width: 4.6, px: 70, letterSpacing: 0.1, weight: 600, color: "#ffd9e8" });
    lab.position.y = -5.6;
    g.add(lab);
    tracked.push(lab.geometry, lab.material);
    group.add(g);
  });

  // progress of the denoise, as a thin gradient bar
  const bar = new THREE.Mesh(
    track(new THREE.PlaneGeometry(26, 0.35)),
    track(new THREE.MeshBasicMaterial({ color: 0xff7aa8, toneMapped: false }))
  );
  bar.position.set(0, -11, 6);
  group.add(bar);
  const rail = new THREE.Mesh(
    track(new THREE.PlaneGeometry(26, 0.1)),
    track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }))
  );
  rail.position.set(0, -11, 5.9);
  group.add(rail);

  const gate = buildGate({
    id: "nova-render",
    slug: "nova-render",
    title: "NOVA RENDER",
    subtitle: "AI RESEARCH TOOL · OPEN CASE STUDY",
    width: 28,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 19, 4);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3, viewScale: number) => {
    gate.update(dt);
    // one denoise cycle: static, resolve, hold, dissolve
    const t = time % 16;
    let mix = 0;
    if (t < 1.5) mix = 0;
    else if (t < 9) mix = smoothstep(0, 1, (t - 1.5) / 7.5);
    else if (t < 12.5) mix = 1;
    else if (t < 15) mix = 1 - smoothstep(0, 1, (t - 12.5) / 2.5);
    cMat.uniforms.uMix.value = mix;
    cMat.uniforms.uTime.value = time;
    cMat.uniforms.uSize.value = 150 * viewScale;
    cloud.rotation.y = time * 0.12;
    bar.scale.x = Math.max(mix, 0.001);
    bar.position.x = -13 + 13 * Math.max(mix, 0.001);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "nova-render"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
