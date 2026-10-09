import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MONO, canvasTexture, clamp, cylBetween, makeCanvas, rng } from "./util";
import {
  arrowTexture,
  contactShadowTexture,
  feltTexture,
  plasterTexture,
  walnutTexture,
  type SceneFonts,
  type SketchProgress,
} from "./textures";
import { posterDefs, posterLayout } from "./posters";
import {
  buildBooks,
  buildClock,
  buildCup,
  buildFrame,
  buildHeadphones,
  buildNotebook,
  buildPencil,
  buildStickies,
  type Kit,
} from "./props";

/**
 * The workspace. One desk, one lamp, one wall, and objects that each have a
 * job in the scroll story:
 *  - the keyboard types the first characters of "code" on the laptop
 *  - the mouse slides, and a dot of light follows it across the screen
 *  - the cup is the pause between "input" and "idea" (steam)
 *  - the notebook opens and sketches the three projects
 *  - a thin signal line runs from the notebook into the laptop
 *  - the prints on the wall are the person behind the work
 *
 * Everything is procedural, lit by one warm lamp, with cool fills so
 * the white keyboard and mouse separate naturally from the dark desk.
 * Units are metres, +z toward the viewer, desk top at y = 0.
 */

export type DeskState = {
  /** 0..1 position of the highlight travelling across the keys; <0 = off */
  keyWave: number;
  /** key codes held down by the choreography */
  held: string[];
  /** characters the keystrokes have typed on the laptop prompt */
  typed: string;
  /** 0..1 mouse slide (and the on-screen dot with it) */
  mouse: number;
  notebookOpen: number;
  sketch: SketchProgress;
  /** 0..1 3D nodes rising from the page */
  nodes: number;
  /** 0..1 signal line from the notebook to the laptop */
  signal: number;
  /** 0..1 steam from the cup */
  steam: number;
  /** 0..1 lamp emphasis per object */
  focus: { keyboard: number; notebook: number; cup: number };
};

export const NEUTRAL_STATE: DeskState = {
  keyWave: -1,
  held: [],
  typed: "",
  mouse: 0,
  notebookOpen: 0,
  sketch: { note: 0, s1: 0, s2: 0, s3: 0 },
  nodes: 0,
  signal: 0,
  steam: 0,
  focus: { keyboard: 0, notebook: 0, cup: 0 },
};

export type DeskPickData = {
  id: string;
  title: string;
  label: string;
  note?: string;
};

export type Desk = {
  group: THREE.Group;
  spot: THREE.SpotLight;
  screen: { position: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };
  /** where things sit, for the camera director */
  anchors: Record<"keyboard" | "mouse" | "notebook" | "cup" | "laptop", THREE.Vector3>;
  pickables: THREE.Object3D[];
  setLid(v: number): void;
  setLamp(v: number): void;
  setState(s: DeskState): void;
  setHover(id: string | null): void;
  /** load the real poster images (resolves when done; stand-ins show meanwhile) */
  loadPosters(): Promise<void>;
  startTyping(): void;
  /** the visitor pressing a real key */
  pressKey(code: string, down: boolean): void;
  update(t: number, dt: number, viewScale: number): void;
  dispose(): void;
};

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
  typedSub: number,
  typedKeys: string,
  blink: boolean,
  fonts: SceneFonts
) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#101012");
  bg.addColorStop(1, "#050506");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.9, i * 46, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 14px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("PB    Terminal    File    Edit    View    Window", 16, 15);
  ctx.textAlign = "right";
  ctx.fillText("Thu 9 Oct   21:41", w - 16, 15);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f4f4f0";
  const size = Math.round(h * 0.2);
  ctx.font = `900 ${size}px ${fonts.hero}, sans-serif`;
  ctx.fillText("PUJAN", w / 2, h * 0.4);
  ctx.fillText("BHATT", w / 2, h * 0.4 + size * 0.98);

  const sub = "AI Engineer & Full-Stack Developer";
  const n = Math.floor(sub.length * clamp(typedSub));
  ctx.font = `500 19px ${MONO}`;
  ctx.fillStyle = "rgba(244,244,240,0.78)";
  ctx.textAlign = "left";
  const subW = ctx.measureText(sub).width;
  const sx = (w - subW) / 2;
  const sy = h * 0.4 + size * 0.98 + 52;
  ctx.fillText(sub.slice(0, n), sx, sy);
  if (typedSub < 1) {
    const cw = ctx.measureText(sub.slice(0, n)).width;
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(sx + cw + 3, sy - 17, 11, 21);
  }

  // the prompt the keyboard types into
  ctx.font = `500 22px ${MONO}`;
  const py = sy + 58;
  ctx.fillStyle = "rgba(176,208,255,0.9)";
  const prompt = "❯ ";
  const pw = ctx.measureText(prompt).width;
  const lineW = pw + ctx.measureText(typedKeys || " ").width;
  const px = (w - Math.max(lineW, 110)) / 2;
  ctx.fillText(prompt, px, py);
  ctx.fillStyle = "#f4f4f0";
  ctx.fillText(typedKeys, px + pw, py);
  if (blink || typedKeys.length > 0) {
    const cw = ctx.measureText(typedKeys).width;
    ctx.fillStyle = blink ? "#f4f4f0" : "rgba(244,244,240,0.35)";
    ctx.fillRect(px + pw + cw + 3, py - 18, 11, 23);
  }

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

export function buildDesk(opts: { quality: "high" | "low"; fonts: SceneFonts }): Desk {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const high = opts.quality === "high";

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true) => {
    track(g);
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast;
    o.receiveShadow = receive;
    return o;
  };
  const std = (p: THREE.MeshStandardMaterialParameters) => track(new THREE.MeshStandardMaterial(p));

  // soft contact shadows: one shared texture, one cheap plane per object
  const shadowTex = track(contactShadowTexture());
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    })
  );
  const shadowGeo = track(new THREE.PlaneGeometry(1, 1));
  const kit: Kit = {
    track,
    mesh,
    shadowTex,
    addContact(parent, w, d, o = {}) {
      const m = new THREE.Mesh(shadowGeo, o.alpha !== undefined ? shadowMat.clone() : shadowMat);
      if (o.alpha !== undefined) {
        (m.material as THREE.MeshBasicMaterial).opacity = o.alpha;
        track(m.material as THREE.Material);
      }
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = o.rot ?? 0;
      m.scale.set(w, d, 1);
      m.position.set(o.x ?? 0, o.y ?? 0.0014, o.z ?? 0);
      m.renderOrder = 1;
      parent.add(m);
    },
  };

  // ---------- materials ----------
  const mAlu = std({ color: 0x1a1a1d, metalness: 0.9, roughness: 0.36 });
  const mBlack = std({ color: 0x060607, roughness: 0.55 });
  const mKeyBlack = std({ color: 0x0a0a0b, roughness: 0.5 });
  const mWhite = std({ color: 0xe9e9e5, roughness: 0.42, metalness: 0.05 });
  const mKeyWhite = std({ color: 0xffffff, roughness: 0.5 });
  const mMetal = std({ color: 0xbdbdbb, metalness: 1, roughness: 0.28 });
  const mLampBlack = std({ color: 0x0b0b0c, roughness: 0.45, metalness: 0.7 });

  // ---------- room: wall, floor, desk, mat ----------
  const wallTex = track(plasterTexture());
  const wall = mesh(
    new THREE.PlaneGeometry(16, 6),
    std({ color: 0xffffff, map: wallTex, bumpMap: wallTex, bumpScale: 0.6, roughness: 0.95 }),
    false,
    true
  );
  wall.position.set(0, 1.5, -0.62);
  group.add(wall);

  // a baseboard and a lighter band below the frames: some architecture
  const board = mesh(
    new THREE.BoxGeometry(16, 0.09, 0.02),
    std({ color: 0x1b1c1f, roughness: 0.7 }),
    false,
    true
  );
  board.position.set(0, 0.045, -0.61);
  group.add(board);

  const floor = mesh(
    new THREE.PlaneGeometry(16, 10),
    std({ color: 0x0d0d0f, roughness: 0.95 }),
    false,
    true
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.78, 1.2);
  group.add(floor);

  const woodTex = track(walnutTexture());
  woodTex.repeat.set(1.4, 1);
  const desk = mesh(
    new RoundedBoxGeometry(2.9, 0.05, 1.16, 4, 0.01),
    std({ color: 0xffffff, map: woodTex, roughness: 0.52, metalness: 0.02 })
  );
  desk.position.set(0.05, -0.025, 0.02);
  group.add(desk);
  // a pair of legs, so the desk isn't a floating slab when the camera drops
  for (const x of [-1.3, 1.4]) {
    const leg = mesh(new THREE.BoxGeometry(0.06, 0.75, 1.0), std({ color: 0x0f0f11, roughness: 0.5, metalness: 0.4 }));
    leg.position.set(x, -0.425, 0.02);
    group.add(leg);
  }

  const MAT = { x: 0.2, z: 0.15, w: 1.5, d: 0.46 };
  const feltT = track(feltTexture(MAT.w / MAT.d));
  const mat = mesh(
    new RoundedBoxGeometry(MAT.w, 0.004, MAT.d, 2, 0.0018),
    std({ color: 0xffffff, map: feltT, roughness: 1 }),
    false,
    true
  );
  mat.position.set(MAT.x, 0.002, MAT.z);
  group.add(mat);

  // ---------- laptop ----------
  const laptop = new THREE.Group();
  laptop.position.set(-0.3, 0.004, -0.06);
  laptop.rotation.y = 0.12;
  group.add(laptop);

  const LW = 0.314;
  const LD = 0.221;
  const LH = 0.0155;
  const base = mesh(new RoundedBoxGeometry(LW, LH, LD, 4, 0.0055), mAlu);
  base.position.y = LH / 2;
  laptop.add(base);

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
  caps.receiveShadow = true;
  laptop.add(caps);

  const trackpad = mesh(new RoundedBoxGeometry(0.118, 0.0008, 0.074, 2, 0.0004), mAlu, false, true);
  trackpad.position.set(0, LH + 0.0002, 0.073);
  laptop.add(trackpad);
  kit.addContact(laptop, 0.36, 0.28, { alpha: 0.75, y: -0.0024 });

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, LH, -LD / 2 + 0.004);
  laptop.add(lidPivot);
  const lid = mesh(new RoundedBoxGeometry(LW, LD, 0.0045, 3, 0.002), mAlu);
  lid.position.set(0, LD / 2, -0.00225);
  lidPivot.add(lid);
  const hinge = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, LW * 0.78, 20), mBlack, false, false);
  hinge.rotation.z = Math.PI / 2;
  lidPivot.add(hinge);

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
  const SCR_Y = LD / 2 - 0.003;
  screen.position.set(0, SCR_Y, 0.0005);
  lidPivot.add(screen);

  // the on-screen pointer: a separate plane, so moving it never repaints
  const arrowTex = track(arrowTexture());
  const arrow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.0125, 0.0125)),
    track(new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, toneMapped: false, depthWrite: false }))
  );
  arrow.position.set(0, SCR_Y, 0.0013);
  arrow.visible = false;
  lidPivot.add(arrow);

  const screenGlow = new THREE.PointLight(0xdfe8ff, 0, 0.9, 2);
  screenGlow.position.set(0, LD / 2, 0.08);
  lidPivot.add(screenGlow);

  const screenHit = new THREE.Mesh(
    track(new THREE.BoxGeometry(SW, SH, 0.02)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  screenHit.position.set(0, SCR_Y, 0.01);
  screenHit.userData = { id: "laptop", title: "Laptop", label: "ENTER" } satisfies DeskPickData;
  lidPivot.add(screenHit);

  const OPEN = -0.27;
  const CLOSED = Math.PI / 2;
  let lidValue = 1;
  const setLid = (v: number) => {
    lidValue = clamp(v);
    lidPivot.rotation.x = THREE.MathUtils.lerp(CLOSED, OPEN, lidValue);
    screenMat.color.setScalar(clamp(lidValue * 3));
    screenGlow.intensity = 0.35 * clamp(lidValue * 2 - 1);
    screenHit.visible = lidValue > 0.5;
  };
  setLid(1);

  // ---------- keyboard (white 75%, AULA-style) ----------
  const kb = new THREE.Group();
  const KBW = 0.338;
  const KBD = 0.138;
  const KBH = 0.026;
  const tilt = 0.1;
  const KB = { x: 0.24, z: 0.26 };
  kb.position.set(KB.x, 0.004 + Math.sin(tilt) * (KBD / 2) + 0.001, KB.z);
  kb.rotation.set(tilt, -0.03, 0);
  group.add(kb);

  const kbCaseMat = std({ color: 0xe9e9e5, roughness: 0.42, metalness: 0.05 });
  const kbCase = mesh(new RoundedBoxGeometry(KBW, KBH, KBD, 4, 0.009), kbCaseMat);
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
  const baseColor: THREE.Color[] = [];
  const cA = new THREE.Color(0xf3f3f0);
  const cB = new THREE.Color(0xc3c3be);
  const cC = new THREE.Color(0xa9a9a4);
  layout.forEach((k, i) => {
    keyIndex.set(k.code, i);
    const col = k.code === "Escape" ? cC : k.mod ? cB : cA;
    baseColor.push(col.clone());
    keyMesh.setColorAt(i, col);
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
  kit.addContact(kb, 0.4, 0.2, { alpha: 0.7, y: -0.006 });

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

  // a small, cool light that rides along the keys during the typing beat
  const sweep = new THREE.PointLight(0xcfe0ff, 0, 0.3, 2);
  kb.add(sweep);

  const kbHit = new THREE.Mesh(
    track(new THREE.BoxGeometry(KBW + 0.01, 0.05, KBD + 0.01)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  kbHit.position.y = 0.02;
  kbHit.userData = {
    id: "keyboard",
    title: "Keyboard",
    label: "HOW I WORK",
    note:
      "AI engineer and full-stack developer. Arch Linux and i3 on one side, a MacBook on the other, and a growing interest in agentic AI.",
  } satisfies DeskPickData;
  kb.add(kbHit);

  // ---------- mouse ----------
  const mouse = new THREE.Group();
  const MOUSE0 = new THREE.Vector3(0.62, 0.004, 0.24);
  mouse.position.copy(MOUSE0);
  mouse.rotation.y = -0.2;
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
  kit.addContact(mouse, 0.1, 0.14, { alpha: 0.7, y: -0.0026 });

  // ---------- notebook, pencil, cup, and the rest of the desk ----------
  const NB = { x: -0.8, z: 0.22, ry: 0.3 };
  const notebook = buildNotebook(kit, opts.fonts);
  notebook.group.position.set(NB.x, 0.0, NB.z);
  notebook.group.rotation.y = NB.ry;
  group.add(notebook.group);

  const pencil = buildPencil(kit);
  pencil.position.set(-0.64, 0.0, 0.34);
  pencil.rotation.y = -0.55;
  group.add(pencil);

  const CUP = { x: -0.62, z: -0.27 };
  const cup = buildCup(kit);
  cup.group.position.set(CUP.x, 0, CUP.z);
  cup.group.rotation.y = 0.7;
  group.add(cup.group);

  const clock = buildClock(kit);
  clock.group.position.set(0.72, 0.0, -0.3);
  clock.group.rotation.y = -0.22;
  group.add(clock.group);

  const stickies = buildStickies(kit, opts.fonts);
  stickies.position.set(0.5, 0.004, -0.1);
  group.add(stickies);

  const phones = buildHeadphones(kit);
  phones.position.set(1.04, 0, -0.2);
  phones.rotation.y = -0.4;
  group.add(phones);

  const books = buildBooks(kit);
  books.position.set(1.22, 0, 0.0);
  books.rotation.y = 0.28;
  group.add(books);

  // a small pick on the mat: a nod to the rest of the site
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
  const pick = new THREE.Mesh(pickGeo, std({ color: 0xdadad6, roughness: 0.3 }));
  pick.castShadow = true;
  pick.rotation.x = -Math.PI / 2;
  pick.rotation.z = 0.7;
  pick.position.set(0.02, 0.0055, 0.44);
  group.add(pick);

  // ---------- the wall: posters and prints that say who's at the desk ----------
  const WALL_Z = -0.618;
  const defs = posterDefs(opts.fonts);
  const hang = posterLayout(defs);
  const frames = defs.map((d) => {
    const f = buildFrame(kit, {
      w: d.w,
      h: d.h,
      border: d.w > 0.4 ? 0.01 : 0.008,
      finish: d.finish,
      mat: d.mat,
      tex: track(d.fallback()),
      data: { id: d.id, title: d.title, label: "VIEW", note: d.note } satisfies DeskPickData,
    });
    const [x, y] = hang[d.id];
    f.group.position.set(x, y, WALL_Z);
    group.add(f.group);
    return { def: d, frame: f };
  });
  const loadPosters = async () => {
    const loader = new THREE.TextureLoader();
    await Promise.all(
      frames.map(async ({ def, frame }) => {
        if (!def.src) return;
        try {
          const tex = await loader.loadAsync(def.src);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          track(tex);
          frame.setImage(tex);
        } catch {
          /* the stand-in title card stays */
        }
      })
    );
  };

  // ---------- the lamp: the scene's one real light ----------
  const lampBase = new THREE.Vector3(-1.04, 0.0, -0.36);
  const j1 = new THREE.Vector3(-0.98, 0.3, -0.33);
  const j2 = new THREE.Vector3(-0.86, 0.58, -0.27);
  const headPos = new THREE.Vector3(-0.76, 0.6, -0.21);
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
  const shade = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.026, 0.07, shadeLen, 48, 1, true)),
    std({ color: 0x0c0c0d, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide })
  );
  const toTarget = new THREE.Vector3().subVectors(lookAtPoint, headPos).normalize();
  shade.position.copy(headPos);
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toTarget);
  group.add(shade);
  const bulbMat = track(new THREE.MeshBasicMaterial({ color: 0xffe6c0, toneMapped: false }));
  const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.024, 20, 14)), bulbMat);
  bulb.position.copy(headPos).addScaledVector(toTarget, 0.025);
  group.add(bulb);

  const KEY_COLOR = 0xffd9a6; // warm lamp
  const spot = new THREE.SpotLight(KEY_COLOR, 0, 0, 0.78, 0.95, 2);
  spot.position.copy(headPos).addScaledVector(toTarget, 0.03);
  spot.target.position.copy(lookAtPoint);
  spot.castShadow = true;
  spot.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.001;
  spot.shadow.radius = 5;
  spot.shadow.camera.near = 0.15;
  spot.shadow.camera.far = 3.2;
  group.add(spot, spot.target);

  // cool fills: they keep the black laptop and the white peripherals apart
  const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x1a140f, 0.3);
  group.add(hemi);
  const rim = new THREE.DirectionalLight(0xaec8ff, 0.5);
  rim.position.set(1.4, 0.9, -0.5);
  group.add(rim);
  // a gentle warm wash on the wall so the prints sit in a pool of light
  const wash = new THREE.SpotLight(0xffd8a8, 0, 0, 0.55, 1, 2);
  wash.position.set(-0.3, 1.5, 0.9);
  wash.target.position.set(0.1, 0.62, -0.62);
  group.add(wash, wash.target);

  // emphasis lights: they only brighten while that object is the subject
  const focusSpot = (color: number, from: THREE.Vector3, to: THREE.Vector3, angle: number) => {
    const s = new THREE.SpotLight(color, 0, 2.5, angle, 0.9, 2);
    s.position.copy(from);
    s.target.position.copy(to);
    group.add(s, s.target);
    return s;
  };
  const kbFocus = focusSpot(0xe6efff, new THREE.Vector3(KB.x + 0.1, 0.62, KB.z + 0.55), new THREE.Vector3(KB.x, 0, KB.z), 0.3);
  const nbFocus = focusSpot(0xffe3bd, new THREE.Vector3(NB.x + 0.15, 0.6, NB.z + 0.5), new THREE.Vector3(NB.x, 0, NB.z), 0.3);
  const cupFocus = focusSpot(0xffd9a6, new THREE.Vector3(CUP.x + 0.35, 0.34, CUP.z - 0.4), new THREE.Vector3(CUP.x, 0.09, CUP.z), 0.32);
  if (!high) {
    // keep the light count down on low-power devices
    kbFocus.visible = nbFocus.visible = cupFocus.visible = false;
  }

  // visible light cone + dust
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
          float a = uI * 0.14 * smoothstep(0.0, 0.1, vAlong) * (1.0 - smoothstep(0.1, 1.0, vAlong)) * edge;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.76) * a, a);
        }`,
    })
  );
  const beam = new THREE.Mesh(coneGeo, beamMat);
  beam.position.copy(spot.position);
  beam.lookAt(lookAtPoint);
  group.add(beam);

  const R = rng(7);
  const dustN = high ? 200 : 90;
  const dustPos = new Float32Array(dustN * 3);
  const dustSeed = new Float32Array(dustN);
  const axis = new THREE.Vector3().subVectors(lookAtPoint, spot.position).normalize();
  const bx = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  const by = new THREE.Vector3().crossVectors(bx, axis).normalize();
  for (let i = 0; i < dustN; i++) {
    const along = 0.1 + Math.pow(R(), 0.8) * 0.9;
    const rad = Math.sqrt(R()) * Math.tan(0.74) * along * coneLen;
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
          gl_PointSize = (1.4 + fract(aSeed * 7.0) * 2.0) * uScale / -mv.z;
          vA = 0.35 + 0.65 * fract(aSeed * 3.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * uI * 0.4;
          gl_FragColor = vec4(vec3(1.0, 0.94, 0.84) * a, a);
        }`,
    })
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  group.add(new THREE.AmbientLight(0xffffff, 0.04));

  let lampValue = 0;
  let focusDim = 1;
  const applyLamp = () => {
    const k = clamp(lampValue, 0, 1.2);
    spot.intensity = 7.2 * k * focusDim;
    bulbMat.color.setScalar(0.04 + 1.0 * k);
    bulbMat.color.multiply(new THREE.Color(1, 0.9, 0.75));
    beamMat.uniforms.uI.value = k;
    dustMat.uniforms.uI.value = k;
    hemi.intensity = 0.3 * clamp(k * 1.5);
    rim.intensity = 0.5 * clamp(k * 1.5);
    wash.intensity = 2.6 * clamp(k);
  };
  const setLamp = (v: number) => {
    lampValue = v;
    applyLamp();
  };
  setLamp(0);

  // ---------- the signal: a thin line from the notebook into the laptop ----------
  group.updateMatrixWorld(true);
  const sp = new THREE.Vector3();
  const sn = new THREE.Vector3();
  const readScreen = () => {
    group.updateMatrixWorld(true);
    screen.getWorldPosition(sp);
    screen.getWorldDirection(sn);
  };
  setLid(1);
  readScreen();
  const screenInfo = { position: sp.clone(), normal: sn.clone(), width: SW, height: SH };

  const nbTop = new THREE.Vector3(NB.x, 0.05, NB.z);
  const sigEnd = sp.clone().addScaledVector(sn, 0.004);
  const sigCurve = new THREE.CatmullRomCurve3(
    [
      nbTop,
      new THREE.Vector3(NB.x + 0.12, 0.12, NB.z - 0.08),
      new THREE.Vector3(-0.56, 0.1, 0.12),
      new THREE.Vector3(-0.4, 0.075, 0.2),
      sigEnd.clone().addScaledVector(sn, 0.12).setY(sigEnd.y - 0.06),
      sigEnd,
    ],
    false,
    "centripetal"
  );
  const sigGeo = track(new THREE.TubeGeometry(sigCurve, 120, 0.0011, 5, false));
  const sigMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDraw: { value: 0 }, uT: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vU;
        void main() {
          vU = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDraw;
        uniform float uT;
        varying float vU;
        void main() {
          if (vU > uDraw) discard;
          float head = smoothstep(0.12, 0.0, uDraw - vU);
          float flow = 0.5 + 0.5 * sin((vU * 40.0) - uT * 6.0);
          float a = 0.35 + 0.35 * flow + head * 0.9;
          gl_FragColor = vec4(vec3(0.7, 0.84, 1.0) * a, a);
        }`,
    })
  );
  const signal = new THREE.Mesh(sigGeo, sigMat);
  signal.visible = false;
  signal.frustumCulled = false;
  group.add(signal);

  // 3D nodes that lift off the page: the Sunūwā sketch becoming a diagram
  const nodeGroup = new THREE.Group();
  nodeGroup.position.y = 0.02;
  const nodeMat = track(new THREE.MeshBasicMaterial({ color: 0xe4eeff, toneMapped: false }));
  const nodeGeo = track(new THREE.SphereGeometry(0.0026, 14, 10));
  const nodePos: [number, number][] = [
    [-0.044, -0.045],
    [-0.0115, -0.045],
    [0.023, -0.045],
  ];
  const nodes = nodePos.map(([x, z]) => {
    const m = new THREE.Mesh(nodeGeo, nodeMat);
    m.position.set(x, 0, z);
    nodeGroup.add(m);
    return m;
  });
  const linkMat = track(new THREE.MeshBasicMaterial({ color: 0xcfe2ff, toneMapped: false, transparent: true, opacity: 0.8 }));
  const links = [0, 1].map((i) => {
    const a = new THREE.Vector3(nodePos[i][0], 0, nodePos[i][1]);
    const b = new THREE.Vector3(nodePos[i + 1][0], 0, nodePos[i + 1][1]);
    const l = cylBetween(a, b, 0.00025, linkMat, 6);
    nodeGroup.add(l);
    return l;
  });
  nodeGroup.visible = false;
  notebook.group.add(nodeGroup);

  // ---------- screen content ----------
  const scr = { sub: 0, typing: false, t0: 0, blink: true, lastBlink: 0, keys: "", dirty: true };
  const repaint = () => {
    paintScreen(sctx, 1024, 664, scr.sub, scr.keys, scr.blink, opts.fonts);
    screenTex.needsUpdate = true;
    scr.dirty = false;
  };
  repaint();

  // ---------- state application ----------
  const MOUSE_END = new THREE.Vector3(-0.065, 0, -0.09);
  const camHeld = new Set<string>();
  const userHeld = new Set<string>();
  const iceTint = new THREE.Color(0.74, 0.86, 1.05);
  let lastWave = -2;
  let waveCenter = -1;
  let hoverId: string | null = null;
  const hoverAmt = new Map<string, number>();

  const applyKeys = () => {
    layout.forEach((k, i) => {
      target[i] = camHeld.has(k.code) || userHeld.has(k.code) ? 1 : 0;
    });
  };

  const setState = (s: DeskState) => {
    // the choreography's keypresses
    const nextHeld = new Set(s.held);
    let changed = nextHeld.size !== camHeld.size;
    for (const k of nextHeld) if (!camHeld.has(k)) changed = true;
    if (changed) {
      camHeld.clear();
      nextHeld.forEach((k) => camHeld.add(k));
      applyKeys();
    }
    if (s.typed !== scr.keys) {
      scr.keys = s.typed;
      scr.dirty = true;
    }

    // highlight wave
    if (Math.abs(s.keyWave - lastWave) > 0.002) {
      lastWave = s.keyWave;
      waveCenter = s.keyWave < 0 ? -1 : s.keyWave * 18 - 1;
      layout.forEach((k, i) => {
        const kx = k.x + k.w / 2;
        const I = waveCenter < 0 ? 0 : Math.exp(-Math.pow((kx - waveCenter) / 1.5, 2));
        const c = baseColor[i].clone().lerp(iceTint, I * 0.6);
        keyMesh.setColorAt(i, c);
      });
      if (keyMesh.instanceColor) keyMesh.instanceColor.needsUpdate = true;
      const on = waveCenter >= 0 && waveCenter <= 17;
      sweep.intensity = on ? 0.0024 : 0;
      if (on) sweep.position.set(left + waveCenter * KEY_UNIT, KBH + 0.034, rowZ(2));
    }

    // the mouse slides, and the dot of light goes with it
    const e = s.mouse;
    mouse.position.set(MOUSE0.x + MOUSE_END.x * e, MOUSE0.y, MOUSE0.z + MOUSE_END.z * e);
    mouse.rotation.y = -0.2 - 0.12 * e;
    arrow.visible = e > 0.001 && lidValue > 0.5;
    // from the middle of the screen toward the dock, in step with the mouse
    const u = THREE.MathUtils.lerp(0.72, 0.42, e);
    const v = THREE.MathUtils.lerp(0.7, 0.925, e);
    arrow.position.set((u - 0.5) * SW + 0.0035, SCR_Y + (0.5 - v) * SH - 0.0035, 0.0013);

    notebook.setOpen(s.notebookOpen);
    notebook.setSketch(s.sketch);

    nodeGroup.visible = s.nodes > 0.005;
    nodeGroup.position.y = 0.018 + 0.05 * s.nodes;
    nodes.forEach((n, i) => n.scale.setScalar(clamp(s.nodes * 2.2 - i * 0.35)));
    linkMat.opacity = 0.8 * clamp(s.nodes * 1.6 - 0.5);
    for (const l of links) l.visible = s.nodes > 0.3;

    signal.visible = s.signal > 0.002;
    sigMat.uniforms.uDraw.value = s.signal;

    cup.setSteam(0.14 + 0.86 * s.steam);

    const f = s.focus;
    kbFocus.intensity = 5.5 * f.keyboard;
    nbFocus.intensity = 6 * f.notebook;
    cupFocus.intensity = 4 * f.cup;
    const maxF = Math.max(f.keyboard, f.notebook, f.cup);
    const dim = 1 - 0.28 * maxF;
    if (Math.abs(dim - focusDim) > 0.002) {
      focusDim = dim;
      applyLamp();
    }
  };

  const pressKey = (code: string, down: boolean) => {
    if (down) userHeld.add(code);
    else userHeld.delete(code);
    applyKeys();
  };

  const pickables: THREE.Object3D[] = [
    kbHit,
    notebook.hit,
    cup.hit,
    screenHit,
    ...frames.map((f) => f.frame.hit),
  ];

  let dirtyKeys = true;
  const update = (t: number, dt: number, viewScale: number) => {
    dustMat.uniforms.uT.value = t;
    dustMat.uniforms.uScale.value = viewScale;
    sigMat.uniforms.uT.value = t;
    cup.update(t, viewScale);
    notebook.update(t);

    if (scr.typing) {
      if (scr.t0 < 0) scr.t0 = t;
      const k = clamp((t - scr.t0) / 1.6);
      if (k !== scr.sub) {
        scr.sub = k;
        scr.dirty = true;
      }
      if (k >= 1) scr.typing = false;
    }
    if (t - scr.lastBlink > 0.55 && lidValue > 0.5) {
      scr.lastBlink = t;
      scr.blink = !scr.blink;
      scr.dirty = true;
    }
    if (scr.dirty && lidValue > 0.5) repaint();

    // keys travel with a quick, slightly damped spring
    for (let i = 0; i < press.length; i++) {
      if (press[i] !== target[i]) {
        press[i] += (target[i] - press[i]) * Math.min(1, dt * 26);
        if (Math.abs(press[i] - target[i]) < 0.01) press[i] = target[i];
        writeKey(i);
        dirtyKeys = true;
      }
    }
    if (dirtyKeys) {
      keyMesh.instanceMatrix.needsUpdate = true;
      dirtyKeys = false;
    }

    // hover catches light on whatever the pointer is over
    for (const { frame: f } of frames) {
      const id = f.hit.userData.id as string;
      const cur = hoverAmt.get(id) ?? 0;
      const next = cur + ((hoverId === id ? 1 : 0) - cur) * Math.min(1, dt * 8);
      hoverAmt.set(id, next);
      f.setHover(next);
    }
    const kbCur = hoverAmt.get("keyboard") ?? 0;
    const kbNext = kbCur + ((hoverId === "keyboard" ? 1 : 0) - kbCur) * Math.min(1, dt * 8);
    hoverAmt.set("keyboard", kbNext);
    kbCaseMat.emissive.setScalar(0.07 * kbNext);

    if (t % 5 < dt) clock.tick();
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
    anchors: {
      keyboard: new THREE.Vector3(KB.x, 0.02, KB.z),
      mouse: MOUSE0.clone(),
      notebook: new THREE.Vector3(NB.x, 0.01, NB.z),
      cup: new THREE.Vector3(CUP.x, 0.07, CUP.z),
      laptop: new THREE.Vector3(-0.3, 0.1, -0.06),
    },
    pickables,
    setLid,
    setLamp,
    setState,
    setHover(id) {
      hoverId = id;
    },
    loadPosters,
    startTyping() {
      scr.typing = true;
      scr.sub = 0;
      scr.t0 = -1;
      scr.dirty = true;
    },
    pressKey,
    update,
    dispose,
  };
}

export type { SketchProgress };
