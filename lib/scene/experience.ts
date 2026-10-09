import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { setCursor } from "@/lib/cursor-bus";
import { buildDesk, type Desk, type DeskState } from "./desk";
import { buildWorld, STAGE_POS, type World } from "./world";
import { clamp, cssFontFamily, easeInOut, lerp, nextFrame, smoothstep } from "./util";

/**
 * The camera director. One continuous shot, six acts, driven by scroll
 * progress p (0 → 1):
 *
 *  ACT 01  THE WORKSPACE   the finished desk, holding still
 *  ACT 02  THE INPUT       toward the keyboard: a highlight crosses the keys,
 *                          "code" is typed on the laptop, the mouse slides and
 *                          a dot of light follows it on screen
 *          (the pause)     past the cup: steam, a quieter light
 *  ACT 03  THE IDEA        the notebook opens, three sketches are drawn, lift
 *                          off the page and a signal line leads into the laptop
 *  ACT 04  THE DIGITAL     through the screen, one environment per project,
 *          WORLD           each with its own palette and a gate to its case study
 *  ACT 05  THE STACK       the terminal
 *  ACT 06  BEYOND THE DESK back out to the desk, lid closing
 *
 * Every desk detail below is a pure function of p, so scrubbing backwards
 * replays the story in reverse.
 */

export type PickResult =
  | { type: "project"; slug: string }
  | { type: "note"; id: string; title: string; note: string }
  | { type: "jump"; p: number }
  | { type: "puff" };

export type HoverInfo = { id: string; title: string; label: string };

export type ExperienceOptions = {
  canvas: HTMLCanvasElement;
  lowPower: boolean;
  reduced: boolean;
  onLoad: (v: number, label: string) => void;
  onStage: (stage: number) => void;
  onVeil: (opacity: number) => void;
  onHover: (info: HoverInfo | null) => void;
  onLampOn: () => void;
  onKeyTick: () => void;
};

export type Experience = {
  setProgress(p: number): void;
  setPointer(nx: number, ny: number): void;
  setActive(active: boolean): void;
  resize(): void;
  intro(): void;
  key(code: string, down: boolean): void;
  hover(clientX: number, clientY: number): void;
  leave(): void;
  click(clientX: number, clientY: number): PickResult | null;
  dispose(): void;
};

// The desk acts keep their original timing, scaled into the first part of
// the scroll; the machine gets the rest, one slice per environment.
const K = 0.75;
const D_APPROACH = 0.318; // (desk-domain) the camera starts leaving the notebook for the screen
const D_PUSH = 0.338; // …and starts pushing through the glass
const D_CROSS = 0.358; // desk → machine swap
const P_CROSS = D_CROSS * K; // absolute
const P_PUSH = D_PUSH * K;
const P_BACK = 0.905; // machine → desk swap
const STAGE_SPAN = 0.0885;
const stageStart = (i: number) => P_CROSS + i * STAGE_SPAN;

/** Where the interesting moments sit on the scroll, for jump links. */
export const MARKS = {
  keyboard: 0.09,
  notebook: 0.196,
  enter: 0.255,
  projects: 0.28,
  stack: stageStart(6) + 0.03,
  contact: 0.955,
};

type Key = { p: number; pos: [number, number, number]; look: [number, number, number]; fov: number };

const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

// ---- desk path: wide → keyboard → cup → notebook (then the screen). Desk-domain p. ----
const DESK_KEYS: Key[] = [
  { p: 0.0, pos: [0.0, 0.7, 1.82], look: [0.0, 0.52, 0], fov: 42 },
  { p: 0.055, pos: [0.0, 0.7, 1.82], look: [0.0, 0.52, 0], fov: 42 },
  { p: 0.12, pos: [0.04, 0.36, 1.0], look: [0.06, 0.06, 0.14], fov: 40 },
  { p: 0.165, pos: [0.1, 0.33, 0.92], look: [0.12, 0.05, 0.16], fov: 38 },
  { p: 0.195, pos: [-0.3, 0.27, 0.66], look: [-0.58, 0.07, -0.2], fov: 34 },
  { p: 0.222, pos: [-0.46, 0.23, 0.5], look: [-0.64, 0.06, -0.2], fov: 33 },
  { p: 0.258, pos: [-0.8, 0.54, 0.52], look: [-0.82, 0.01, 0.2], fov: 36 },
  { p: 0.31, pos: [-0.76, 0.5, 0.47], look: [-0.8, 0.01, 0.19], fov: 36 },
];

type Framing = { pos: [number, number, number]; look: [number, number, number]; fov: number };
const STAGE_KEYS: [keyof typeof STAGE_POS, Framing, Framing, Framing][] = [
  [
    "city",
    { pos: [40, 60, 170], look: [0, 0, -20], fov: 62 },
    { pos: [16, 38, 65], look: [0, 2, 3], fov: 58 },
    { pos: [0, 16, 37], look: [0, 6, -40], fov: 60 },
  ],
  [
    "crash",
    { pos: [-40, 40, 70], look: [0, 0, -10], fov: 58 },
    { pos: [-12, 24, 27], look: [0, 0, -1], fov: 55 },
    { pos: [14, 17, 19], look: [0, 0, -1], fov: 55 },
  ],
  [
    "neural",
    { pos: [-20, -2, 82], look: [0, 0, 8], fov: 55 },
    { pos: [-3, 0, 42], look: [0, 0, -5], fov: 58 },
    { pos: [1, 0, 6], look: [-1, -1, -50], fov: 62 },
  ],
  [
    "atlas",
    { pos: [-30, 6, 90], look: [0, 0, 0], fov: 55 },
    { pos: [-12, 5, 58], look: [0, 2, 0], fov: 50 },
    { pos: [10, 4, 46], look: [0, 3, 0], fov: 48 },
  ],
  [
    "nova",
    { pos: [-35, 5, 95], look: [0, 0, 0], fov: 55 },
    { pos: [-10, 4, 44], look: [0, 0, 0], fov: 52 },
    { pos: [14, 6, 36], look: [0, 0, 0], fov: 52 },
  ],
  [
    "harbor",
    { pos: [-50, 30, 120], look: [0, 4, -30], fov: 58 },
    { pos: [-26, 14, 64], look: [0, 4, -30], fov: 56 },
    { pos: [10, 9, 40], look: [0, 5, -34], fov: 56 },
  ],
  [
    "terminal",
    { pos: [0, 0, 60], look: [0, 0, 0], fov: 55 },
    { pos: [0, 0, 43], look: [0, 0, 0], fov: 55 },
    { pos: [3, 1, 31], look: [0, 0, 0], fov: 55 },
  ],
];

const WORLD_KEYS: Key[] = STAGE_KEYS.flatMap(([name, a, b, c], i) => {
  const ctr = STAGE_POS[name];
  const at = (f: Framing, p: number): Key => ({
    p,
    pos: [ctr.x + f.pos[0], ctr.y + f.pos[1], ctr.z + f.pos[2]],
    look: [ctr.x + f.look[0], ctr.y + f.look[1], ctr.z + f.look[2]],
    fov: f.fov,
  });
  const s = stageStart(i);
  return [at(a, s + (i === 0 ? 0 : 0.004)), at(b, s + 0.036), at(c, s + 0.07)];
});

// caption stages: 0 workspace · 1 input · 2 pause · 3 idea · 4–9 the six projects · 10 terminal · 11 beyond
const STAGE_AT = [
  0,
  0.06 * K,
  0.18 * K,
  0.225 * K,
  ...Array.from({ length: 7 }, (_, i) => stageStart(i) - 0.004),
  0.95,
];

// the keyboard's choreography (desk-domain p)
const KEY_SEQ = ["KeyC", "KeyO", "KeyD", "KeyE", "Enter"];
const KEY_T0 = 0.092;
const KEY_DT = 0.0135;
const KEY_HOLD = 0.0085;

const win = (p: number, a: number, b: number, c: number, d: number) =>
  smoothstep(a, b, p) * (1 - smoothstep(c, d, p));

function makeCurves(keys: Key[]) {
  return {
    pos: new THREE.CatmullRomCurve3(keys.map((k) => v3(k.pos)), false, "centripetal"),
    look: new THREE.CatmullRomCurve3(keys.map((k) => v3(k.look)), false, "centripetal"),
  };
}

function visibleInTree(o: THREE.Object3D | null) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

export async function createExperience(opts: ExperienceOptions): Promise<Experience> {
  const { canvas, lowPower, reduced } = opts;
  const report = opts.onLoad;

  report(0.02, "fonts");
  const heroFont = cssFontFamily("--font-unbounded", "sans-serif");
  const handFont = cssFontFamily("--font-hand", "cursive");
  const fonts = { hero: heroFont, hand: handFont };
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`900 100px ${heroFont}`), document.fonts.load(`400 40px ${handFont}`)]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    alpha: false,
    powerPreference: "high-performance",
  });
  const maxDpr = lowPower ? 1.25 : 1.6;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x040405, 1);

  const DESK_FOV = 42;
  const camera = new THREE.PerspectiveCamera(DESK_FOV, 1, 0.01, 2500);
  // wider lens on portrait screens so the desk's core still fits side by side
  let deskFovAdd = 0;

  // ---------- desk ----------
  report(0.06, "desk");
  await nextFrame();
  const deskScene = new THREE.Scene();
  deskScene.background = new THREE.Color(0x040405);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  deskScene.environment = envTex;
  deskScene.environmentIntensity = 0.2;
  const desk: Desk = buildDesk({ quality: lowPower ? "low" : "high", fonts });
  deskScene.add(desk.group);
  // real posters stream in; stand-in title cards hang until they arrive
  const postersLoaded = desk.loadPosters();
  report(0.2, "keys");
  await nextFrame();

  // ---------- world ----------
  const world: World = await buildWorld({
    quality: lowPower ? "low" : "high",
    fonts: { hero: heroFont },
    progress: (v, label) => report(0.2 + v * 0.65, label),
  });
  world.scene.environment = envTex;
  world.scene.environmentIntensity = 0.3;

  // the machine gets bloom: lit windows, signals and lamps glow
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (!lowPower) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(world.scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.4, 0.88);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  const deskCurves = makeCurves(DESK_KEYS);
  const worldCurves = makeCurves(WORLD_KEYS);

  // ---------- state ----------
  let target = 0;
  let cur = 0;
  let prevCur = 0;
  let active = true;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let phase: "desk" | "world" = "desk";
  let lampStart = -1;
  let lampDone = false;
  let lastStage = -1;
  let lastVeil = -1;
  let lastDigital = -1;
  let snapId = "";
  let veilPulse = 0;
  let puff = 0;
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverNdc: THREE.Vector2 | null = null;
  let hoverId: string | null = null;
  let hoverRectOn = false;

  const state: DeskState = {
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
  let prevHeld = "";

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(pr);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // the desk's core is ~1.25 m wide at a 1.5 m camera distance
    const fov =
      camera.aspect >= 1.5
        ? DESK_FOV
        : clamp(THREE.MathUtils.radToDeg(2 * Math.atan(0.64 / (1.5 * camera.aspect))), DESK_FOV, 76);
    deskFovAdd = fov - DESK_FOV;
    camera.updateProjectionMatrix();
  };
  resize();

  const backFactor = () => 1 + Math.max(0, 1.6 - camera.aspect) * 0.5;

  const tmp = {
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
  };

  // ---------- path sampling ----------
  const sampleKeys = (
    keys: Key[],
    curves: ReturnType<typeof makeCurves>,
    p: number,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3
  ) => {
    const n = keys.length - 1;
    const pc = clamp(p, keys[0].p, keys[n].p);
    let i = 0;
    while (i < n - 1 && pc > keys[i + 1].p) i++;
    const local = (pc - keys[i].p) / (keys[i + 1].p - keys[i].p);
    const e = smoothstep(0, 1, local) * 0.55 + local * 0.45;
    const u = (i + e) / n;
    curves.pos.getPoint(u, outPos);
    curves.look.getPoint(u, outLook);
    return { i, fov: lerp(keys[i].fov, keys[i + 1].fov, smoothstep(0, 1, local)) };
  };

  const snapIndex = (keys: Key[], p: number) => {
    let i = 0;
    while (i < keys.length - 1 && p >= keys[i + 1].p) i++;
    return i;
  };

  const fitDistance = (w: number, h: number, fov: number) => {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    return Math.max(h / 2 / t, w / 2 / (t * camera.aspect)) * 1.03;
  };

  // the closing frame answers the opening one: same room, the story told
  const endPos = new THREE.Vector3(0.0, 0.7, 1.82);
  const endLook = new THREE.Vector3(0.0, 0.52, 0.0);

  let camFov = DESK_FOV;

  const placeDesk = (pAbs: number, t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const sp = desk.screen.position;
    const sn = desk.screen.normal;

    if (pAbs >= P_BACK) {
      // beyond the desk: ease away from the screen to a wide, settled view
      const k = easeInOut(clamp((pAbs - P_BACK) / 0.07));
      const closeD = fitDistance(desk.screen.width, desk.screen.height, DESK_FOV + deskFovAdd);
      const start = tmp.c.copy(sp).addScaledVector(sn, 0.13);
      const close = tmp.b.copy(sp).addScaledVector(sn, closeD);
      outPos.copy(start).lerp(close, smoothstep(0, 0.3, k)).lerp(endPos, smoothstep(0.2, 1, k));
      outLook.copy(sp).lerp(endLook, smoothstep(0.1, 1, k));
      const bf = lerp(1.0, backFactor(), smoothstep(0.3, 1, k));
      outPos.sub(outLook).multiplyScalar(bf).add(outLook);
      camFov = lerp(78, DESK_FOV + deskFovAdd, smoothstep(0, 0.9, k));
      return;
    }

    const p = pAbs / K; // desk-domain progress
    if (reduced) {
      const i = snapIndex(DESK_KEYS, Math.min(p, 0.31));
      outPos.copy(v3(DESK_KEYS[i].pos));
      outLook.copy(v3(DESK_KEYS[i].look));
      camFov = DESK_KEYS[i].fov + deskFovAdd;
    } else {
      const s = sampleKeys(DESK_KEYS, deskCurves, Math.min(p, 0.31), outPos, outLook);
      camFov = s.fov + deskFovAdd;
      // a little life while the first frame holds still
      const idle = 1 - smoothstep(0.0, 0.06, p);
      outPos.x += Math.sin(t * 0.25) * 0.008 * idle;
      outPos.y += Math.sin(t * 0.21) * 0.004 * idle;
    }

    // keep the desk's close shots from cropping on narrow screens
    const bf = lerp(1, backFactor(), smoothstep(0.03, 0.1, p));
    outPos.sub(outLook).multiplyScalar(bf).add(outLook);

    if (p > D_APPROACH) {
      // from the notebook to the screen, then through the glass
      const closeD = fitDistance(desk.screen.width, desk.screen.height, DESK_FOV + deskFovAdd);
      const close = tmp.b.copy(sp).addScaledVector(sn, closeD);
      const k = reduced ? (p > D_PUSH ? 1 : 0) : easeInOut(clamp((p - D_APPROACH) / (D_PUSH - D_APPROACH)));
      const mid = tmp.c.copy(outPos).lerp(close, 0.5);
      mid.y += 0.06 * Math.sin(k * Math.PI);
      outPos.lerp(mid, k).lerp(close, k * k);
      outLook.lerp(sp, k);
      const kk = reduced ? 0 : easeInOut(clamp((p - D_PUSH) / (D_CROSS - D_PUSH)));
      outPos.addScaledVector(sn, -(closeD - 0.05) * kk);
      camFov = lerp(camFov, 96, reduced ? 0 : smoothstep(D_PUSH, D_CROSS, p));
    }

    if (!reduced) {
      outPos.x += pointer.sx * 0.02 * (1 - smoothstep(0.05, 0.1, p));
      outPos.y += pointer.sy * 0.012 * (1 - smoothstep(0.05, 0.1, p));
    }
  };

  const placeWorld = (p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    let fov: number;
    if (reduced) {
      const i = snapIndex(WORLD_KEYS, p);
      outPos.copy(v3(WORLD_KEYS[i].pos));
      outLook.copy(v3(WORLD_KEYS[i].look));
      fov = WORLD_KEYS[i].fov;
    } else {
      fov = sampleKeys(WORLD_KEYS, worldCurves, p, outPos, outLook).fov;
    }
    // narrower viewports sit further back and use a wider lens
    const back = 1 + Math.max(0, 1.6 - camera.aspect) * 0.75;
    outPos.sub(outLook).multiplyScalar(back).add(outLook);
    if (!reduced) {
      const dist = outPos.distanceTo(outLook);
      outPos.x += pointer.sx * dist * 0.012;
      outLook.y += pointer.sy * dist * 0.012;
      fov += (1 - smoothstep(P_CROSS, P_CROSS + 0.04, p)) * 26; // settle out of the warp
      fov += smoothstep(0.87, P_BACK, p) * 24; // widen as we leave
    }
    fov += Math.max(0, 1.5 - camera.aspect) * 22;
    camFov = fov;
  };

  const veilAt = (p: number) => {
    const inn = smoothstep(P_PUSH, P_CROSS, p);
    const out = 1 - smoothstep(P_CROSS, P_CROSS + 0.0285, p);
    const back = smoothstep(0.885, P_BACK, p);
    const out2 = 1 - smoothstep(P_BACK, P_BACK + 0.03, p);
    if (p < P_CROSS) return inn;
    if (p < 0.5) return out;
    return Math.min(back, p < P_BACK ? 1 : out2);
  };

  // ---------- the desk's story, as a function of p ----------
  const heldNow: string[] = [];
  const computeDesk = (pAbs: number) => {
    const p = Math.min(pAbs / K, 1.2);
    heldNow.length = 0;
    let typedN = 0;
    for (let i = 0; i < KEY_SEQ.length; i++) {
      const s = KEY_T0 + i * KEY_DT;
      if (p >= s && p < s + KEY_HOLD) heldNow.push(KEY_SEQ[i]);
      if (p >= s && i < 4) typedN = i + 1;
    }
    state.held = heldNow;
    state.typed = "code".slice(0, typedN);
    state.keyWave = p > 0.07 && p < 0.148 ? (p - 0.07) / 0.078 : -1;
    state.mouse = easeInOut(clamp((p - 0.105) / 0.06));
    state.notebookOpen = easeInOut(clamp((p - 0.222) / 0.03));
    state.sketch.note = clamp((p - 0.238) / 0.02);
    state.sketch.s1 = clamp((p - 0.254) / 0.02);
    state.sketch.s2 = clamp((p - 0.274) / 0.02);
    state.sketch.s3 = clamp((p - 0.294) / 0.02);
    state.nodes = smoothstep(0.298, 0.32, p) * (1 - smoothstep(0.345, 0.358, p));
    state.signal = p < 0.36 ? clamp((p - 0.318) / 0.036) : 0;
    state.focus.keyboard = win(p, 0.065, 0.1, 0.16, 0.19);
    state.focus.cup = win(p, 0.165, 0.19, 0.22, 0.236);
    state.focus.notebook = win(p, 0.215, 0.24, 0.33, 0.356);
    const pause = win(p, 0.17, 0.195, 0.225, 0.245);
    state.steam = reduced ? 0.25 : Math.max(pause, puff);
    desk.setState(state);
    renderer.toneMappingExposure = 1.05 - 0.1 * state.focus.cup;

    // a soft key sound for each new press (only when scrolling forward)
    const sig = heldNow.join(",");
    if (sig !== prevHeld) {
      if (sig && cur > prevCur) opts.onKeyTick();
      prevHeld = sig;
    }
  };

  // ---------- intro lamp ----------
  const FLICKER: [number, number][] = [
    [0, 0],
    [0.12, 0.45],
    [0.2, 0.05],
    [0.34, 0.7],
    [0.42, 0.18],
    [0.56, 0.95],
    [0.7, 0.6],
    [1.0, 1.05],
    [1.5, 1],
  ];
  const lampValue = (s: number) => {
    for (let i = 1; i < FLICKER.length; i++) {
      if (s <= FLICKER[i][0]) {
        const [t0, v0] = FLICKER[i - 1];
        const [t1, v1] = FLICKER[i];
        return lerp(v0, v1, (s - t0) / (t1 - t0));
      }
    }
    return 1;
  };

  // ---------- compile ----------
  report(0.88, "shaders");
  desk.setLamp(0);
  computeDesk(0);
  try {
    const withTimeout = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(r, 3500))]);
    await withTimeout(renderer.compileAsync(deskScene, camera));
    await withTimeout(renderer.compileAsync(world.scene, camera));
  } catch {
    /* compile lazily on first render instead */
  }
  await Promise.race([postersLoaded, new Promise((r) => setTimeout(r, 4000))]);
  report(1, "ready");

  // ---------- picking ----------
  const toNdc = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    return ndc;
  };

  const pickables = () => {
    if (phase === "desk") return cur < P_PUSH || cur > 0.93 ? desk.pickables : [];
    return cur > P_CROSS + 0.012 && cur < P_BACK - 0.02 ? world.pickables : [];
  };

  type Data = { id: string; title: string; label: string; slug?: string; note?: string };
  type Hit = { data: Data; obj: THREE.Object3D };
  const dataOf = (o: THREE.Object3D): Hit | null => {
    let n: THREE.Object3D | null = o;
    while (n && !n.userData.id) n = n.parent;
    return n ? { data: n.userData as Data, obj: o } : null;
  };

  const castAt = (x: number, y: number): Hit | null => {
    const list = pickables().filter(visibleInTree);
    if (!list.length) return null;
    raycaster.setFromCamera(toNdc(x, y), camera);
    const hit = raycaster.intersectObjects(list, true)[0];
    return hit ? dataOf(hit.object) : null;
  };

  const projectRect = (obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    const r = canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.project(camera);
      const px = r.left + ((v.x + 1) / 2) * r.width;
      const py = r.top + ((1 - v.y) / 2) * r.height;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, r: 6 };
  };

  const setHoverTarget = (info: Hit | null) => {
    const id = info?.data.id ?? null;
    if (id !== hoverId) {
      hoverId = id;
      desk.setHover(id);
      world.setHover(id);
      opts.onHover(info ? { id: info.data.id, title: info.data.title, label: info.data.label } : null);
      if (!info) {
        hoverRectOn = false;
        setCursor({ hint: null, rect: null });
      } else {
        setCursor({ hint: info.data.label });
      }
    }
    // the cursor frames the object; its bounds move with the camera
    if (info) {
      const rect = projectRect(info.obj);
      if (rect.w > 4 && rect.h > 4 && rect.w < window.innerWidth * 0.9) {
        hoverRectOn = true;
        setCursor({ rect });
      } else if (hoverRectOn) {
        hoverRectOn = false;
        setCursor({ rect: null });
      }
    }
  };

  // ---------- loop ----------
  let raf = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!active) return;
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime;

    prevCur = cur;
    // scroll smoothing runs on real elapsed time, so a throttled frame rate
    // still converges instead of crawling toward the target
    cur = reduced ? target : cur + (target - cur) * (1 - Math.exp(-Math.min(rawDt, 0.5) * 5));
    if (Math.abs(target - cur) < 0.00002) cur = target;
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 4));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 4));
    puff = Math.max(0, puff - dt * 0.5);

    const nextPhase = cur >= P_CROSS && cur < P_BACK ? "world" : "desk";
    if (nextPhase !== phase) {
      phase = nextPhase;
      camera.near = phase === "world" ? 0.1 : 0.01;
      camera.updateProjectionMatrix();
    }

    if (lampStart >= 0 && !lampDone) {
      const s = t - lampStart;
      desk.setLamp(lampValue(s));
      if (s > 1.5) lampDone = true;
    }

    computeDesk(cur);
    desk.setLid(1 - easeInOut(clamp((cur - 0.945) / 0.03)));

    if (phase === "desk") placeDesk(cur, t, camPos, camLook);
    else placeWorld(cur, camPos, camLook);

    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - camFov) > 0.01) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }

    // reduced motion: poses cut, so crossfade through the veil on each cut
    if (reduced) {
      const id =
        phase === "desk"
          ? `d${cur >= P_BACK ? "r" : snapIndex(DESK_KEYS, Math.min(cur / K, 0.31))}${cur > P_PUSH ? "s" : ""}`
          : `w${snapIndex(WORLD_KEYS, cur)}`;
      if (id !== snapId) {
        if (snapId) veilPulse = 1;
        snapId = id;
      }
      veilPulse = Math.max(0, veilPulse - dt * 3.2);
    }

    let stage = 0;
    for (let i = 0; i < STAGE_AT.length; i++) if (cur >= STAGE_AT[i]) stage = i;
    if (stage !== lastStage) {
      lastStage = stage;
      opts.onStage(stage);
    }
    const veil = Math.round(Math.max(veilAt(cur), veilPulse) * 100) / 100;
    if (veil !== lastVeil) {
      lastVeil = veil;
      opts.onVeil(veil);
    }

    // the cursor crosses into the machine with the camera, and back out
    const digital = reduced
      ? phase === "world"
        ? 1
        : 0
      : smoothstep(0.31 * K, 0.356 * K, cur) * (1 - smoothstep(0.888, P_BACK, cur));
    const dr = Math.round(digital * 200) / 200;
    if (dr !== lastDigital) {
      lastDigital = dr;
      setCursor({ digital: dr });
    }

    const viewScale = (renderer.getPixelRatio() * canvas.clientHeight) / 800;
    const animT = reduced ? 0 : t;
    desk.update(animT, dt, viewScale);
    world.update(animT, dt, cur, camPos, { viewScale });

    // hover: only while the pointer is over the canvas
    if (hoverNdc) {
      const list = pickables().filter(visibleInTree);
      if (list.length) {
        raycaster.setFromCamera(hoverNdc, camera);
        const hit = raycaster.intersectObjects(list, true)[0];
        setHoverTarget(hit ? dataOf(hit.object) : null);
      } else if (hoverId) {
        setHoverTarget(null);
      }
    }

    if (phase === "world" && composer && bloomPass) {
      bloomPass.strength = world.bloom * 0.7;
      composer.render(dt);
    } else {
      renderer.render(phase === "desk" ? deskScene : world.scene, camera);
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    setProgress(p) {
      target = clamp(p);
    },
    setPointer(nx, ny) {
      pointer.x = nx;
      pointer.y = ny;
    },
    setActive(a) {
      active = a;
      if (a) clock.getDelta();
      else {
        lastDigital = -1;
        setCursor({ digital: 0, hint: null, rect: null });
        hoverId = null;
      }
    },
    resize,
    intro() {
      if (lampStart >= 0) return;
      lampStart = clock.elapsedTime;
      opts.onLampOn();
      setTimeout(() => desk.startTyping(), 900);
    },
    key(code, down) {
      desk.pressKey(code, down);
    },
    hover(x, y) {
      hoverNdc = toNdc(x, y).clone();
    },
    leave() {
      hoverNdc = null;
      if (hoverId) setHoverTarget(null);
    },
    click(x, y) {
      const hit = castAt(x, y);
      if (!hit) return null;
      const { data } = hit;
      if (data.slug) return { type: "project", slug: data.slug };
      if (data.id === "notebook") return { type: "jump", p: MARKS.notebook };
      if (data.id === "laptop") return { type: "jump", p: MARKS.enter };
      if (data.id === "cup") {
        puff = 1;
        return { type: "puff" };
      }
      if (data.note) return { type: "note", id: data.id, title: data.title, note: data.note };
      return null;
    },
    dispose() {
      cancelAnimationFrame(raf);
      setCursor({ digital: 0, hint: null, rect: null });
      desk.dispose();
      world.dispose();
      composer?.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
