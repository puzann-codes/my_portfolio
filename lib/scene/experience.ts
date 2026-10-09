import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildDesk, type Desk } from "./desk";
import { buildWorld, type World } from "./world";
import { clamp, cssFontFamily, easeInOut, lerp, nextFrame, smoothstep } from "./util";

/**
 * Scroll-driven camera director for the whole landing page.
 *
 *   0.00 – 0.15  desk: lamp on, name on the laptop screen, dolly to the screen
 *   0.15 – 0.20  through the screen (FOV warp → veil → swap to the world)
 *   0.18 – 0.925 the machine: terminal → neural net → city → crash → workshop
 *   0.915 – 0.95 back out (veil → swap to the desk)
 *   0.93 – 1.00  desk again: the camera eases out, the laptop lid closes
 */

export type ExperienceOptions = {
  canvas: HTMLCanvasElement;
  lowPower: boolean;
  onLoad: (v: number, label: string) => void;
  onStage: (stage: number) => void;
  onVeil: (opacity: number) => void;
  onHover: (info: { slug: string; title: string } | null) => void;
  onLampOn: () => void;
};

export type Experience = {
  setProgress(p: number): void;
  setPointer(nx: number, ny: number): void;
  setActive(active: boolean): void;
  resize(): void;
  intro(): void;
  key(code: string, down: boolean): void;
  hover(clientX: number, clientY: number): void;
  click(clientX: number, clientY: number): string | null;
  dispose(): void;
};

type Key = { p: number; pos: [number, number, number]; look: [number, number, number]; fov: number };

const KEYS: Key[] = [
  { p: 0.18, pos: [0, 3, 34], look: [0, 5, -60], fov: 62 },
  { p: 0.26, pos: [0, 6, -17], look: [0, 6, -60], fov: 55 },
  { p: 0.32, pos: [3, 7, -29], look: [0, 6, -60], fov: 55 },
  { p: 0.38, pos: [10, 8, -118], look: [30, 10, -192], fov: 55 },
  { p: 0.45, pos: [27, 10, -158], look: [30, 10, -205], fov: 58 },
  { p: 0.52, pos: [31, 10, -194], look: [29, 9, -250], fov: 62 },
  { p: 0.58, pos: [6, 38, -270], look: [-10, 2, -332], fov: 58 },
  { p: 0.65, pos: [-10, 16, -298], look: [-10, 3, -350], fov: 60 },
  { p: 0.72, pos: [8, 24, -438], look: [20, 0, -466], fov: 55 },
  { p: 0.77, pos: [34, 17, -446], look: [20, 0, -466], fov: 55 },
  { p: 0.84, pos: [-1.5, 3.2, -588], look: [0, 1.2, -600], fov: 52 },
  { p: 0.915, pos: [0, 2.2, -595.2], look: [0, 1.1, -600], fov: 50 },
];

const STAGE_AT = [0, 0.19, 0.34, 0.55, 0.68, 0.8, 0.935];

const P_CROSS = 0.178; // desk → world swap
const P_BACK = 0.93; // world → desk swap

function v3(a: [number, number, number]) {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

export async function createExperience(opts: ExperienceOptions): Promise<Experience> {
  const { canvas, lowPower } = opts;
  const report = opts.onLoad;

  report(0.02, "fonts");
  const heroFont = cssFontFamily("--font-unbounded", "sans-serif");
  try {
    await Promise.race([
      document.fonts.load(`900 100px ${heroFont}`),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to the system font */
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

  const DESK_FOV = 38;
  const camera = new THREE.PerspectiveCamera(DESK_FOV, 1, 0.01, 2500);
  // vertical FOV for the desk shots; widened on portrait screens so the
  // laptop and keyboard still fit side by side
  let deskFov = DESK_FOV;

  // ---------- desk ----------
  report(0.06, "desk");
  await nextFrame();
  const deskScene = new THREE.Scene();
  deskScene.background = new THREE.Color(0x040405);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  deskScene.environment = envTex;
  deskScene.environmentIntensity = 0.16;
  const desk: Desk = buildDesk({ quality: lowPower ? "low" : "high", fonts: { hero: heroFont } });
  deskScene.add(desk.group);
  report(0.2, "keys");
  await nextFrame();

  // ---------- world ----------
  const world: World = await buildWorld({
    quality: lowPower ? "low" : "high",
    fonts: { hero: heroFont },
    progress: (v, label) => report(0.2 + v * 0.65, label),
  });
  world.scene.environment = envTex;
  world.scene.environmentIntensity = 0.25;

  // ---------- camera paths ----------
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => v3(k.pos)), false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => v3(k.look)), false, "centripetal");

  const aspectFit = () => {
    const a = camera.aspect;
    // narrow screens need to sit further back to keep the desk in frame
    return a >= 1.2 ? 1 : 1 + (1.2 - a) * 0.25;
  };

  const fitDistance = (w: number, h: number, fov: number) => {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    return Math.max(h / 2 / t, w / 2 / (t * camera.aspect)) * 1.03;
  };

  // ---------- state ----------
  let target = 0;
  let cur = 0;
  let active = true;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let phase: "desk" | "world" = "desk";
  let lampStart = -1;
  let lampDone = false;
  let lastStage = -1;
  let lastVeil = -1;
  let hoverSlug: string | null = null;
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverNdc: THREE.Vector2 | null = null;

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the desk's core is ~1.25 m wide at the 1.5 m camera distance
    deskFov =
      camera.aspect >= 1.5
        ? DESK_FOV
        : clamp(
            THREE.MathUtils.radToDeg(2 * Math.atan(0.62 / (1.5 * camera.aspect))),
            DESK_FOV,
            74
          );
    camera.updateProjectionMatrix();
  };
  resize();

  // ---------- desk camera ----------
  const wideBase = new THREE.Vector3(0.02, 0.56, 1.5);
  const wideLook = new THREE.Vector3(0.0, 0.1, 0.0);
  const endPos = new THREE.Vector3(0.0, 0.5, 1.15);
  const endLook = new THREE.Vector3(-0.03, 0.03, 0.02);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  const placeDesk = (p: number, t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const af = aspectFit();
    const wide = tmpA.copy(wideBase);
    wide.z = wideLook.z + (wideBase.z - wideLook.z) * af;
    wide.y = wideBase.y + (af - 1) * 0.12;

    const sp = desk.screen.position;
    const sn = desk.screen.normal;
    const closeD = fitDistance(desk.screen.width, desk.screen.height, deskFov);
    const close = tmpB.copy(sp).addScaledVector(sn, closeD);

    if (p < P_BACK) {
      // intro idle → dolly to the screen → push through it
      const dolly = easeInOut(clamp((p - 0.035) / 0.115));
      const mid = tmpC.copy(wide).lerp(close, 0.5);
      mid.y += 0.1;
      // quadratic bezier wide → mid → close
      const a = tmpD.copy(wide).lerp(mid, dolly);
      outPos.copy(a).lerp(tmpC.copy(mid).lerp(close, dolly), dolly);
      outLook.copy(wideLook).lerp(sp, dolly);
      const push = easeInOut(clamp((p - 0.15) / (P_CROSS - 0.15)));
      outPos.addScaledVector(sn, -(closeD - 0.05) * push);
      // idle sway while we're still on the establishing shot
      const idle = 1 - dolly;
      outPos.x += Math.sin(t * 0.25) * 0.012 * idle;
      outPos.y += Math.sin(t * 0.21) * 0.006 * idle;
    } else {
      // returning: pull away from the screen toward the closing pose
      const k = easeInOut(clamp((p - P_BACK) / 0.06));
      const start = tmpC.copy(sp).addScaledVector(sn, 0.13);
      outPos.copy(start).lerp(close, smoothstep(0, 0.35, k)).lerp(endPos, smoothstep(0.2, 1, k));
      outLook.copy(sp).lerp(endLook, smoothstep(0.1, 1, k));
    }
    const sway = 0.03 * (p < 0.12 ? 1 : 0.3);
    outPos.x += pointer.sx * sway * 0.5;
    outPos.y += pointer.sy * sway * 0.3;
  };

  const placeWorld = (p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const n = KEYS.length - 1;
    const pc = clamp(p, KEYS[0].p, KEYS[n].p);
    let i = 0;
    while (i < n - 1 && pc > KEYS[i + 1].p) i++;
    const local = (pc - KEYS[i].p) / (KEYS[i + 1].p - KEYS[i].p);
    const e = smoothstep(0, 1, local) * 0.55 + local * 0.45;
    const u = (i + e) / n;
    posCurve.getPoint(u, outPos);
    lookCurve.getPoint(u, outLook);
    // narrower viewports sit further back so each environment still fits
    const back = 1 + Math.max(0, 1.6 - camera.aspect) * 0.75;
    outPos.sub(outLook).multiplyScalar(back).add(outLook);
    // pointer parallax scaled by how far we're looking
    const dist = outPos.distanceTo(outLook);
    const right = tmpA.set(1, 0, 0);
    outPos.addScaledVector(right, pointer.sx * dist * 0.012);
    outLook.y += pointer.sy * dist * 0.012;
    return { i, local };
  };

  const fovFor = (p: number) => {
    if (p < P_BACK && phase === "desk") {
      return lerp(deskFov, 96, smoothstep(0.15, P_CROSS, p));
    }
    if (phase === "world") {
      const n = KEYS.length - 1;
      const pc = clamp(p, KEYS[0].p, KEYS[n].p);
      let i = 0;
      while (i < n - 1 && pc > KEYS[i + 1].p) i++;
      const local = (pc - KEYS[i].p) / (KEYS[i + 1].p - KEYS[i].p);
      let f = lerp(KEYS[i].fov, KEYS[i + 1].fov, smoothstep(0, 1, local));
      f += Math.max(0, 1.5 - camera.aspect) * 22; // wider lens on portrait screens
      f += (1 - smoothstep(P_CROSS, 0.23, p)) * 26; // settle out of the warp
      f += smoothstep(0.9, P_BACK, p) * 24; // widen as we leave
      return f;
    }
    // desk, returning
    return lerp(78, deskFov, smoothstep(P_BACK, 0.99, p));
  };

  const veilAt = (p: number) => {
    const inn = smoothstep(0.162, P_CROSS, p);
    const out = 1 - smoothstep(P_CROSS, 0.205, p);
    const back = smoothstep(0.914, P_BACK, p);
    const out2 = 1 - smoothstep(P_BACK, 0.952, p);
    if (p < P_CROSS) return inn;
    if (p < 0.5) return out;
    return Math.min(back, p < P_BACK ? 1 : out2);
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
  try {
    const withTimeout = (p: Promise<unknown>) =>
      Promise.race([p, new Promise((r) => setTimeout(r, 3500))]);
    await withTimeout(renderer.compileAsync(deskScene, camera));
    await withTimeout(renderer.compileAsync(world.scene, camera));
  } catch {
    /* compile lazily on first render instead */
  }
  report(1, "ready");

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

    // scroll smoothing runs on real elapsed time, so a throttled frame rate
    // still converges on the target instead of crawling toward it
    cur += (target - cur) * (1 - Math.exp(-Math.min(rawDt, 0.5) * 5));
    if (Math.abs(target - cur) < 0.00002) cur = target;
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 4));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 4));

    // phase
    const nextPhase = cur >= P_CROSS && cur < P_BACK ? "world" : "desk";
    if (nextPhase !== phase) {
      phase = nextPhase;
      camera.near = phase === "world" ? 0.1 : 0.01;
      camera.updateProjectionMatrix();
    }

    // lamp warm-up
    if (lampStart >= 0 && !lampDone) {
      const s = t - lampStart;
      desk.setLamp(lampValue(s));
      if (s > 1.5) lampDone = true;
    }

    // lid: open until the final stretch, then closes
    desk.setLid(1 - easeInOut(clamp((cur - 0.955) / 0.03)));

    if (phase === "desk") placeDesk(cur, t, camPos, camLook);
    else placeWorld(cur, camPos, camLook);

    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fov = fovFor(cur);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // stage + veil callbacks (only on change)
    let stage = 0;
    for (let i = 0; i < STAGE_AT.length; i++) if (cur >= STAGE_AT[i]) stage = i;
    if (stage !== lastStage) {
      lastStage = stage;
      opts.onStage(stage);
    }
    const veil = Math.round(veilAt(cur) * 100) / 100;
    if (veil !== lastVeil) {
      lastVeil = veil;
      opts.onVeil(veil);
    }

    desk.update(t, dt);
    world.update(t, dt, cur, camPos);

    // workshop hover
    if (hoverNdc && cur > 0.8 && cur < 0.93 && phase === "world") {
      raycaster.setFromCamera(hoverNdc, camera);
      const hit = raycaster.intersectObjects(world.pickables, true)[0];
      let slug: string | null = null;
      let title = "";
      if (hit) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.slug) o = o.parent;
        if (o) {
          slug = o.userData.slug as string;
          title = o.userData.title as string;
        }
      }
      if (slug !== hoverSlug) {
        hoverSlug = slug;
        world.setHover(slug);
        opts.onHover(slug ? { slug, title } : null);
      }
    } else if (hoverSlug) {
      hoverSlug = null;
      world.setHover(null);
      opts.onHover(null);
    }

    renderer.render(phase === "desk" ? deskScene : world.scene, camera);
  };
  raf = requestAnimationFrame(frame);

  const toNdc = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    return ndc;
  };

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
    click(x, y) {
      if (!(cur > 0.8 && cur < 0.93 && phase === "world")) return null;
      raycaster.setFromCamera(toNdc(x, y), camera);
      const hit = raycaster.intersectObjects(world.pickables, true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && !o.userData.slug) o = o.parent;
      return o ? (o.userData.slug as string) : null;
    },
    dispose() {
      cancelAnimationFrame(raf);
      desk.dispose();
      world.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
