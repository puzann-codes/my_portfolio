import * as THREE from "three";
import { clamp, rng, smoothstep, textPlane } from "./util";
import { buildGate } from "./gate";
import { glowTexture, linkBuilder, pulseMaterial } from "./pulse";

/**
 * Stage: LearnScape AI.
 * The product points a camera at an everyday object, names it, and draws the
 * physics as vectors over it. This environment stages that loop: a water
 * bottle on a plinth is found by a tightening viewfinder, a scan line passes
 * over it, and its forces (weight down, buoyancy up) appear as arrows with
 * their concept names. Around it, five more of the supported objects each
 * show their own concept in motion: projectile motion, angular velocity,
 * torque, a ramp, linear acceleration.
 */

const TEAL = 0x59e6d3;
const LIME = 0xc6f36a;
const AMBER = 0xffc46b;
const CORAL = 0xff7f6b;
const VIOLET = 0xa99bff;

function arrow(from: THREE.Vector3, to: THREE.Vector3, color: number, tracked: { dispose(): void }[]) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  tracked.push(mat);
  const shaftGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8);
  const headGeo = new THREE.ConeGeometry(0.4, 0.9, 12);
  tracked.push(shaftGeo, headGeo);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  const head = new THREE.Mesh(headGeo, mat);
  g.add(shaft, head);
  g.position.copy(from);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const set = (k: number) => {
    const L = Math.max(0.001, len * k);
    shaft.scale.set(1, Math.max(0.001, L - 0.8), 1);
    shaft.position.y = (L - 0.8) / 2;
    head.position.y = L - 0.45;
    head.visible = k > 0.08;
  };
  set(1);
  return { group: g, set };
}

export function buildLearnscape(opts: { quality: "high" | "low"; fonts: { hero: string } }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };
  const R = rng(77);
  const billboards: THREE.Object3D[] = [];

  // ---- the floor: a grid that reads as measured space ----
  const grid = new THREE.GridHelper(220, 44, 0x2f8a96, 0x1a4a58);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = -9;
  group.add(grid);
  tracked.push(grid.geometry, grid.material as THREE.Material);

  const label = (text: string, p: THREE.Vector3, w: number, color = "#bff7ee") => {
    const l = textPlane(text, { width: w, px: 64, letterSpacing: 0.14, weight: 600, color });
    l.position.copy(p);
    group.add(l);
    tracked.push(l.geometry, l.material);
    billboards.push(l);
    return l;
  };

  // ---- centrepiece: a water bottle being scanned ----
  const hero = new THREE.Group();
  hero.position.set(0, 0, 0);
  group.add(hero);

  const plinth = new THREE.Mesh(
    track(new THREE.CylinderGeometry(7, 7.6, 1.2, 48)),
    track(new THREE.MeshStandardMaterial({ color: 0x0f2530, roughness: 0.4, metalness: 0.6 }))
  );
  plinth.position.y = -8.4;
  hero.add(plinth);
  const plinthRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(7.1, 0.12, 8, 64)),
    track(new THREE.MeshBasicMaterial({ color: TEAL, toneMapped: false }))
  );
  plinthRing.rotation.x = Math.PI / 2;
  plinthRing.position.y = -7.8;
  hero.add(plinthRing);

  const profile: THREE.Vector2[] = [
    [0, 0],
    [2.1, 0],
    [2.5, 0.5],
    [2.6, 3],
    [2.55, 9],
    [2.2, 11],
    [1.35, 12.5],
    [1.0, 13.3],
    [0.95, 14.6],
    [1.15, 14.8],
    [1.15, 15.4],
    [0.9, 15.4],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bottleGeo = track(new THREE.LatheGeometry(profile, 40));
  const glass = new THREE.Mesh(
    bottleGeo,
    track(new THREE.MeshPhysicalMaterial({ color: 0xbfe9f5, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }))
  );
  glass.position.y = -7.2;
  hero.add(glass);
  const water = new THREE.Mesh(
    track(new THREE.CylinderGeometry(2.3, 2.1, 6.6, 36)),
    track(new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }))
  );
  water.position.y = -3.6;
  hero.add(water);

  // viewfinder: four corner brackets that settle onto the bottle
  const bracket = new THREE.Group();
  const bMat = track(new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.95 }));
  const corners: THREE.Group[] = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const c = new THREE.Group();
    const pts = [new THREE.Vector3(0, -sy * 2.4, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(-sx * 2.4, 0, 0)];
    c.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), bMat));
    c.userData = { sx, sy };
    corners.push(c);
    bracket.add(c);
  }
  bracket.position.set(0, 0, 3.4);
  hero.add(bracket);
  label("WATER BOTTLE", new THREE.Vector3(0, 11.6, 3.6), 11, "#e6ffc2");
  const conf = label("BUOYANCY", new THREE.Vector3(0, 9.4, 3.6), 7, "#bff7ee");

  // scan line
  const scan = new THREE.Mesh(
    track(new THREE.PlaneGeometry(8, 0.22)),
    track(new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  );
  scan.position.z = 2.8;
  hero.add(scan);

  // vectors: weight down, buoyancy up
  const weight = arrow(new THREE.Vector3(0, -3.4, 0), new THREE.Vector3(0, -12.4, 0), CORAL, tracked);
  const buoy = arrow(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 10.5, 0), LIME, tracked);
  weight.group.position.x = 4.4;
  buoy.group.position.x = -4.4;
  hero.add(weight.group, buoy.group);
  label("WEIGHT", new THREE.Vector3(7.8, -8.5, 1), 6, "#ffd0c6");
  label("BUOYANT FORCE", new THREE.Vector3(-8.6, 8.4, 1), 9, "#e6ffc2");

  // ---- five more supported objects, on small plinths along an arc ----
  const stations: {
    name: string;
    color: number;
    x: number;
    z: number;
    update: (t: number) => void;
  }[] = [];
  const station = (name: string, concept: string, color: number, x: number, z: number, build: (g: THREE.Group) => (t: number) => void) => {
    const g = new THREE.Group();
    g.position.set(x, -8.4, z);
    group.add(g);
    const base = new THREE.Mesh(
      track(new THREE.CylinderGeometry(4.2, 4.5, 0.8, 32)),
      track(new THREE.MeshStandardMaterial({ color: 0x102a35, roughness: 0.5, metalness: 0.5 }))
    );
    g.add(base);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(4.25, 0.07, 6, 48)), track(new THREE.MeshBasicMaterial({ color, toneMapped: false })));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);
    const inner = new THREE.Group();
    inner.position.y = 0.4;
    g.add(inner);
    const upd = build(inner);
    label(concept, new THREE.Vector3(x, -8.4 + 9.4, z), 9, "#d7fff8");
    stations.push({ name, color, x, z, update: upd });
  };

  const mat = (c: number, o = 0.9) => track(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, toneMapped: false }));
  const std = (c: number) => track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));

  // 1. a ball and its parabola
  station("ball", "PROJECTILE MOTION", AMBER, -34, -6, (g) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      pts.push(new THREE.Vector3(-3.2 + 6.4 * u, 0.4 + 6.2 * 4 * u * (1 - u), 0));
    }
    const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), track(new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.35, gapSize: 0.3 })));
    line.computeLineDistances();
    g.add(line);
    const ball = new THREE.Mesh(track(new THREE.SphereGeometry(0.7, 20, 14)), std(AMBER));
    g.add(ball);
    return (t) => {
      const u = (t * 0.28) % 1;
      ball.position.set(-3.2 + 6.4 * u, 0.4 + 6.2 * 4 * u * (1 - u), 0);
    };
  });
  // 2. a fan: angular velocity
  station("fan", "ANGULAR VELOCITY", TEAL, -17, -20, (g) => {
    const hub = new THREE.Group();
    hub.position.y = 4;
    g.add(hub);
    const stand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 4, 10)), std(0x5a7080));
    stand.position.y = 2;
    g.add(stand);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 3, 0.15)), std(TEAL));
      b.position.y = 1.7;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i * Math.PI) / 2;
      pivot.add(b);
      hub.add(pivot);
    }
    const arc = new THREE.Mesh(track(new THREE.TorusGeometry(3.6, 0.07, 6, 40, Math.PI * 1.5)), mat(TEAL, 0.8));
    arc.position.y = 4;
    g.add(arc);
    return (t) => {
      hub.rotation.z = -t * 3.2;
      arc.rotation.z = -t * 0.8;
    };
  });
  // 3. a door: torque
  station("door", "TORQUE", VIOLET, 0, -34, (g) => {
    const pivot = new THREE.Group();
    pivot.position.set(-2, 0, 0);
    g.add(pivot);
    const door = new THREE.Mesh(track(new THREE.BoxGeometry(4.2, 7.2, 0.4)), std(VIOLET));
    door.position.set(2.1, 3.6, 0);
    pivot.add(door);
    const handle = new THREE.Mesh(track(new THREE.SphereGeometry(0.28, 12, 10)), std(0xe8e4ff));
    handle.position.set(3.6, 3.4, 0.35);
    pivot.add(handle);
    const sweep = new THREE.Mesh(track(new THREE.RingGeometry(3.2, 3.3, 40, 1, 0, Math.PI / 2)), track(new THREE.MeshBasicMaterial({ color: VIOLET, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.8 })));
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.set(-2, 0.1, 0);
    g.add(sweep);
    return (t) => {
      pivot.rotation.y = Math.sin(t * 0.9) * 0.6 - 0.6;
    };
  });
  // 4. a ramp and a block: friction
  station("ramp", "FORCES ON A RAMP", CORAL, 17, -20, (g) => {
    const ramp = new THREE.Mesh(track(new THREE.BoxGeometry(8, 0.4, 4)), std(0x6b7f8a));
    ramp.rotation.z = 0.42;
    ramp.position.set(0, 1.6, 0);
    g.add(ramp);
    const block = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 1.2, 1.5)), std(CORAL));
    g.add(block);
    return (t) => {
      const u = 0.5 + 0.5 * Math.sin(t * 0.7);
      const x = THREE.MathUtils.lerp(-3, 3, u);
      block.position.set(x, 1.6 + Math.sin(0.42) * x + 0.85, 0);
      block.rotation.z = 0.42;
    };
  });
  // 5. a toy car: linear acceleration
  station("car", "ACCELERATION", LIME, 34, -6, (g) => {
    const body = new THREE.Group();
    g.add(body);
    const chassis = new THREE.Mesh(track(new THREE.BoxGeometry(3, 0.9, 1.6)), std(LIME));
    chassis.position.y = 0.9;
    body.add(chassis);
    const top = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.7, 1.4)), std(0xe9ffd0));
    top.position.set(-0.1, 1.6, 0);
    body.add(top);
    for (const [x, z] of [[-1, 0.85], [1, 0.85], [-1, -0.85], [1, -0.85]]) {
      const w = new THREE.Mesh(track(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14)), std(0x111820));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.45, z);
      body.add(w);
    }
    return (t) => {
      const u = (t * 0.16) % 1;
      // accelerates from rest, then resets
      body.position.x = -3.4 + 7 * u * u;
    };
  });

  // ---- a field of weak numbers falling toward the plinth: the physics engine ----
  const N = high ? 260 : 110;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos.set([(R() - 0.5) * 70, R() * 40 - 8, (R() - 0.5) * 70 - 8], i * 3);
    seed[i] = R();
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pMat = track(new THREE.PointsMaterial({ color: TEAL, size: 0.55, map: glowTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  const motes = new THREE.Points(pGeo, pMat);
  motes.frustumCulled = false;
  group.add(motes);

  // links from the bottle to every station: one engine, many objects
  const lb = linkBuilder();
  for (const s of stations) {
    lb.add(new THREE.Vector3(0, -7.6, 0), new THREE.Vector3(s.x, -7.6, s.z), new THREE.Color(TEAL), new THREE.Color(s.color), (s.x * 0.013 + 1) % 1);
  }
  const linkMat = track(pulseMaterial({ base: 0.28, speed: 0.2 }));
  const links = new THREE.LineSegments(track(lb.geometry()), linkMat);
  links.frustumCulled = false;
  group.add(links);

  const gate = buildGate({
    id: "learnscape-ai",
    slug: "learnscape-ai",
    title: "LEARNSCAPE AI",
    subtitle: "PHYSICS THROUGH THE CAMERA · OPEN CASE STUDY",
    width: 40,
    fonts: opts.fonts,
  });
  gate.group.position.set(0, 20, -44);
  group.add(gate.group);

  const gp = new THREE.Vector3();
  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    gate.update(dt);
    linkMat.uniforms.uTime.value = time;
    // lock-on cycle: brackets open wide, close onto the bottle, hold, then loosen
    const c = (time % 7) / 7;
    const lock = smoothstep(0.05, 0.4, c) * (1 - smoothstep(0.85, 1, c));
    const spread = 5.4 + (1 - lock) * 4.2;
    for (const k of corners) {
      const { sx, sy } = k.userData as { sx: number; sy: number };
      k.position.set(sx * spread * 0.9, sy * spread * 1.6 + 0.4, 0);
    }
    bMat.opacity = 0.35 + 0.65 * lock;
    // scan line passes up the bottle while locked
    const sc = smoothstep(0.35, 0.7, c);
    scan.position.y = -7.2 + 16 * sc;
    (scan.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(Math.PI * clamp(sc)) * (sc > 0 && sc < 1 ? 1 : 0);
    // vectors grow in once it is recognised
    const grow = smoothstep(0.6, 0.78, c) * (1 - smoothstep(0.93, 1, c));
    weight.set(Math.max(0.001, grow));
    buoy.set(Math.max(0.001, grow));
    conf.visible = grow > 0.3;
    hero.rotation.y = Math.sin(time * 0.25) * 0.08;
    water.position.y = -3.6 + Math.sin(time * 1.4) * 0.04;
    for (const s of stations) s.update(time);
    const arr = pGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = arr.getY(i) - dt * (0.6 + seed[i] * 1.4);
      if (y < -9) y = 31;
      arr.setY(i, y);
    }
    arr.needsUpdate = true;
    for (const b of billboards) b.lookAt(cam.x, b.position.y, cam.z);
    gate.group.getWorldPosition(gp);
    gate.group.lookAt(cam.x, gp.y, cam.z);
  };

  return {
    group,
    update,
    pickables: [gate.hit] as THREE.Object3D[],
    setHover: (id: string | null) => gate.setHover(id === "learnscape-ai"),
    dispose() {
      gate.dispose();
      tracked.forEach((d) => d.dispose());
    },
  };
}
