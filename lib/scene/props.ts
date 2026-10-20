import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, clamp, makeCanvas, rng } from "./util";
import {
  coverTexture,
  makePageCanvas,
  paintClock,
  paintNotebookPage,
  type SceneFonts,
  type SketchProgress,
} from "./textures";

/**
 * Desk props. Each builder returns a group plus the few handles the scene
 * director needs. Geometry is deliberately light: a few hundred triangles per
 * object, shared materials where it makes sense.
 */

export type Kit = {
  track: <T extends { dispose(): void }>(x: T) => T;
  mesh: (g: THREE.BufferGeometry, m: THREE.Material, cast?: boolean, receive?: boolean) => THREE.Mesh;
  shadowTex: THREE.Texture;
  /** a soft contact shadow, parented to `parent`, lying on the surface below it */
  addContact: (
    parent: THREE.Object3D,
    w: number,
    d: number,
    o?: { x?: number; y?: number; z?: number; rot?: number; alpha?: number }
  ) => void;
};

const std = (kit: Kit, p: THREE.MeshStandardMaterialParameters) => kit.track(new THREE.MeshStandardMaterial(p));

function hit(kit: Kit, w: number, h: number, d: number, data: Record<string, unknown>) {
  const m = new THREE.Mesh(
    kit.track(new THREE.BoxGeometry(w, h, d)),
    kit.track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  m.userData = data;
  return m;
}

/* ============================ notebook ============================ */

export function buildNotebook(kit: Kit, fonts: SceneFonts) {
  const root = new THREE.Group();
  const CW = 0.152;
  const CD = 0.208;
  const CT = 0.0035;
  const PT = 0.012;
  const PW = 0.146;
  const PD = 0.202;

  const coverTex = kit.track(coverTexture());
  const coverMat = std(kit, { color: 0xffffff, map: coverTex, roughness: 0.82, metalness: 0.02 });
  const paperMat = std(kit, { color: 0xe6e2d5, roughness: 0.96 });
  const bandMat = std(kit, { color: 0x2a2c32, roughness: 0.75 });

  const back = kit.mesh(new RoundedBoxGeometry(CW, CT, CD, 2, 0.0012), coverMat);
  back.position.y = CT / 2;
  root.add(back);

  const pages = kit.mesh(new THREE.BoxGeometry(PW, PT, PD), paperMat);
  pages.position.set(0.002, CT + PT / 2, 0);
  root.add(pages);

  // the page you write on: a slightly curled sheet on top of the block
  const pageCanvas = makePageCanvas();
  kit.track(pageCanvas.tex);
  const pageGeo = kit.track(new THREE.PlaneGeometry(PW - 0.004, PD - 0.004, 14, 18));
  pageGeo.rotateX(-Math.PI / 2);
  const pp = pageGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const u = pp.getX(i) / (PW - 0.004) + 0.5; // 0 spine … 1 fore-edge
    const v = pp.getZ(i) / (PD - 0.004) + 0.5;
    pp.setY(i, 0.0046 * Math.pow(u, 3) + 0.0007 * Math.sin(v * 3.1) * u);
  }
  pageGeo.computeVertexNormals();
  const pageMat = std(kit, { map: pageCanvas.tex, roughness: 0.92 });
  const page = kit.mesh(pageGeo, pageMat, false, true);
  page.position.set(0.002, CT + PT + 0.0004, 0);
  root.add(page);

  // pages on the left, which only exist once the cover is open
  const leftPages = kit.mesh(new THREE.BoxGeometry(PW, PT, PD), paperMat);
  leftPages.position.set(-0.002 - CW + 0.0, CT + PT / 2, 0);
  leftPages.scale.y = 0.001;
  root.add(leftPages);

  // the front cover, hinged at the spine
  const hinge = new THREE.Group();
  hinge.position.set(-CW / 2, CT + PT, 0);
  root.add(hinge);
  const front = kit.mesh(new RoundedBoxGeometry(CW, CT, CD, 2, 0.0012), coverMat);
  front.position.set(CW / 2, CT / 2, 0);
  hinge.add(front);
  const band = kit.mesh(new THREE.BoxGeometry(0.0042, CT + 0.0012, CD + 0.0012), bandMat, false, false);
  band.position.set(CW * 0.78, CT / 2, 0);
  hinge.add(band);

  // bookmark ribbon + a folded corner
  const ribbon = kit.mesh(new THREE.BoxGeometry(0.0026, 0.0006, 0.048), bandMat, false, false);
  ribbon.position.set(0.034, CT + PT + 0.0006, PD / 2 + 0.02);
  ribbon.rotation.y = 0.09;
  root.add(ribbon);

  let openAmt = 0;
  const setOpen = (v: number) => {
    const o = clamp(v);
    if (o === openAmt) return;
    openAmt = o;
    hinge.rotation.z = o * 3.02;
    hinge.position.y = THREE.MathUtils.lerp(CT + PT, CT, o);
    leftPages.scale.y = Math.max(0.001, o);
    leftPages.position.y = CT + (PT * Math.max(0.001, o)) / 2;
    ribbon.visible = true;
  };

  const sketch: SketchProgress = { note: 0, s1: 0, s2: 0, s3: 0 };
  let dirty = true;
  let lastPaint = 0;
  const repaint = () => {
    paintNotebookPage(pageCanvas.ctx, 640, 880, sketch, fonts);
    pageCanvas.tex.needsUpdate = true;
    dirty = false;
  };
  repaint();
  const setSketch = (s: SketchProgress) => {
    if (
      Math.abs(s.note - sketch.note) > 0.004 ||
      Math.abs(s.s1 - sketch.s1) > 0.004 ||
      Math.abs(s.s2 - sketch.s2) > 0.004 ||
      Math.abs(s.s3 - sketch.s3) > 0.004
    ) {
      sketch.note = s.note;
      sketch.s1 = s.s1;
      sketch.s2 = s.s2;
      sketch.s3 = s.s3;
      dirty = true;
    }
  };

  kit.addContact(root, 0.19, 0.25, { alpha: 0.7 });
  const hitMesh = hit(kit, 0.17, 0.05, 0.22, { id: "notebook", title: "Notebook", label: "THE IDEA" });
  hitMesh.position.y = 0.02;
  root.add(hitMesh);

  return {
    group: root,
    hit: hitMesh,
    setOpen,
    setSketch,
    update(t: number) {
      // page repaints are throttled; the texture upload is the expensive part
      if (dirty && t - lastPaint > 0.033) {
        lastPaint = t;
        repaint();
      }
    },
  };
}

/** A mechanical pencil, lying on the desk. */
export function buildPencil(kit: Kit) {
  const g = new THREE.Group();
  const body = std(kit, { color: 0x1a1b1f, roughness: 0.4, metalness: 0.5 });
  const metal = std(kit, { color: 0xc4c6cb, roughness: 0.25, metalness: 1 });
  const barrel = kit.mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.13, 16), body);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);
  const tip = kit.mesh(new THREE.ConeGeometry(0.0034, 0.02, 16), metal);
  tip.rotation.z = Math.PI / 2;
  tip.position.x = 0.075;
  g.add(tip);
  const lead = kit.mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.006, 6), body, false, false);
  lead.rotation.z = Math.PI / 2;
  lead.position.x = 0.0875;
  g.add(lead);
  const cap = kit.mesh(new THREE.CylinderGeometry(0.0029, 0.0029, 0.012, 16), metal);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = -0.07;
  g.add(cap);
  const clip = kit.mesh(new THREE.BoxGeometry(0.03, 0.0008, 0.0022), metal, false, false);
  clip.position.set(-0.045, 0.0036, 0);
  g.add(clip);
  g.position.y = 0.0036;
  return g;
}

/* ============================== cup =============================== */

export function buildCup(kit: Kit) {
  const g = new THREE.Group();
  const ceramic = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: 0xe7e2d5,
      roughness: 0.6,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
    })
  );
  // lathe profile: foot, wall, rolled lip, then back down the inside
  const prof: [number, number][] = [
    [0, 0],
    [0.029, 0],
    [0.0335, 0.004],
    [0.038, 0.02],
    [0.0405, 0.06],
    [0.0412, 0.088],
    [0.0402, 0.0925],
    [0.0388, 0.0915],
    [0.0368, 0.088],
    [0.0356, 0.06],
    [0.0322, 0.014],
    [0.0, 0.011],
  ];
  const cupGeo = kit.track(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56));
  const cup = new THREE.Mesh(cupGeo, ceramic);
  cup.castShadow = true;
  cup.receiveShadow = true;
  g.add(cup);

  const handle = kit.mesh(new THREE.TorusGeometry(0.0235, 0.0043, 10, 28, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.0405, 0.05, 0);
  g.add(handle);

  const cremaC = makeCanvas(256, 256);
  {
    const x = cremaC.getContext("2d")!;
    const gr = x.createRadialGradient(128, 128, 6, 128, 128, 128);
    gr.addColorStop(0, "#24130a");
    gr.addColorStop(0.55, "#3a2213");
    gr.addColorStop(0.86, "#6b4527");
    gr.addColorStop(1, "#2b180c");
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    const R = rng(77);
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2;
      const r = 70 + R() * 50;
      x.fillStyle = `rgba(210,170,120,${0.08 + R() * 0.14})`;
      x.beginPath();
      x.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1 + R() * 2.4, 0, Math.PI * 2);
      x.fill();
    }
  }
  const coffee = kit.mesh(
    new THREE.CircleGeometry(0.0358, 48),
    kit.track(
      new THREE.MeshPhysicalMaterial({
        map: kit.track(canvasTexture(cremaC, 4)),
        roughness: 0.14,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      })
    ),
    false,
    false
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.078;
  g.add(coffee);

  // saucer-less, but a small coaster keeps the walnut from looking bare
  const coaster = kit.mesh(
    new THREE.CylinderGeometry(0.056, 0.056, 0.004, 40),
    std(kit, { color: 0x2c2d30, roughness: 0.9 }),
    false,
    true
  );
  coaster.position.y = 0.002;
  g.add(coaster);
  cup.position.y = 0.004;
  handle.position.y += 0.004;
  coffee.position.y += 0.004;
  kit.addContact(g, 0.16, 0.14, { alpha: 0.6 });

  // steam: a few soft wisps, driven by one uniform
  const R = rng(37);
  const N = 44;
  const base = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * 0.014;
    base.set([Math.cos(a) * r, 0.085, Math.sin(a) * r], i * 3);
    seed[i] = R();
  }
  const sGeo = kit.track(new THREE.BufferGeometry());
  sGeo.setAttribute("position", new THREE.BufferAttribute(base, 3));
  sGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const sMat = kit.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uT: { value: 0 }, uI: { value: 0.15 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uT;
        uniform float uScale;
        varying float vA;
        void main() {
          float t = fract(uT * (0.07 + aSeed * 0.04) + aSeed);
          vec3 p = position;
          p.y += t * 0.17;
          p.x += sin(t * 5.0 + aSeed * 40.0) * 0.012 * t + (aSeed - 0.5) * 0.01 * t;
          p.z += cos(t * 4.0 + aSeed * 30.0) * 0.01 * t;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (7.0 + t * 24.0) * uScale / -mv.z;
          vA = smoothstep(0.0, 0.22, t) * pow(1.0 - t, 1.3);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * smoothstep(0.5, 0.15, d) * vA * uI * 0.16;
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), a);
        }`,
    })
  );
  const steam = new THREE.Points(sGeo, sMat);
  steam.position.y = 0.004;
  steam.frustumCulled = false;
  g.add(steam);

  const hitMesh = hit(kit, 0.12, 0.11, 0.1, { id: "cup", title: "Coffee", label: "PAUSE" });
  hitMesh.position.set(0.01, 0.055, 0);
  g.add(hitMesh);

  return {
    group: g,
    hit: hitMesh,
    setSteam(i: number) {
      sMat.uniforms.uI.value = i;
    },
    update(t: number, viewScale: number) {
      sMat.uniforms.uT.value = t;
      sMat.uniforms.uScale.value = viewScale;
    },
  };
}

/* ====================== headphones on a stand ===================== */

export function buildHeadphones(kit: Kit) {
  const g = new THREE.Group();
  const black = std(kit, { color: 0x0e0f12, roughness: 0.55, metalness: 0.3 });
  const alu = std(kit, { color: 0xb9bcc3, roughness: 0.3, metalness: 1 });
  const pad = std(kit, { color: 0x17181b, roughness: 0.95 });

  const base = kit.mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.008, 40), black);
  base.position.y = 0.004;
  g.add(base);
  const rod = kit.mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 14), alu);
  rod.position.y = 0.108;
  g.add(rod);
  const crown = kit.mesh(new THREE.SphereGeometry(0.014, 18, 12), black);
  crown.position.y = 0.212;
  g.add(crown);

  // the headband, an arch resting on the stand
  const band = kit.mesh(new THREE.TorusGeometry(0.082, 0.0075, 10, 40, Math.PI), black);
  band.position.y = 0.158;
  g.add(band);
  const slider = kit.mesh(new THREE.TorusGeometry(0.0835, 0.002, 6, 30, 0.9), alu, false, false);
  slider.position.y = 0.158;
  slider.rotation.z = Math.PI / 2 - 0.45 + 0.45;
  g.add(slider);
  for (const s of [-1, 1]) {
    const cup = kit.mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.034, 40), black);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.086, 0.14, 0);
    g.add(cup);
    const cushion = kit.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 32), pad);
    cushion.rotation.z = Math.PI / 2;
    cushion.position.set(s * 0.066, 0.14, 0);
    g.add(cushion);
    const ring = kit.mesh(new THREE.TorusGeometry(0.044, 0.0015, 6, 36), alu, false, false);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(s * 0.104, 0.14, 0);
    g.add(ring);
  }
  kit.addContact(g, 0.17, 0.14, { alpha: 0.65 });
  return g;
}

/* =============================== books ============================ */

export function buildBooks(kit: Kit) {
  const g = new THREE.Group();
  const defs: { w: number; h: number; d: number; color: number; rot: number; dx: number; dz: number }[] = [
    { w: 0.22, h: 0.034, d: 0.15, color: 0x2a2c31, rot: 0.04, dx: 0, dz: 0 },
    { w: 0.2, h: 0.026, d: 0.14, color: 0xcfc8b6, rot: -0.12, dx: 0.008, dz: 0.004 },
    { w: 0.17, h: 0.022, d: 0.12, color: 0x38424f, rot: 0.2, dx: -0.006, dz: -0.004 },
  ];
  const paper = std(kit, { color: 0xe4e0d2, roughness: 0.95 });
  let y = 0;
  for (const b of defs) {
    const cover = std(kit, { color: b.color, roughness: 0.8 });
    const book = new THREE.Group();
    const body = kit.mesh(new RoundedBoxGeometry(b.w, b.h, b.d, 2, 0.002), cover);
    body.position.y = b.h / 2;
    book.add(body);
    // exposed page block on the fore-edge
    const pages = kit.mesh(new THREE.BoxGeometry(b.w - 0.012, b.h - 0.006, 0.004), paper, false, false);
    pages.position.set(0.004, b.h / 2, b.d / 2 - 0.001);
    book.add(pages);
    const label = kit.mesh(
      new THREE.BoxGeometry(0.0008, b.h * 0.5, 0.05),
      std(kit, { color: 0xe9e6dc, roughness: 0.6 }),
      false,
      false
    );
    label.position.set(-b.w / 2 - 0.0002, b.h / 2, 0);
    book.add(label);
    book.position.set(b.dx, y, b.dz);
    book.rotation.y = b.rot;
    y += b.h;
    g.add(book);
  }
  kit.addContact(g, 0.29, 0.22, { alpha: 0.6 });
  return g;
}

/* =============================== clock ============================ */

export function buildClock(kit: Kit) {
  const g = new THREE.Group();
  const alu = std(kit, { color: 0xb4b7bd, roughness: 0.32, metalness: 1 });
  const black = std(kit, { color: 0x101114, roughness: 0.6 });
  const foot = kit.mesh(new RoundedBoxGeometry(0.1, 0.008, 0.05, 2, 0.003), black);
  foot.position.y = 0.004;
  g.add(foot);
  const post = kit.mesh(new THREE.BoxGeometry(0.014, 0.03, 0.01), alu);
  post.position.y = 0.022;
  g.add(post);
  const rim = kit.mesh(new THREE.TorusGeometry(0.044, 0.0042, 12, 48), alu);
  rim.position.y = 0.081;
  g.add(rim);
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d")!;
  const tex = kit.track(canvasTexture(c, 4));
  const faceMat = kit.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  const face = kit.mesh(new THREE.CircleGeometry(0.0425, 48), faceMat, false, false);
  face.position.set(0, 0.081, 0.001);
  g.add(face);
  let lastMinute = -1;
  const tick = () => {
    const d = new Date();
    if (d.getMinutes() === lastMinute) return;
    lastMinute = d.getMinutes();
    paintClock(ctx, 256, d);
    tex.needsUpdate = true;
  };
  tick();
  kit.addContact(g, 0.13, 0.08, { alpha: 0.6 });
  return { group: g, tick };
}

/* ============================ sticky notes ======================== */

export function buildStickies(kit: Kit, fonts: SceneFonts) {
  const g = new THREE.Group();
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f0ecd9";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#2a2d34";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(52, 140);
  ctx.lineTo(188, 140);
  ctx.moveTo(152, 104);
  ctx.lineTo(190, 140);
  ctx.lineTo(152, 176);
  ctx.stroke();
  ctx.fillStyle = "#2a2d34";
  ctx.font = `400 46px ${fonts.hand}, cursive`;
  ctx.textAlign = "center";
  ctx.fillText("ship it", 128, 68);
  const tex = kit.track(canvasTexture(c, 4));
  const side = std(kit, { color: 0xe8e4d2, roughness: 0.95 });
  const top = std(kit, { map: tex, roughness: 0.95 });
  const geo = kit.track(new THREE.BoxGeometry(0.076, 0.012, 0.076));
  const m = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  m.position.y = 0.006;
  m.rotation.y = 0.26;
  g.add(m);
  // one note peeling away
  const loose = kit.mesh(new THREE.BoxGeometry(0.076, 0.0006, 0.076), side, false, true);
  loose.position.set(0.05, 0.0004, 0.045);
  loose.rotation.y = -0.4;
  g.add(loose);
  kit.addContact(g, 0.11, 0.11, { alpha: 0.5 });
  return g;
}

/* ============================ framed prints ======================= */

export type FrameOpts = {
  w: number;
  h: number;
  border: number;
  finish: "black" | "metal" | "oak" | "white";
  tex: THREE.Texture;
  /** a light passepartout around the print */
  mat?: { inset: number; color: number };
  data: Record<string, unknown>;
};

export function buildFrame(kit: Kit, o: FrameOpts) {
  const g = new THREE.Group();
  const depth = 0.022;
  const finishParams: Record<FrameOpts["finish"], THREE.MeshStandardMaterialParameters> = {
    black: { color: 0x0c0c0e, roughness: 0.42, metalness: 0.25 },
    metal: { color: 0xbfc2c8, roughness: 0.28, metalness: 1 },
    oak: { color: 0xc9b08c, roughness: 0.55, metalness: 0.02 },
    white: { color: 0xe6e3dc, roughness: 0.5, metalness: 0.02 },
  };
  const frameMat = std(kit, finishParams[o.finish]);
  const shape = new THREE.Shape();
  shape.moveTo(-o.w / 2, -o.h / 2);
  shape.lineTo(o.w / 2, -o.h / 2);
  shape.lineTo(o.w / 2, o.h / 2);
  shape.lineTo(-o.w / 2, o.h / 2);
  shape.closePath();
  const hole = new THREE.Path();
  const iw = o.w - o.border * 2;
  const ih = o.h - o.border * 2;
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.closePath();
  shape.holes.push(hole);
  const geo = kit.track(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.0016,
      bevelThickness: 0.0016,
      bevelSegments: 1,
    })
  );
  const frame = new THREE.Mesh(geo, frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  g.add(frame);

  let pw = iw;
  let ph = ih;
  if (o.mat) {
    const matMesh = kit.mesh(
      new THREE.PlaneGeometry(iw, ih),
      std(kit, { color: o.mat.color, roughness: 0.95 }),
      false,
      true
    );
    matMesh.position.z = depth * 0.34;
    g.add(matMesh);
    pw = iw - o.mat.inset * 2;
    ph = ih - o.mat.inset * 2;
  }
  const printMat = std(kit, { map: o.tex, roughness: 0.86 });
  const print = kit.mesh(new THREE.PlaneGeometry(pw, ph), printMat, false, true);
  print.position.z = depth * (o.mat ? 0.4 : 0.34);
  g.add(print);

  const glassMat = kit.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      roughness: 0.04,
      metalness: 0,
      depthWrite: false,
    })
  );
  const glass = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(iw, ih)), glassMat);
  glass.position.z = depth * 0.82;
  g.add(glass);

  // the soft shadow a hung frame throws on the wall behind it
  const wallShadow = new THREE.Mesh(
    kit.track(new THREE.PlaneGeometry(o.w + 0.06, o.h + 0.06)),
    kit.track(
      new THREE.MeshBasicMaterial({
        map: kit.shadowTex,
        color: 0x000000,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    )
  );
  wallShadow.position.set(0.007, -0.013, -0.0028);
  wallShadow.renderOrder = 1;
  g.add(wallShadow);

  const hitMesh = hit(kit, o.w, o.h, 0.06, o.data);
  hitMesh.position.z = 0.02;
  g.add(hitMesh);

  let hover = 0;
  return {
    group: g,
    hit: hitMesh,
    /** swap in the real image once it has loaded, cropped to fill the opening */
    setImage(tex: THREE.Texture) {
      const img = tex.image as { width: number; height: number } | undefined;
      if (img && img.width && img.height) {
        const ia = img.width / img.height;
        const pa = pw / ph;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        if (ia > pa) {
          tex.repeat.set(pa / ia, 1);
          tex.offset.set((1 - pa / ia) / 2, 0);
        } else {
          tex.repeat.set(1, ia / pa);
          tex.offset.set(0, (1 - ia / pa) / 2);
        }
      }
      printMat.map = tex;
      printMat.needsUpdate = true;
    },
    /** 0..1: the frame catches a little more light */
    setHover(v: number) {
      if (Math.abs(v - hover) < 0.002) return;
      hover = v;
      frameMat.emissive.setScalar(0.1 * v);
      glassMat.opacity = 0.06 + 0.12 * v;
      print.scale.setScalar(1 + 0.004 * v);
    },
  };
}
