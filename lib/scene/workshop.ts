import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, clamp, lerp, makeCanvas, rng } from "./util";

/**
 * Stage 5 — the workshop. A bench with one physical object per featured
 * project. Some are finished and glossy; others are wireframe, half-built
 * or still on the scaffold. Hover lifts an object; click opens its page.
 */

export type ProjectRef = { slug: string; title: string };

type Obj = {
  group: THREE.Group;
  hover: number;
  mats: THREE.MeshStandardMaterial[];
  lines: { mat: THREE.LineBasicMaterial; base: number }[];
  tick: (t: number) => void;
  baseY: number;
};

export function buildWorkshop(projects: ProjectRef[], opts: { quality: "high" | "low" }) {
  const high = opts.quality === "high";
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];
  const R = rng(99);
  const track = <T extends { dispose(): void }>(x: T) => {
    tracked.push(x);
    return x;
  };

  const mWhite = track(new THREE.MeshStandardMaterial({ color: 0xe9e9e5, roughness: 0.34, metalness: 0.05 }));
  const mGrey = track(new THREE.MeshStandardMaterial({ color: 0x2f2f32, roughness: 0.55, metalness: 0.3 }));
  const mMid = track(new THREE.MeshStandardMaterial({ color: 0x8c8c89, roughness: 0.45, metalness: 0.2 }));
  const mChrome = track(new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.12, metalness: 1 }));
  const mDark = track(new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.5, metalness: 0.2 }));
  const hoverMats = [mWhite, mGrey, mMid, mChrome, mDark];

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
    track(g);
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast;
    o.receiveShadow = receive;
    return o;
  };

  // ---- room ----
  const floor = mesh(new THREE.PlaneGeometry(60, 40), track(new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1 })), false, true);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // pegboard wall
  const pc = makeCanvas(1024, 512);
  const pctx = pc.getContext("2d")!;
  pctx.fillStyle = "#101012";
  pctx.fillRect(0, 0, 1024, 512);
  pctx.fillStyle = "rgba(255,255,255,0.13)";
  for (let y = 16; y < 512; y += 32) for (let x = 16; x < 1024; x += 32) pctx.fillRect(x - 2, y - 2, 4, 4);
  pctx.strokeStyle = "rgba(255,255,255,0.38)";
  pctx.lineWidth = 3;
  pctx.lineCap = "round";
  // tool silhouettes: wrench, hammer, saw, pliers
  const stroke = (pts: [number, number][]) => {
    pctx.beginPath();
    pts.forEach(([x, y], i) => (i ? pctx.lineTo(x, y) : pctx.moveTo(x, y)));
    pctx.stroke();
  };
  stroke([[130, 120], [130, 330]]);
  pctx.beginPath(); pctx.arc(130, 100, 28, 0, Math.PI * 2); pctx.stroke();
  stroke([[300, 150], [300, 340]]);
  stroke([[262, 150], [338, 150], [338, 118], [262, 118], [262, 150]]);
  stroke([[500, 110], [640, 110], [600, 330]]);
  stroke([[500, 110], [540, 330], [600, 330]]);
  stroke([[780, 110], [850, 330]]);
  stroke([[830, 110], [790, 330]]);
  const pegTex = track(canvasTexture(pc, 4));
  const wall = mesh(new THREE.PlaneGeometry(18, 9), track(new THREE.MeshStandardMaterial({ map: pegTex, roughness: 0.9 })), false, true);
  wall.position.set(0, 4.3, -3.6);
  group.add(wall);

  // shelf with boxes
  const shelf = mesh(new RoundedBoxGeometry(7, 0.1, 0.7, 1, 0.02), mGrey, true, true);
  shelf.position.set(-1.5, 3.6, -3.2);
  group.add(shelf);
  for (let i = 0; i < 7; i++) {
    const w = 0.4 + R() * 0.5;
    const h = 0.35 + R() * 0.6;
    const b = mesh(new RoundedBoxGeometry(w, h, 0.45, 1, 0.02), i % 3 === 0 ? mWhite : mMid);
    b.position.set(-4.7 + i * 0.95, 3.65 + h / 2, -3.2);
    group.add(b);
  }

  // ---- bench ----
  const benchTop = mesh(new RoundedBoxGeometry(7, 0.14, 2.5, 3, 0.03), track(new THREE.MeshStandardMaterial({ color: 0x1f1f21, roughness: 0.7, metalness: 0.1 })));
  benchTop.position.y = 0.93;
  group.add(benchTop);
  const legMat = track(new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.7 }));
  for (const [x, z] of [[-3.2, -1], [3.2, -1], [-3.2, 1], [3.2, 1]]) {
    const leg = mesh(new THREE.BoxGeometry(0.2, 0.93, 0.2), legMat);
    leg.position.set(x, 0.465, z);
    group.add(leg);
  }
  const lower = mesh(new RoundedBoxGeometry(6.6, 0.06, 2.1, 1, 0.02), legMat);
  lower.position.y = 0.32;
  group.add(lower);

  const Y = 1.0; // bench surface

  // ---- the objects ----
  const objs: Obj[] = [];
  const hits: THREE.Object3D[] = [];
  const edgeMat = (opacity: number) => {
    const m = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity }));
    return { mat: m, base: opacity };
  };

  const makeObj = (i: number, x: number, z: number, build: (o: Obj) => void) => {
    const p = projects[i];
    const g = new THREE.Group();
    g.position.set(x, Y, z);
    g.userData = { slug: p.slug, title: p.title };
    const o: Obj = { group: g, hover: 0, mats: hoverMats, lines: [], tick: () => {}, baseY: Y };
    build(o);
    const hit = new THREE.Mesh(track(new THREE.SphereGeometry(0.62, 12, 10)), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.5;
    g.add(hit);
    hits.push(hit);
    group.add(g);
    objs.push(o);
  };
  const addLines = (o: Obj, geo: THREE.BufferGeometry, parent: THREE.Object3D, opacity: number, pos?: THREE.Vector3) => {
    const e = edgeMat(opacity);
    o.lines.push(e);
    const l = new THREE.LineSegments(track(geo), e.mat);
    if (pos) l.position.copy(pos);
    parent.add(l);
    return l;
  };
  const plinth = (o: Obj, r = 0.5) => {
    const p = mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.04, 40), mGrey);
    p.position.y = 0.02;
    o.group.add(p);
  };

  // 0 — Sunūwā: a miniature city on a plate (finished)
  makeObj(0, -2.5, 0.1, (o) => {
    const plate = mesh(new RoundedBoxGeometry(1.05, 0.05, 1.05, 1, 0.015), mGrey);
    plate.position.y = 0.025;
    o.group.add(plate);
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const h = 0.12 + R() * 0.55 + (a === 1 && b === 1 ? 0.35 : 0);
        const w = 0.22 + R() * 0.06;
        const bx = mesh(new THREE.BoxGeometry(w, h, w), (a + b) % 2 ? mWhite : mMid);
        bx.position.set((a - 1) * 0.32, 0.05 + h / 2, (b - 1) * 0.32);
        o.group.add(bx);
        addLines(o, new THREE.EdgesGeometry(bx.geometry), bx, 0.35);
      }
    }
  });

  // 1 — Crash Capsule: a capsule and a toy car, with a trajectory (finished)
  makeObj(1, -1.5, 0.1, (o) => {
    plinth(o, 0.55);
    const cap = mesh(new THREE.CapsuleGeometry(0.2, 0.5, 8, 24), mWhite);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0, 0.28, -0.05);
    o.group.add(cap);
    const band = mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), mDark);
    band.rotation.y = Math.PI / 2;
    band.position.set(0.12, 0.28, -0.05);
    o.group.add(band);
    const car = new THREE.Group();
    const cb = mesh(new RoundedBoxGeometry(0.34, 0.09, 0.17, 2, 0.03), mGrey);
    cb.position.y = 0.075;
    const cc = mesh(new RoundedBoxGeometry(0.19, 0.08, 0.15, 2, 0.03), mMid);
    cc.position.set(-0.02, 0.15, 0);
    car.add(cb, cc);
    car.position.set(-0.05, 0.04, 0.38);
    car.rotation.y = 0.35;
    o.group.add(car);
    const pts = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.5, 0.05, 0.5), new THREE.Vector3(0, 0.05, 0.1), new THREE.Vector3(0.45, 0.05, 0.45)).getPoints(30);
    addLines(o, new THREE.BufferGeometry().setFromPoints(pts), o.group, 0.5);
    o.tick = (t) => {
      car.position.x = -0.05 + Math.sin(t * 0.8) * 0.05;
    };
  });

  // 2 — Aria Copilot: a chrome sphere with orbiting rings (finished)
  makeObj(2, -0.5, 0.1, (o) => {
    plinth(o, 0.42);
    const core = mesh(new THREE.SphereGeometry(0.28, 48, 32), mChrome);
    core.position.y = 0.52;
    o.group.add(core);
    const rings: THREE.Mesh[] = [];
    for (let k = 0; k < 2; k++) {
      const r = mesh(new THREE.TorusGeometry(0.42 + k * 0.07, 0.007, 8, 64), mWhite, false, false);
      r.position.y = 0.52;
      o.group.add(r);
      rings.push(r);
    }
    o.tick = (t) => {
      rings[0].rotation.set(t * 0.6, 0.4, 0);
      rings[1].rotation.set(0.9, t * 0.45, t * 0.2);
    };
  });

  // 3 — Signal Atlas: a wireframe globe on a scaffold (experimental)
  makeObj(3, 0.5, 0.1, (o) => {
    plinth(o, 0.42);
    const globe = new THREE.Group();
    globe.position.y = 0.55;
    o.group.add(globe);
    const sphere = mesh(new THREE.SphereGeometry(0.33, 32, 24), mDark, false, false);
    globe.add(sphere);
    addLines(o, new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.345, 2)), globe, 0.6);
    for (let k = 0; k < 3; k++) {
      const a = new THREE.Vector3().setFromSphericalCoords(0.34, 0.9 + k * 0.6, k * 2.1);
      const b = new THREE.Vector3().setFromSphericalCoords(0.34, 1.9 + k * 0.3, k * 2.1 + 1.6);
      const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(1.7);
      const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(24);
      addLines(o, new THREE.BufferGeometry().setFromPoints(pts), globe, 0.95);
    }
    for (const [sx, sz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const strut = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 6), mMid, false, false);
      strut.position.set(sx, 0.3, sz);
      o.group.add(strut);
    }
    o.tick = (t) => {
      globe.rotation.y = t * 0.35;
    };
  });

  // 4 — Nova Render: a half-built cube lattice (experimental)
  makeObj(4, 1.5, 0.1, (o) => {
    plinth(o, 0.5);
    const cubes: THREE.Object3D[] = [];
    const cubeGeo = track(new THREE.BoxGeometry(0.11, 0.11, 0.11));
    const cubeEdges = track(new THREE.EdgesGeometry(cubeGeo));
    const lat = new THREE.Group();
    lat.position.y = 0.42;
    o.group.add(lat);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          const r = R();
          const p = new THREE.Vector3((a - 1.5) * 0.15, (b - 1.5) * 0.15, (c - 1.5) * 0.15);
          if (r < 0.42) {
            const s = new THREE.Mesh(cubeGeo, mWhite);
            s.castShadow = true;
            s.position.copy(p);
            lat.add(s);
            cubes.push(s);
          } else if (r < 0.75) {
            const e = edgeMat(0.55);
            o.lines.push(e);
            const l = new THREE.LineSegments(cubeEdges, e.mat);
            l.position.copy(p);
            lat.add(l);
          }
        }
      }
    }
    o.tick = (t) => {
      lat.rotation.y = t * 0.2;
      cubes.forEach((c, i) => (c.position.y += Math.sin(t * 1.2 + i) * 0.00035));
    };
  });

  // 5 — Harbor CMS: a stack of rotated slabs (finished)
  makeObj(5, 2.5, 0.1, (o) => {
    plinth(o, 0.5);
    const slabs: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) {
      const s = mesh(new RoundedBoxGeometry(0.66, 0.07, 0.48, 2, 0.02), k % 2 ? mMid : mWhite);
      s.position.y = 0.1 + k * 0.13;
      s.rotation.y = k * 0.2;
      o.group.add(s);
      slabs.push(s);
    }
    o.tick = (t) => {
      slabs.forEach((s, k) => (s.rotation.y = k * 0.2 + Math.sin(t * 0.5 + k) * 0.08));
    };
  });

  // ---- bench clutter ----
  const knot = mesh(new THREE.TorusKnotGeometry(0.12, 0.022, 80, 8), mChrome);
  knot.position.set(-3.0, Y + 0.14, 0.75);
  knot.rotation.x = 1.2;
  group.add(knot);
  for (let i = 0; i < 7; i++) {
    const s = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), mMid, true, false);
    s.rotation.set(Math.PI / 2, 0, R() * 3);
    s.position.set(2.9 + R() * 0.3, Y + 0.02, 0.5 + R() * 0.4);
    group.add(s);
  }
  const paperCanvas = makeCanvas(512, 340);
  const pcx = paperCanvas.getContext("2d")!;
  pcx.fillStyle = "#e7e5dc";
  pcx.fillRect(0, 0, 512, 340);
  pcx.strokeStyle = "rgba(30,30,40,0.25)";
  pcx.lineWidth = 1;
  for (let x = 0; x < 512; x += 20) { pcx.beginPath(); pcx.moveTo(x, 0); pcx.lineTo(x, 340); pcx.stroke(); }
  for (let y = 0; y < 340; y += 20) { pcx.beginPath(); pcx.moveTo(0, y); pcx.lineTo(512, y); pcx.stroke(); }
  pcx.strokeStyle = "rgba(20,20,30,0.8)";
  pcx.lineWidth = 2.5;
  pcx.strokeRect(60, 70, 160, 120);
  pcx.beginPath(); pcx.arc(340, 130, 60, 0, Math.PI * 2); pcx.moveTo(220, 130); pcx.lineTo(280, 130); pcx.stroke();
  pcx.beginPath(); pcx.moveTo(60, 250); pcx.bezierCurveTo(160, 200, 300, 300, 460, 240); pcx.stroke();
  const paper = mesh(new THREE.PlaneGeometry(1.3, 0.86), track(new THREE.MeshStandardMaterial({ map: track(canvasTexture(paperCanvas, 4)), roughness: 0.95 })), false, true);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.1;
  paper.position.set(-0.3, Y + 0.004, 0.92);
  group.add(paper);

  // ---- light ----
  const spot = new THREE.SpotLight(0xffffff, 150, 0, 0.58, 0.85, 2);
  spot.position.set(0.4, 6, 3.2);
  spot.target.position.set(0, 1, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  spot.shadow.bias = -0.0003;
  spot.shadow.radius = 4;
  group.add(spot, spot.target);
  group.add(new THREE.AmbientLight(0xffffff, 0.2));
  const rim = new THREE.PointLight(0xffffff, 18, 0, 2);
  rim.position.set(-4, 3, -2);
  group.add(rim);

  let hoverSlug: string | null = null;
  const update = (t: number, dt: number) => {
    for (const o of objs) {
      const want = o.group.userData.slug === hoverSlug ? 1 : 0;
      o.hover = lerp(o.hover, want, clamp(dt * 9));
      o.group.scale.setScalar(1 + o.hover * 0.1);
      o.group.position.y = o.baseY + o.hover * 0.06;
      o.tick(t);
      for (const l of o.lines) l.mat.opacity = clamp(l.base + o.hover * 0.5);
    }
    // hovered object brightens its (shared) materials a touch
    const any = objs.reduce((m, o) => Math.max(m, o.hover), 0);
    for (const m of hoverMats) m.emissive.setScalar(any * 0.1);
  };

  return {
    group,
    pickables: hits,
    update,
    setHover(slug: string | null) {
      hoverSlug = slug;
    },
    dispose() {
      tracked.forEach((d) => d.dispose());
    },
  };
}
