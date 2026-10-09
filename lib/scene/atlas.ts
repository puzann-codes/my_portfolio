import * as THREE from "three";
import { rng } from "./util";
import { buildGate } from "./gate";
import { linkBuilder, pulseMaterial } from "./pulse";

/**
 * Stage — Signal Atlas (data visualisation). A dotted globe with a
 * day/night terminator, city lights on the dark side, a thin atmosphere,
 * coloured signal arcs leaping between cities, and satellites on an
 * inclined orbit. Everything is points and lines; the dots do the shading.
 */

const ARC_COLORS = [0xffc857, 0x2dd4bf, 0xf472b6, 0x60a5fa, 0xa3e635];

function hash3(x: number, y: number, z: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const xf = f(x - xi);
  const yf = f(y - yi);
  const zf = f(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf
  );
}
function fbm(x: number, y: number, z: number) {
  return 0.55 * vnoise(x, y, z) + 0.28 * vnoise(x * 2.1, y * 2.1, z * 2.1) + 0.17 * vnoise(x * 4.3, y * 4.3, z * 4.3);
}

export function buildAtlas(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(31);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const RAD = 14;
  const globe = new THREE.Group();
  group.add(globe);

  // dark body of the planet
  globe.add(
    new THREE.Mesh(
      track(new THREE.SphereGeometry(RAD * 0.992, 64, 48)),
      track(new THREE.MeshStandardMaterial({ color: 0x050c1e, roughness: 0.95, metalness: 0 }))
    )
  );

  // dotted surface: ocean dots, land dots, city lights
  const N = high ? 11000 : 5200;
  const pos: number[] = [];
  const kind: number[] = [];
  const seed: number[] = [];
  const cities: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const land = fbm(x * 1.9 + 3, y * 1.9, z * 1.9 + 7) > 0.56 && Math.abs(y) < 0.93;
    if (!land && i % 3 !== 0) continue;
    const isCity = land && R() < 0.045;
    pos.push(x * RAD, y * RAD, z * RAD);
    kind.push(isCity ? 2 : land ? 1 : 0);
    seed.push(R());
    if (isCity) cities.push(new THREE.Vector3(x * RAD, y * RAD, z * RAD));
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  pGeo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  pGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  const pMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSun: { value: new THREE.Vector3(-0.8, 0.3, 0.5).normalize() },
        uSize: { value: 400 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aKind;
        attribute float aSeed;
        uniform vec3 uSun;
        uniform float uSize;
        uniform float uTime;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec3 nW = normalize(mat3(modelMatrix) * position);
          float day = smoothstep(-0.12, 0.35, dot(nW, uSun));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 viewN = normalize(mat3(modelViewMatrix) * position);
          float facing = smoothstep(-0.05, 0.25, dot(viewN, normalize(-mv.xyz)));
          float size = 0.24;
          vec3 c;
          float a;
          if (aKind > 1.5) {
            float tw = 0.7 + 0.3 * sin(uTime * 2.0 + aSeed * 40.0);
            c = vec3(1.0, 0.72, 0.34) * (0.35 + (1.0 - day) * 1.6) * tw;
            a = 1.0;
            size = 0.5;
          } else if (aKind > 0.5) {
            c = mix(vec3(0.05, 0.16, 0.26), vec3(0.28, 0.92, 0.72), day) * (0.85 + aSeed * 0.3);
            a = 0.95;
            size = 0.36;
          } else {
            c = mix(vec3(0.02, 0.06, 0.18), vec3(0.08, 0.26, 0.52), day);
            a = 0.8;
            size = 0.2;
          }
          vCol = c;
          vA = a * facing;
          gl_PointSize = size * uSize / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol, a);
        }`,
    })
  );
  globe.add(new THREE.Points(pGeo, pMat));

  // atmosphere
  const atmos = new THREE.Mesh(
    track(new THREE.SphereGeometry(RAD * 1.07, 64, 48)),
    track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        uniforms: { uSun: pMat.uniforms.uSun },
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vNW;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            vNW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun;
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vNW;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.2);
            float day = smoothstep(-0.4, 0.5, dot(normalize(vNW), uSun));
            vec3 c = mix(vec3(0.12, 0.35, 0.8), vec3(0.35, 0.75, 1.0), day);
            gl_FragColor = vec4(c * f * (0.5 + day), f * 0.9);
          }`,
      })
    )
  );
  globe.add(atmos);

  // signal arcs between cities
  const lb = linkBuilder();
  const arcN = high ? 20 : 12;
  const up = new THREE.Vector3();
  for (let i = 0; i < arcN; i++) {
    const a = cities[Math.floor(R() * cities.length)];
    const b = cities[Math.floor(R() * cities.length)];
    if (a === b) continue;
    const col = new THREE.Color(ARC_COLORS[i % ARC_COLORS.length]);
    const seg = 44;
    const lift = 0.1 + R() * 0.28;
    let prev: THREE.Vector3 | null = null;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      up.copy(a).normalize().lerp(b.clone().normalize(), t).normalize();
      const p = up.clone().multiplyScalar(RAD * (1.0 + Math.sin(Math.PI * t) * lift));
      if (prev) {
        lb.add(prev, p, col, col, (i * 0.137) % 1);
        lb.t[lb.t.length - 2] = (s - 1) / seg;
        lb.t[lb.t.length - 1] = s / seg;
      }
      prev = p;
    }
  }
  const aGeo = track(lb.geometry());
  const aMat = track(pulseMaterial({ base: 0.32, speed: 0.16, fog: false }));
  globe.add(new THREE.LineSegments(aGeo, aMat));

  // an inclined orbit with satellites
  const orbit = new THREE.Group();
  orbit.rotation.set(0.5, 0, 0.35);
  const orbitPts: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    orbitPts.push(new THREE.Vector3(Math.cos(a) * 19, 0, Math.sin(a) * 19));
  }
  orbit.add(
    new THREE.LineLoop(
      track(new THREE.BufferGeometry().setFromPoints(orbitPts)),
      track(new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3 }))
    )
  );
  const sats = [0x2dd4bf, 0xffc857, 0xf472b6].map((c) => {
    const m = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.7, 0.28, 0.4)),
      track(new THREE.MeshBasicMaterial({ color: c, toneMapped: false }))
    );
    const panel = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.8, 0.04, 0.5)),
      track(new THREE.MeshStandardMaterial({ color: 0x1d3a6a, roughness: 0.4, metalness: 0.6 }))
    );
    m.add(panel);
    orbit.add(m);
    return m;
  });
  group.add(orbit);

  const gate = buildGate({
    id: "signal-atlas",
    slug: "signal-atlas",
    title: "SIGNAL ATLAS",
    subtitle: "DATA VISUALISATION · OPEN CASE STUDY",
    width: 32,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 25, 4);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3, viewScale: number) => {
    gate.update(dt);
    globe.rotation.y = time * 0.06;
    pMat.uniforms.uTime.value = time;
    pMat.uniforms.uSize.value = 480 * viewScale;
    aMat.uniforms.uTime.value = time;
    sats.forEach((s, i) => {
      const a = time * (0.22 + i * 0.05) + (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 19, 0, Math.sin(a) * 19);
      s.rotation.y = -a;
    });
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "signal-atlas"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
