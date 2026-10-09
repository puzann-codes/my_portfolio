import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MONO, canvasTexture, clamp, cylBetween, makeCanvas, rng } from "./util";

/**
 * The opening scene: one desk, one lamp. A black laptop, a white 75%
 * keyboard (AULA S75 Pro style: knob, small display, grey modifiers), a
 * white mouse, a notebook, a mug and a guitar pick. Everything is
 * procedural — no model files — and lit by a single spotlight from the lamp.
 *
 * Units are metres. +z points at the viewer, desk top is y = 0.
 */

export type Desk = {
  group: THREE.Group;
  spot: THREE.SpotLight;
  /** world-space centre and outward normal of the laptop screen */
  screen: { position: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };
  /** 1 = open, 0 = closed */
  setLid(v: number): void;
  setLamp(v: number): void;
  startTyping(): void;
  pressKey(code: string, down: boolean): void;
  update(t: number, dt: number): void;
  dispose(): void;
};

type Fonts = { hero: string };

const KEY_UNIT = 0.019;

type KeyDef = { code: string; x: number; w: number; row: number; mod: boolean };

function keyLayout(): KeyDef[] {
  const R: [string, number, boolean?][][] = [
    [
      ["Escape", 1, true],
      ...Array.from({ length: 12 }, (_, i): [string, number] => [`F${i + 1}`, 1]),
      ["Delete", 1, true],
    ],
    [
      ["Backquote", 1],
      ...Array.from({ length: 9 }, (_, i): [string, number] => [`Digit${i + 1}`, 1]),
      ["Digit0", 1],
      ["Minus", 1],
      ["Equal", 1],
      ["Backspace", 2, true],
      ["PageUp", 1, true],
    ],
    [
      ["Tab", 1.5, true],
      ...[..."QWERTYUIOP"].map((c): [string, number] => [`Key${c}`, 1]),
      ["BracketLeft", 1],
      ["BracketRight", 1],
      ["Backslash", 1.5],
      ["PageDown", 1, true],
    ],
    [
      ["CapsLock", 1.75, true],
      ...[..."ASDFGHJKL"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Semicolon", 1],
      ["Quote", 1],
      ["Enter", 2.25, true],
      ["Home", 1, true],
    ],
    [
      ["ShiftLeft", 2.25, true],
      ...[..."ZXCVBNM"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Comma", 1],
      ["Period", 1],
      ["Slash", 1],
      ["ShiftRight", 1.75, true],
      ["ArrowUp", 1, true],
      ["End", 1, true],
    ],
    [
      ["ControlLeft", 1.25, true],
      ["MetaLeft", 1.25, true],
      ["AltLeft", 1.25, true],
      ["Space", 6.25],
      ["AltRight", 1, true],
      ["Fn", 1, true],
      ["ControlRight", 1, true],
      ["ArrowLeft", 1, true],
      ["ArrowDown", 1, true],
      ["ArrowRight", 1, true],
    ],
  ];
  const out: KeyDef[] = [];
  R.forEach((row, r) => {
    let x = 0;
    for (const [code, w, mod] of row) {
      out.push({ code, x, w, row: r, mod: !!mod });
      x += w;
    }
  });
  return out;
}

function paintScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  typed: number,
  blink: boolean,
  fonts: Fonts
) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#101012");
  bg.addColorStop(1, "#050506");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // wallpaper: faint concentric rings, off-centre
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.9, i * 46, 0, Math.PI * 2);
    ctx.stroke();
  }

  // menu bar
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 14px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("PB    Terminal    File    Edit    View    Window", 16, 15);
  ctx.textAlign = "right";
  ctx.fillText("Thu 9 Oct   21:41", w - 16, 15);

  // the name
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f4f4f0";
  const size = Math.round(h * 0.2);
  ctx.font = `900 ${size}px ${fonts.hero}, sans-serif`;
  ctx.fillText("PUJAN", w / 2, h * 0.43);
  ctx.fillText("BHATT", w / 2, h * 0.43 + size * 0.98);

  // subtitle, typed
  const sub = "AI Engineer & Full-Stack Developer";
  const n = Math.floor(sub.length * clamp(typed));
  ctx.font = `500 19px ${MONO}`;
  ctx.fillStyle = "rgba(244,244,240,0.78)";
  ctx.textAlign = "left";
  const subW = ctx.measureText(sub).width;
  const sx = (w - subW) / 2;
  const sy = h * 0.43 + size * 0.98 + 56;
  ctx.fillText(sub.slice(0, n), sx, sy);
  if (blink || typed < 1) {
    const cw = ctx.measureText(sub.slice(0, n)).width;
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(sx + cw + 3, sy - 17, 11, 21);
  }

  // dock
  const dockW = 330;
  const dx = (w - dockW) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.roundRect(dx, h - 66, dockW, 48, 14);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i === 1 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.roundRect(dx + 14 + i * 52, h - 58, 36, 32, 9);
    ctx.fill();
  }
}

export function buildDesk(opts: { quality: "high" | "low"; fonts: Fonts }): Desk {
  const group = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T) => {
    disposables.push(x);
    return x;
  };
  const high = opts.quality === "high";

  // ---------- materials ----------
  const mDesk = track(
    new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.62, metalness: 0.05 })
  );
  const mFelt = track(new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.98 }));
  const mWall = track(new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.95 }));
  const mFloor = track(new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 1 }));
  const mAlu = track(
    new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.9, roughness: 0.36 })
  );
  const mBlack = track(new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.55 }));
  const mKeyBlack = track(new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.5 }));
  const mWhite = track(
    new THREE.MeshStandardMaterial({ color: 0xe9e9e5, roughness: 0.42, metalness: 0.05 })
  );
  const mKeyWhite = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  const mMetal = track(
    new THREE.MeshStandardMaterial({ color: 0xbdbdbb, metalness: 1, roughness: 0.28 })
  );
  const mLampBlack = track(
    new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.45, metalness: 0.7 })
  );

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
    track(g);
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast;
    o.receiveShadow = receive;
    return o;
  };

  // ---------- room: wall, floor, desk, mat ----------
  const wall = mesh(new THREE.PlaneGeometry(14, 6), mWall, false, true);
  wall.position.set(0, 1.6, -0.66);
  group.add(wall);

  const floor = mesh(new THREE.PlaneGeometry(14, 10), mFloor, false, true);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.78, 1.2);
  group.add(floor);

  const desk = mesh(new RoundedBoxGeometry(2.6, 0.05, 1.12, 4, 0.012), mDesk);
  desk.position.set(0.1, -0.025, 0);
  group.add(desk);

  const mat = mesh(new RoundedBoxGeometry(0.98, 0.004, 0.42, 2, 0.0018), mFelt, false, true);
  mat.position.set(0.44, 0.002, 0.2);
  group.add(mat);

  // ---------- laptop ----------
  const laptop = new THREE.Group();
  laptop.position.set(-0.36, 0, -0.04);
  laptop.rotation.y = 0.2;
  group.add(laptop);

  const LW = 0.314;
  const LD = 0.221;
  const LH = 0.0155;
  const base = mesh(new RoundedBoxGeometry(LW, LH, LD, 4, 0.0055), mAlu);
  base.position.y = LH / 2;
  laptop.add(base);

  // keyboard deck: recessed black well + keycaps
  const well = mesh(new THREE.PlaneGeometry(0.288, 0.123), mBlack, false, true);
  well.rotation.x = -Math.PI / 2;
  well.position.set(0, LH + 0.0002, -0.034);
  laptop.add(well);

  const capGeo = track(new RoundedBoxGeometry(1, 1, 1, 2, 0.18));
  const caps = new THREE.InstancedMesh(capGeo, mKeyBlack, 14 * 6);
  const m4 = new THREE.Matrix4();
  let ci = 0;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 14; c++) {
      const small = r === 0;
      m4.compose(
        new THREE.Vector3(-0.1325 + c * 0.0204, LH + 0.0011, -0.0905 + r * 0.0205 + (small ? -0.002 : 0)),
        new THREE.Quaternion(),
        new THREE.Vector3(0.0172, 0.0016, small ? 0.0116 : 0.0172)
      );
      caps.setMatrixAt(ci++, m4);
    }
  }
  caps.castShadow = false;
  caps.receiveShadow = true;
  laptop.add(caps);

  const trackpad = mesh(new RoundedBoxGeometry(0.118, 0.0008, 0.074, 2, 0.0004), mAlu, false, true);
  trackpad.position.set(0, LH + 0.0002, 0.073);
  laptop.add(trackpad);

  // lid
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, LH, -LD / 2 + 0.004);
  laptop.add(lidPivot);
  const lid = mesh(new RoundedBoxGeometry(LW, LD, 0.0045, 3, 0.002), mAlu);
  lid.position.set(0, LD / 2, -0.00225);
  lidPivot.add(lid);
  const hinge = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, LW * 0.78, 20), mBlack, false, false);
  hinge.rotation.z = Math.PI / 2;
  lidPivot.add(hinge);

  // glass + screen
  const SW = 0.298;
  const SH = 0.194;
  const glass = mesh(new THREE.PlaneGeometry(LW - 0.006, LD - 0.006), mBlack, false, false);
  glass.position.set(0, LD / 2, 0.0002);
  lidPivot.add(glass);

  const screenCanvas = makeCanvas(1024, 664);
  const sctx = screenCanvas.getContext("2d")!;
  const screenTex = track(canvasTexture(screenCanvas, 8));
  const screenMat = track(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  const screen = mesh(new THREE.PlaneGeometry(SW, SH), screenMat, false, false);
  screen.position.set(0, LD / 2 - 0.003, 0.0005);
  lidPivot.add(screen);

  const screenGlow = new THREE.PointLight(0xe8ecff, 0, 0.9, 2);
  screenGlow.position.set(0, LD / 2, 0.08);
  lidPivot.add(screenGlow);

  const OPEN = -0.27; // ~105° open
  const CLOSED = Math.PI / 2;
  let lidValue = 1;
  const setLid = (v: number) => {
    lidValue = clamp(v);
    lidPivot.rotation.x = THREE.MathUtils.lerp(CLOSED, OPEN, lidValue);
    screenMat.color.setScalar(clamp(lidValue * 3));
    screenGlow.intensity = 0.35 * clamp(lidValue * 2 - 1);
  };
  setLid(1);

  // ---------- keyboard (white 75%) ----------
  const kb = new THREE.Group();
  const KBW = 0.338;
  const KBD = 0.138;
  const KBH = 0.026;
  const tilt = 0.1;
  kb.position.set(0.3, Math.sin(tilt) * (KBD / 2) + 0.001, 0.2);
  kb.rotation.set(tilt, -0.035, 0);
  group.add(kb);

  const kbCase = mesh(new RoundedBoxGeometry(KBW, KBH, KBD, 4, 0.009), mWhite);
  kbCase.position.y = KBH / 2;
  kb.add(kbCase);
  const plate = mesh(new THREE.PlaneGeometry(KBW - 0.014, KBD - 0.014), mBlack, false, true);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = KBH + 0.0003;
  kb.add(plate);

  const layout = keyLayout();
  const keyMesh = new THREE.InstancedMesh(capGeo, mKeyWhite, layout.length);
  keyMesh.castShadow = true;
  keyMesh.receiveShadow = true;
  const left = -(16 * KEY_UNIT) / 2;
  const rowZ = (r: number) => -0.0505 + r * 0.0197;
  const baseY = KBH + 0.0052;
  const keyIndex = new Map<string, number>();
  const press = new Float32Array(layout.length);
  const target = new Float32Array(layout.length);
  const ca = new THREE.Color(0xf3f3f0);
  const cb = new THREE.Color(0xc3c3be);
  const cc = new THREE.Color(0xa9a9a4);
  layout.forEach((k, i) => {
    keyIndex.set(k.code, i);
    keyMesh.setColorAt(i, k.code === "Escape" ? cc : k.mod ? cb : ca);
  });
  const writeKey = (i: number) => {
    const k = layout[i];
    const w = k.w * KEY_UNIT - 0.0016;
    m4.compose(
      new THREE.Vector3(left + (k.x + k.w / 2) * KEY_UNIT, baseY - press[i] * 0.0026, rowZ(k.row)),
      new THREE.Quaternion(),
      new THREE.Vector3(w, 0.0095, 0.0176)
    );
    keyMesh.setMatrixAt(i, m4);
  };
  layout.forEach((_, i) => writeKey(i));
  kb.add(keyMesh);

  // rotary knob + tiny display, top-right
  const knob = mesh(new THREE.CylinderGeometry(0.0125, 0.0135, 0.014, 32), mMetal);
  knob.position.set(left + 15.1 * KEY_UNIT, KBH + 0.007, rowZ(0));
  kb.add(knob);
  const knobTop = mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.0008, 32), mWhite, false, false);
  knobTop.position.set(knob.position.x, KBH + 0.0144, rowZ(0));
  kb.add(knobTop);
  const dispCanvas = makeCanvas(160, 80);
  const dctx = dispCanvas.getContext("2d")!;
  dctx.fillStyle = "#050506";
  dctx.fillRect(0, 0, 160, 80);
  dctx.fillStyle = "#f4f4f0";
  dctx.font = `700 40px ${MONO}`;
  dctx.textAlign = "center";
  dctx.textBaseline = "middle";
  dctx.fillText("PB", 80, 42);
  const dispTex = track(canvasTexture(dispCanvas, 2));
  const disp = mesh(
    new THREE.PlaneGeometry(0.022, 0.011),
    track(new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false })),
    false,
    false
  );
  disp.rotation.x = -Math.PI / 2;
  disp.position.set(left + 13.5 * KEY_UNIT, KBH + 0.0006, rowZ(0));
  kb.add(disp);

  // ---------- mouse ----------
  const mouse = new THREE.Group();
  mouse.position.set(0.7, 0, 0.19);
  mouse.rotation.y = -0.22;
  group.add(mouse);
  const mBody = mesh(new THREE.SphereGeometry(1, 48, 24), mWhite);
  mBody.scale.set(0.032, 0.02, 0.054);
  mBody.position.y = 0.0075;
  mouse.add(mBody);
  const split = mesh(new THREE.BoxGeometry(0.0008, 0.0006, 0.03), mBlack, false, false);
  split.position.set(0, 0.0272, -0.0185);
  mouse.add(split);
  const wheel = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0042, 20), mBlack, false, false);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, 0.0272, -0.026);
  mouse.add(wheel);

  // ---------- props ----------
  const notebook = new THREE.Group();
  notebook.position.set(-0.08, 0, 0.36);
  notebook.rotation.y = 0.28;
  group.add(notebook);
  const nbCover = mesh(
    new RoundedBoxGeometry(0.15, 0.016, 0.205, 2, 0.003),
    track(new THREE.MeshStandardMaterial({ color: 0x252527, roughness: 0.8 }))
  );
  nbCover.position.y = 0.008;
  notebook.add(nbCover);
  const nbPages = mesh(
    new RoundedBoxGeometry(0.142, 0.012, 0.198, 1, 0.001),
    track(new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.95 }))
  );
  nbPages.position.set(0.003, 0.0105, 0.001);
  notebook.add(nbPages);
  const pen = mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.15, 14), mWhite);
  pen.rotation.set(Math.PI / 2, 0, 0.5);
  pen.position.set(0.02, 0.0195, 0.01);
  notebook.add(pen);

  const mug = new THREE.Group();
  mug.position.set(1.0, 0, -0.14);
  group.add(mug);
  const mugBody = mesh(new THREE.CylinderGeometry(0.039, 0.034, 0.092, 40), mWhite);
  mugBody.position.y = 0.046;
  mug.add(mugBody);
  const coffee = mesh(
    new THREE.CircleGeometry(0.0335, 32),
    track(new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.15 })),
    false,
    false
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.085;
  mug.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(0.024, 0.0052, 10, 28, Math.PI), mWhite);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.04, 0.047, 0);
  mug.add(handle);

  // guitar pick — a nod to the rest of the site
  const pickShape = new THREE.Shape();
  pickShape.moveTo(0, -0.0165);
  pickShape.quadraticCurveTo(0.0185, -0.0015, 0.0105, 0.0125);
  pickShape.quadraticCurveTo(0, 0.0185, -0.0105, 0.0125);
  pickShape.quadraticCurveTo(-0.0185, -0.0015, 0, -0.0165);
  const pickGeo = track(
    new THREE.ExtrudeGeometry(pickShape, {
      depth: 0.0008,
      bevelEnabled: true,
      bevelThickness: 0.0003,
      bevelSize: 0.0003,
      bevelSegments: 2,
      curveSegments: 14,
    })
  );
  const pick = new THREE.Mesh(
    pickGeo,
    track(new THREE.MeshStandardMaterial({ color: 0xdadad6, roughness: 0.3 }))
  );
  pick.castShadow = true;
  pick.rotation.x = -Math.PI / 2;
  pick.rotation.z = 0.7;
  pick.position.set(0.12, 0.0012, 0.4);
  group.add(pick);

  // ---------- the lamp: the scene's only real light ----------
  const lampBase = new THREE.Vector3(-0.86, 0.0, -0.34);
  const j1 = new THREE.Vector3(-0.8, 0.3, -0.31);
  const j2 = new THREE.Vector3(-0.58, 0.58, -0.25);
  const headPos = new THREE.Vector3(-0.48, 0.59, -0.2);
  const lookAtPoint = new THREE.Vector3(0.02, 0.0, 0.1);

  const lampBaseMesh = mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.016, 48), mLampBlack);
  lampBaseMesh.position.copy(lampBase).setY(0.008);
  group.add(lampBaseMesh);
  for (const [a, b] of [
    [new THREE.Vector3(lampBase.x, 0.014, lampBase.z), j1],
    [j1, j2],
  ] as const) {
    const arm = cylBetween(a, b, 0.0075, mLampBlack);
    arm.castShadow = true;
    group.add(arm);
  }
  for (const p of [j1, j2]) {
    const ball = mesh(new THREE.SphereGeometry(0.014, 20, 14), mLampBlack);
    ball.position.copy(p);
    group.add(ball);
  }
  const shadeLen = 0.11;
  const shadeGeo = track(new THREE.CylinderGeometry(0.026, 0.07, shadeLen, 48, 1, true));
  const shade = new THREE.Mesh(
    shadeGeo,
    track(
      new THREE.MeshStandardMaterial({
        color: 0x0c0c0d,
        roughness: 0.4,
        metalness: 0.7,
        side: THREE.DoubleSide,
      })
    )
  );
  shade.castShadow = false;
  shade.position.copy(headPos);
  // cylinder axis (y) → point the wide opening at the desk
  shade.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3().subVectors(lookAtPoint, headPos).normalize()
  );
  group.add(shade);
  const bulbMat = track(new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false }));
  const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.024, 20, 14)), bulbMat);
  bulb.position
    .copy(headPos)
    .addScaledVector(new THREE.Vector3().subVectors(lookAtPoint, headPos).normalize(), 0.025);
  group.add(bulb);

  const spot = new THREE.SpotLight(0xfff1dc, 0, 0, 0.78, 0.95, 2);
  spot.position.copy(headPos).addScaledVector(
    new THREE.Vector3().subVectors(lookAtPoint, headPos).normalize(),
    0.03
  );
  spot.target.position.copy(lookAtPoint);
  spot.castShadow = true;
  spot.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.5 * 0.002;
  spot.shadow.radius = 5;
  spot.shadow.camera.near = 0.15;
  spot.shadow.camera.far = 3;
  group.add(spot, spot.target);

  // visible light cone + floating dust in it
  const coneLen = 1.5;
  const coneRadius = Math.tan(0.78) * coneLen;
  const coneGeo = track(new THREE.ConeGeometry(coneRadius, coneLen, 56, 1, true));
  coneGeo.translate(0, -coneLen / 2, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const beamMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: 0 }, uLen: { value: coneLen } },
      vertexShader: /* glsl */ `
        uniform float uLen;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vAlong = position.z / uLen;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float a = uI * 0.2 * smoothstep(0.0, 0.1, vAlong) * (1.0 - smoothstep(0.1, 1.0, vAlong)) * edge;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * a, a);
        }`,
    })
  );
  const beam = new THREE.Mesh(coneGeo, beamMat);
  beam.position.copy(spot.position);
  beam.lookAt(lookAtPoint);
  group.add(beam);

  const R = rng(7);
  const dustN = high ? 260 : 120;
  const dustPos = new Float32Array(dustN * 3);
  const dustSeed = new Float32Array(dustN);
  const axis = new THREE.Vector3().subVectors(lookAtPoint, spot.position).normalize();
  const bx = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  const by = new THREE.Vector3().crossVectors(bx, axis).normalize();
  for (let i = 0; i < dustN; i++) {
    const along = 0.1 + Math.pow(R(), 0.8) * 0.9;
    const rad = Math.sqrt(R()) * Math.tan(0.76) * along * coneLen;
    const ang = R() * Math.PI * 2;
    const p = new THREE.Vector3()
      .copy(spot.position)
      .addScaledVector(axis, along * coneLen)
      .addScaledVector(bx, Math.cos(ang) * rad)
      .addScaledVector(by, Math.sin(ang) * rad);
    dustPos.set([p.x, p.y, p.z], i * 3);
    dustSeed[i] = R() * 100;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(dustSeed, 1));
  const dustMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uI: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uT;
        uniform float uScale;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uT * 0.15 + aSeed) * 0.03;
          p.y += sin(uT * 0.11 + aSeed * 1.7) * 0.04 - mod(uT * 0.004 + aSeed, 0.12);
          p.z += cos(uT * 0.13 + aSeed * 0.6) * 0.03;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.6 + fract(aSeed * 7.0) * 2.4) * uScale / -mv.z;
          vA = 0.35 + 0.65 * fract(aSeed * 3.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * uI * 0.55;
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a, a);
        }`,
    })
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  group.add(new THREE.AmbientLight(0xffffff, 0.06));

  const setLamp = (v: number) => {
    const k = clamp(v, 0, 1.2);
    spot.intensity = 7.5 * k;
    bulbMat.color.setScalar(0.04 + 1.0 * k);
    beamMat.uniforms.uI.value = k;
    dustMat.uniforms.uI.value = k;
  };
  setLamp(0);

  // ---------- screen content & typing ----------
  const state = { typed: 0, typing: false, typedT0: 0, blink: true, lastBlink: 0, dirty: true };
  const repaint = () => {
    paintScreen(sctx, 1024, 664, state.typed, state.blink, opts.fonts);
    screenTex.needsUpdate = true;
    state.dirty = false;
  };
  repaint();

  // ---------- key presses ----------
  const pressKey = (code: string, down: boolean) => {
    const i = keyIndex.get(code);
    if (i !== undefined) target[i] = down ? 1 : 0;
  };

  // screen pose in world space
  group.updateMatrixWorld(true);
  const sp = new THREE.Vector3();
  const sn = new THREE.Vector3();
  const readScreen = () => {
    group.updateMatrixWorld(true);
    screen.getWorldPosition(sp);
    screen.getWorldDirection(sn);
  };
  readScreen();
  const screenInfo = {
    position: sp.clone(),
    normal: sn.clone(),
    width: SW,
    height: SH,
  };

  let dirtyKeys = false;
  const update = (t: number, dt: number) => {
    dustMat.uniforms.uT.value = t;
    // typing + cursor blink
    if (state.typing) {
      if (state.typedT0 < 0) state.typedT0 = t;
      const k = clamp((t - state.typedT0) / 1.6);
      if (k !== state.typed) {
        state.typed = k;
        state.dirty = true;
      }
      if (k >= 1) state.typing = false;
    }
    if (t - state.lastBlink > 0.55 && lidValue > 0.5) {
      state.lastBlink = t;
      state.blink = !state.blink;
      state.dirty = true;
    }
    if (state.dirty && lidValue > 0.5) repaint();

    // key travel
    for (let i = 0; i < press.length; i++) {
      if (press[i] !== target[i]) {
        press[i] += (target[i] - press[i]) * Math.min(1, dt * 28);
        if (Math.abs(press[i] - target[i]) < 0.01) press[i] = target[i];
        writeKey(i);
        dirtyKeys = true;
      }
    }
    if (dirtyKeys) {
      keyMesh.instanceMatrix.needsUpdate = true;
      dirtyKeys = false;
    }
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
    keyMesh.dispose();
    caps.dispose();
  };

  return {
    group,
    spot,
    screen: screenInfo,
    setLid,
    setLamp,
    startTyping() {
      state.typing = true;
      state.typed = 0;
      state.typedT0 = -1; // stamped on the next update, when the clock is known
      state.dirty = true;
    },
    pressKey,
    update,
    dispose,
  };
}
