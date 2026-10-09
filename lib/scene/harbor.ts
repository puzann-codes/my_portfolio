import * as THREE from "three";
import { canvasTexture, makeCanvas, rng } from "./util";
import { buildGate } from "./gate";
import { glowTexture } from "./pulse";

/**
 * Stage — Harbor CMS (developer tooling). A container port at sunset: content
 * is cargo, blocks are containers, and the pipeline is a crane lifting them
 * onto a ship. Animated water with the low sun on it, a lighthouse sweeping
 * the bay, boats with running lights, blinking buoys.
 */

const BOX_COLORS = [0x2b6f8f, 0xd9742a, 0x2f8f7a, 0xb8423a, 0xd8a93a, 0x5b6fb0, 0xe8e4d8, 0x3a4048, 0x7b4a8a];

/** Corrugated container steel: ribs along the faces, computed in world space. */
function containerMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.45 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vFace;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         #ifdef USE_INSTANCING
           vec4 wp_ = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
         #else
           vec4 wp_ = modelMatrix * vec4(transformed, 1.0);
         #endif
         vWPos = wp_.xyz;
         vFace = normal;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vFace;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           float side = step(abs(vFace.y), 0.5);
           float c = abs(vFace.x) > 0.5 ? vWPos.z : vWPos.x;
           float rib = 0.5 + 0.5 * sin(c * 13.0);
           diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * rib, side);
           // a darker lower band, like weathered steel
           float low = smoothstep(0.0, 2.6, mod(vWPos.y, 2.6));
           diffuseColor.rgb *= mix(0.86, 1.0, low);
         }`
      );
  };
  return mat;
}

function lighthouseTexture() {
  const c = makeCanvas(32, 256);
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? "#f2eee4" : "#c43b36";
    ctx.fillRect(0, i * (256 / 6), 32, 256 / 6 + 1);
  }
  return canvasTexture(c, 4);
}

export function buildHarbor(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(51);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();

  // ---------- water ----------
  const waterMat = track(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(0.3, 0.22, -0.9).normalize() },
        uDeep: { value: new THREE.Color(0x0a2c3a) },
        uSkyH: { value: new THREE.Color(0xf5b86e) },
        uSkyM: { value: new THREE.Color(0x2c7a8c) },
        uFog: { value: new THREE.Color(0x24505c) },
        uFogD: { value: 0.0042 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uSkyH;
        uniform vec3 uSkyM;
        uniform vec3 uFog;
        uniform float uFogD;
        varying vec3 vW;
        vec3 waves(vec2 p) {
          float dx = 0.0;
          float dz = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            vec2 d = normalize(vec2(cos(fi * 1.7 + 0.4), sin(fi * 2.3 + 1.1)));
            float f = 0.22 + fi * 0.19;
            float a = 0.09 / (1.0 + fi * 0.9);
            float ph = dot(p, d) * f + uTime * (0.55 + fi * 0.18);
            dx += a * f * d.x * cos(ph);
            dz += a * f * d.y * cos(ph);
          }
          return vec3(dx, 0.0, dz);
        }
        void main() {
          vec3 V = normalize(uCam - vW);
          vec3 w = waves(vW.xz);
          vec3 N = normalize(vec3(-w.x, 1.0, -w.z));
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.92 + 0.05;
          vec3 R = reflect(-V, N);
          float h = clamp(R.y, 0.0, 1.0);
          vec3 sky = mix(uSkyH, uSkyM, smoothstep(0.0, 0.45, h));
          float sd = max(dot(R, normalize(uSun)), 0.0);
          vec3 sun = vec3(1.0, 0.82, 0.55) * (pow(sd, 380.0) * 3.0 + pow(sd, 22.0) * 0.35);
          vec3 col = mix(uDeep, sky, fres) + sun;
          float dist = length(uCam - vW);
          float f = 1.0 - exp(-pow(dist * uFogD, 2.0));
          col = mix(col, uFog, f);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(1800, 1800, 1, 1)), waterMat);
  water.rotation.x = -Math.PI / 2;
  group.add(water);

  // ---------- the terminal ----------
  const concrete = track(new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.9 }));
  const quay = new THREE.Mesh(track(new THREE.BoxGeometry(66, 2.4, 82)), concrete);
  quay.position.set(-39, 0.2, -30);
  group.add(quay);
  const quayTop = 1.4;

  // containers, in stacks
  const boxMat = track(containerMaterial());
  const CW = 6.0;
  const CH = 2.6;
  const CD = 2.4;
  const spots: { x: number; y: number; z: number }[] = [];
  for (let cx = 0; cx < 6; cx++) {
    for (let cz = 0; cz < 9; cz++) {
      if (R() < 0.12) continue;
      const stack = 1 + Math.floor(R() * 4);
      for (let h = 0; h < stack; h++) {
        spots.push({ x: -62 + cx * 9.4 + (R() - 0.5) * 0.3, y: quayTop + h * CH, z: -64 + cz * 8.4 });
      }
    }
  }
  const yard = new THREE.InstancedMesh(track(new THREE.BoxGeometry(CW, CH, CD)), boxMat, spots.length);
  spots.forEach((s, i) => {
    m4.compose(v.set(s.x, s.y + CH / 2, s.z), q.identity(), sc.set(1, 1, 1));
    yard.setMatrixAt(i, m4);
    col.setHex(BOX_COLORS[Math.floor(R() * BOX_COLORS.length)]);
    yard.setColorAt(i, col);
  });
  group.add(yard);
  track(yard);

  // ---------- a container ship, moored alongside ----------
  const ship = new THREE.Group();
  ship.position.set(10, 0, -34);
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-8, -34);
  hullShape.lineTo(8, -34);
  hullShape.lineTo(8, 20);
  hullShape.lineTo(0, 36);
  hullShape.lineTo(-8, 20);
  hullShape.closePath();
  const hullGeo = track(new THREE.ExtrudeGeometry(hullShape, { depth: 6.5, bevelEnabled: false }));
  hullGeo.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, track(new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.6, metalness: 0.4 })));
  hull.position.y = -2.2;
  ship.add(hull);
  const stripe = new THREE.Mesh(
    track(new THREE.BoxGeometry(16.2, 0.9, 54)),
    track(new THREE.MeshStandardMaterial({ color: 0xb3342f, roughness: 0.6 }))
  );
  stripe.position.set(0, -0.2, -7);
  ship.add(stripe);
  const shipBoxes: { x: number; y: number; z: number }[] = [];
  for (let cx = 0; cx < 6; cx++) {
    for (let cz = 0; cz < 16; cz++) {
      if (R() < 0.18) continue;
      const stack = 1 + Math.floor(R() * 4);
      for (let h = 0; h < stack; h++) shipBoxes.push({ x: -6.2 + cx * 2.5, y: 4.3 + h * CH, z: -30 + cz * 3.6 });
    }
  }
  const deck = new THREE.InstancedMesh(track(new THREE.BoxGeometry(2.4, CH, 3.4)), boxMat, shipBoxes.length);
  shipBoxes.forEach((s, i) => {
    m4.compose(v.set(s.x, s.y + CH / 2 - 0.2, s.z), q.identity(), sc.set(1, 1, 1));
    deck.setMatrixAt(i, m4);
    col.setHex(BOX_COLORS[Math.floor(R() * BOX_COLORS.length)]);
    deck.setColorAt(i, col);
  });
  ship.add(deck);
  track(deck);
  // bridge tower at the stern
  const white = track(new THREE.MeshStandardMaterial({ color: 0xece9e0, roughness: 0.55 }));
  const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(12, 9, 6)), white);
  bridge.position.set(0, 8.4, -32);
  ship.add(bridge);
  const win = new THREE.Mesh(
    track(new THREE.BoxGeometry(12.1, 1.1, 5.4)),
    track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }))
  );
  win.position.set(0, 11.2, -31.9);
  ship.add(win);
  const funnel = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.4, 1.7, 4.4, 14)),
    track(new THREE.MeshStandardMaterial({ color: 0xc43b36, roughness: 0.6 }))
  );
  funnel.position.set(0, 15.3, -32);
  ship.add(funnel);
  group.add(ship);

  // ---------- gantry cranes ----------
  const craneMat = track(new THREE.MeshStandardMaterial({ color: 0xe0592a, roughness: 0.5, metalness: 0.4 }));
  const cableMat = track(new THREE.MeshBasicMaterial({ color: 0x20262c }));
  const legGeo = track(new THREE.BoxGeometry(1.1, 24, 1.1));
  const beamGeo = track(new THREE.BoxGeometry(46, 1.4, 1.6));
  const trolleyGeo = track(new THREE.BoxGeometry(3.2, 1.2, 2.4));
  const hookBox = track(new THREE.BoxGeometry(CW, CH, CD));
  type Crane = { trolley: THREE.Mesh; cable: THREE.Mesh; box: THREE.Mesh; phase: number };
  const cranes: Crane[] = [-18, -46].map((z, i) => {
    const g = new THREE.Group();
    g.position.set(-6, quayTop, z);
    for (const dz of [-4, 4]) {
      for (const dx of [-3, 3]) {
        const leg = new THREE.Mesh(legGeo, craneMat);
        leg.position.set(dx, 12, dz);
        g.add(leg);
      }
    }
    const beam = new THREE.Mesh(beamGeo, craneMat);
    beam.position.set(8, 24.4, 0);
    g.add(beam);
    const trolley = new THREE.Mesh(trolleyGeo, track(new THREE.MeshStandardMaterial({ color: 0x2b333c, roughness: 0.6 })));
    trolley.position.set(0, 23.3, 0);
    g.add(trolley);
    const cable = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 1, 0.1)), cableMat);
    g.add(cable);
    const box = new THREE.Mesh(hookBox, track(containerMaterial()));
    (box.material as THREE.MeshStandardMaterial).color.setHex(BOX_COLORS[(i * 3 + 1) % BOX_COLORS.length]);
    g.add(box);
    group.add(g);
    return { trolley, cable, box, phase: i * 2.1 };
  });

  // ---------- lighthouse on the breakwater ----------
  const pier = new THREE.Mesh(track(new THREE.BoxGeometry(7, 2.4, 110)), concrete);
  pier.position.set(34, 0.2, -88);
  group.add(pier);
  const lhTex = track(lighthouseTexture());
  const tower = new THREE.Mesh(
    track(new THREE.CylinderGeometry(2.1, 3.1, 24, 24)),
    track(new THREE.MeshStandardMaterial({ map: lhTex, roughness: 0.6 }))
  );
  tower.position.set(34, 13.4, -140);
  group.add(tower);
  const lamp = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1.7, 1.7, 2.6, 18)),
    track(new THREE.MeshBasicMaterial({ color: 0xffdca0, toneMapped: false }))
  );
  lamp.position.set(34, 26.8, -140);
  group.add(lamp);
  const cap = new THREE.Mesh(track(new THREE.ConeGeometry(2.3, 2.4, 18)), track(new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6 })));
  cap.position.set(34, 29.3, -140);
  group.add(cap);
  const beamGeo2 = track(new THREE.ConeGeometry(9, 150, 20, 1, true));
  beamGeo2.translate(0, -75, 0);
  beamGeo2.rotateZ(Math.PI / 2);
  const lhBeam = new THREE.Mesh(
    beamGeo2,
    track(new THREE.MeshBasicMaterial({ color: 0xffe0a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  );
  const lhPivot = new THREE.Group();
  lhPivot.position.set(34, 26.8, -140);
  lhPivot.add(lhBeam);
  group.add(lhPivot);
  const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  halo.position.set(34, 26.8, -140);
  halo.scale.setScalar(16);
  group.add(halo);

  // ---------- quay lamps ----------
  const lampN = 12;
  const headGeo = track(new THREE.SphereGeometry(0.4, 10, 8));
  const headMat = track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
  const poolMat = track(new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb870, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  const poleGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 9, 8));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.7 }));
  const poolGeo = track(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < lampN; i++) {
    const z = -68 + i * 7;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(-8.2, quayTop + 4.5, z);
    group.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(-8.2, quayTop + 9.1, z);
    group.add(head);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-8.2, quayTop + 0.08, z);
    pool.scale.set(15, 15, 1);
    group.add(pool);
  }

  // ---------- boats and buoys ----------
  type Boat = { g: THREE.Group; z: number; speed: number; off: number; dir: 1 | -1 };
  const hullBoat = track(new THREE.BoxGeometry(6, 1.2, 2));
  const cabinBoat = track(new THREE.BoxGeometry(2.2, 1.4, 1.6));
  const boats: Boat[] = [
    { z: -78, speed: 5, off: 20, dir: 1 },
    { z: -112, speed: 3.2, off: 90, dir: -1 },
    { z: -52, speed: 4, off: 150, dir: 1 },
  ].map((b, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(hullBoat, track(new THREE.MeshStandardMaterial({ color: [0xf2eee4, 0x2f6a8a, 0xb8423a][i], roughness: 0.5 }))));
    const cab = new THREE.Mesh(cabinBoat, track(new THREE.MeshStandardMaterial({ color: 0xece9e0, roughness: 0.5 })));
    cab.position.set(-0.6, 1.2, 0);
    g.add(cab);
    const red = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 8, 6)), track(new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false })));
    red.position.set(2.7, 0.8, -0.8);
    const green = new THREE.Mesh(red.geometry, track(new THREE.MeshBasicMaterial({ color: 0x30ff70, toneMapped: false })));
    green.position.set(2.7, 0.8, 0.8);
    g.add(red, green);
    group.add(g);
    return { g, ...b, dir: b.dir as 1 | -1 };
  });
  const buoyGeo = track(new THREE.SphereGeometry(0.55, 12, 10));
  const buoys = Array.from({ length: 8 }, (_, i) => {
    const base = new THREE.Color(i % 2 ? 0xff3a30 : 0x30e070);
    const mat = track(new THREE.MeshBasicMaterial({ color: base, toneMapped: false }));
    const m = new THREE.Mesh(buoyGeo, mat);
    m.position.set(18 + (i % 2) * 26 + R() * 4, 0.3, -20 - i * 14);
    group.add(m);
    return { m, mat, base, phase: R() * 6 };
  });

  // ---------- the way into the case study ----------
  const gate = buildGate({
    id: "harbor-cms",
    slug: "harbor-cms",
    title: "HARBOR CMS",
    subtitle: "DEVELOPER TOOLING · OPEN CASE STUDY",
    width: 40,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 38, -30);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3, fog?: THREE.FogExp2) => {
    gate.update(dt);
    const u = waterMat.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    if (fog) {
      u.uFog.value.copy(fog.color);
      u.uFogD.value = fog.density;
    }
    // the sea keeps the ship moving gently
    ship.position.y = Math.sin(time * 0.7) * 0.12;
    ship.rotation.z = Math.sin(time * 0.5) * 0.004;

    cranes.forEach((c) => {
      const tx = Math.sin(time * 0.17 + c.phase) * 14 + 8;
      const lift = 0.5 + 0.5 * Math.sin(time * 0.34 + c.phase * 1.7);
      const hookY = 8 + lift * 12;
      c.trolley.position.x = tx;
      c.cable.scale.y = 23.3 - hookY;
      c.cable.position.set(tx, (23.3 + hookY) / 2, 0);
      c.box.position.set(tx, hookY - CH / 2 - 0.3, 0);
    });

    lhPivot.rotation.y = time * 0.7;

    boats.forEach((b) => {
      const x = ((time * b.speed * b.dir + b.off) % 240) - 90;
      b.g.position.set(x, 0.15 + Math.sin(time * 1.3 + b.off) * 0.14, b.z);
      b.g.rotation.y = b.dir === 1 ? 0 : Math.PI;
      b.g.rotation.z = Math.sin(time * 1.1 + b.off) * 0.04;
    });
    buoys.forEach((b) => {
      b.m.position.y = 0.25 + Math.sin(time * 1.4 + b.phase) * 0.12;
      const on = Math.sin(time * 2.4 + b.phase) > -0.2 ? 1 : 0.18;
      b.mat.color.copy(b.base).multiplyScalar(on);
    });
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "harbor-cms"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
