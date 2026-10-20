import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MONO, canvasTexture, clamp, cylBetween, makeCanvas, rng } from "./util";
import {
  arrowTexture,
  contactShadowTexture,
  plasterTexture,
  type SceneFonts,
  type SketchProgress,
} from "./textures";
import { posterDefs } from "./posters";
import { buildPothos, type Plant } from "./foliage";
import { loadLeafLibrary } from "./leafLibrary";
import {
  buildCable,
  buildKeyboard,
  buildLamp,
  buildLaptop,
  buildLaptopStand,
  buildMouse,
  feltPadTexture,
  KEY_UNIT,
  woodTexture,
} from "./hardware";
import { createScreen } from "./screenUi";
import { buildBooks, buildClock, buildCup, buildFrame, buildHeadphones, buildNotebook, buildPencil, type Kit } from "./props";

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
 * Everything is procedural, lit by one warm lamp and a studio environment
 * that gives the metals and glossy plastics something to reflect. Units are
 * metres, +z toward the viewer, desk top at y = 0.
 */

const SANS = '-apple-system, "SF Pro Text", "Inter", system-ui, "Helvetica Neue", Arial, sans-serif';

export type DeskState = {
  /** 0..1 position of the highlight travelling across the keys; <0 = off */
  keyWave: number;
  /** key codes held down by the choreography */
  held: string[];
  /** characters the keystrokes have typed on the laptop prompt */
  typed: string;
  /** 0..1 mouse slide (and the on-screen dot with it) */
  mouse: number;
  /** 0..1 the laptop's screen going from the home view to the code editor */
  screen: number;
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
  screen: 0,
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
  /** the room the glass and metals reflect */
  setEnvironment(tex: THREE.Texture): void;
  setLamp(v: number): void;
  setState(s: DeskState): void;
  setHover(id: string | null): void;
  /** load the real poster images (resolves when done; stand-ins show meanwhile) */
  loadPosters(): Promise<void>;
  /** swap in the scanned plant models (resolves when done, or when they fail to load) */
  loadPlants(): Promise<void>;
  /**
   * The pointer as a finger: a world ray (null when it is not over the scene)
   * and its world velocity in m/s. Call every frame.
   */
  touch(ray: { origin: THREE.Vector3; dir: THREE.Vector3 } | null, velocity: THREE.Vector3): void;
  /** true while the finger is on a leaf, and how hard it is moving over foliage */
  foliage(): { touching: boolean; rustle: number };
  startTyping(): void;
  /** the visitor pressing a real key */
  pressKey(code: string, down: boolean): void;
  update(t: number, dt: number, viewScale: number): void;
  dispose(): void;
};

export function buildDesk(opts: {
  quality: "high" | "low";
  fonts: SceneFonts;
  /** project titles shown on the laptop screen */
  projects: string[];
}): Desk {
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

  // ---------- room: wall, floor, desk, mat ----------
  // a calm studio wall: warm graphite with a soft pool of light behind the desk and a
  // slow fall-off toward the corners. No bump map and no noise: the grain was the problem.
  const wallCanvas = makeCanvas(512, 256);
  const wctx = wallCanvas.getContext("2d")!;
  const wg = wctx.createRadialGradient(256, 150, 20, 256, 150, 330);
  wg.addColorStop(0, "#43444a");
  wg.addColorStop(0.55, "#2f3035");
  wg.addColorStop(1, "#202125");
  wctx.fillStyle = wg;
  wctx.fillRect(0, 0, 512, 256);
  const wallTex = track(canvasTexture(wallCanvas, 2));
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wall = mesh(
    new THREE.PlaneGeometry(8, 3.4),
    std({ color: 0xffffff, map: wallTex, roughness: 0.92, metalness: 0 }),
    false,
    true
  );
  wall.position.set(0, 0.9, -0.622);
  group.add(wall);

  // a baseboard and a lighter band below the frames: some architecture
  const board = mesh(
    new THREE.BoxGeometry(16, 0.09, 0.02),
    std({ color: 0x3b3c41, roughness: 0.6 }),
    false,
    true
  );
  board.position.set(0, 0.045, -0.61);
  group.add(board);

  const floor = mesh(
    new THREE.PlaneGeometry(16, 10),
    std({ color: 0x25262a, roughness: 0.9 }),
    false,
    true
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.78, 1.2);
  group.add(floor);

  // a compact white workstation: 130 × 66 cm, a 3 cm lacquered top on tapered oak legs
  const DESK = { w: 1.3, d: 0.66, t: 0.03, z: -0.22 };
  const deskTex = track(plasterTexture());
  const desk = mesh(
    new RoundedBoxGeometry(DESK.w, DESK.t, DESK.d, 6, 0.007),
    std({ color: 0xcdcac3, roughness: 0.52, metalness: 0, bumpMap: deskTex, bumpScale: 0.01 })
  );
  desk.position.set(0, -DESK.t / 2, DESK.z);
  group.add(desk);

  const oakLeg = track(woodTexture(true, 3));
  const oak = std({ color: 0xffffff, map: oakLeg, roughness: 0.55 });
  const legGeo = track(new THREE.CylinderGeometry(0.0185, 0.0115, 0.72, 28));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, oak);
      leg.castShadow = true;
      leg.receiveShadow = true;
      leg.position.set(sx * 0.57, -DESK.t - 0.36 + 0.004, DESK.z + sz * 0.25);
      leg.rotation.set(-sz * 0.045, 0, sx * 0.045);
      group.add(leg);
    }
  }
  // the apron frame under the top, and a shallow drawer with a brass pull
  const oakRail = track(woodTexture(false, 9));
  const railMat = std({ color: 0xffffff, map: oakRail, roughness: 0.55 });
  const railF = mesh(new RoundedBoxGeometry(1.1, 0.055, 0.018, 2, 0.003), railMat);
  railF.position.set(0, -DESK.t - 0.0275, DESK.z + 0.25);
  group.add(railF);
  const railB = railF.clone();
  railB.position.z = DESK.z - 0.25;
  group.add(railB);
  for (const sx of [-1, 1]) {
    const railS = mesh(new RoundedBoxGeometry(0.018, 0.055, 0.5, 2, 0.003), railMat);
    railS.position.set(sx * 0.55, -DESK.t - 0.0275, DESK.z);
    group.add(railS);
  }
  const drawer = mesh(new RoundedBoxGeometry(0.44, 0.052, 0.012, 2, 0.003), railMat);
  drawer.position.set(0.12, -DESK.t - 0.0295, DESK.z + 0.262);
  group.add(drawer);
  const brass = std({ color: 0xb48e55, metalness: 1, roughness: 0.3 });
  const pull = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.07, 16), brass);
  pull.rotation.z = Math.PI / 2;
  pull.position.set(0.12, -DESK.t - 0.0295, DESK.z + 0.274);
  group.add(pull);

  // a felt pad anchors the keyboard, mouse and stand; the rest of the desk stays white
  const MAT = { x: 0.04, z: -0.1, w: 0.86, d: 0.44 };
  const feltT = track(feltPadTexture(MAT.w / MAT.d));
  const mat = mesh(
    new RoundedBoxGeometry(MAT.w, 0.004, MAT.d, 3, 0.0018),
    track(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: feltT,
        roughness: 0.96,
        sheen: 0.4,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0x6a6e78),
      })
    ),
    false,
    true
  );
  mat.position.set(MAT.x, 0.002, MAT.z);
  group.add(mat);

  // ---------- laptop ----------
  const screenUi = createScreen({ hero: opts.fonts.hero, projects: opts.projects });
  track(screenUi.texture);
  const LAP_Z = -0.32;
  const stand = buildLaptopStand(kit);
  stand.group.position.set(0, 0.004, LAP_Z);
  group.add(stand.group);
  const lap = buildLaptop(kit, screenUi.texture, SANS);
  lap.group.position.set(0, 0.004 + stand.origin.y, LAP_Z + stand.origin.z);
  lap.group.rotation.x = stand.tilt;
  group.add(lap.group);
  kit.addContact(group, 0.5, 0.34, { alpha: 0.35, y: 0.0042, x: 0, z: LAP_Z });

  const { SW, SH, SCR_Y, pivot: lidPivot, screen } = lap;

  // the on-screen pointer: a separate plane, so moving it never repaints
  const arrowTex = track(arrowTexture());
  const arrow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.0125, 0.0125)),
    track(new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, toneMapped: false, depthWrite: false }))
  );
  arrow.position.set(0, SCR_Y, 0.0013);
  arrow.visible = false;
  lidPivot.add(arrow);

  const screenHit = new THREE.Mesh(
    track(new THREE.BoxGeometry(SW, SH, 0.02)),
    track(new THREE.MeshBasicMaterial({ visible: false }))
  );
  screenHit.position.set(0, SCR_Y, 0.01);
  screenHit.userData = { id: "laptop", title: "Laptop", label: "ENTER" } satisfies DeskPickData;
  lidPivot.add(screenHit);

  let lidValue = 1;
  const setLid = (v: number) => {
    lap.setLid(v);
    lidValue = clamp(v);
    screenHit.visible = lidValue > 0.5;
  };
  setLid(1);

  // ---------- keyboard (75%, pale-blue shell) ----------
  const KB = { x: 0.0, z: -0.04 };
  const kb = buildKeyboard(kit, SANS, MONO);
  kb.group.position.set(KB.x, 0.004, KB.z);
  kb.group.rotation.y = -0.03;
  group.add(kb.group);
  kit.addContact(kb.group, 0.4, 0.2, { alpha: 0.7, y: -0.0036 });
  const kbCaseMat = kb.caseMat;

  // a small, cool light that rides along the keys during the typing beat
  const sweep = new THREE.PointLight(0xcfe0ff, 0, 0.3, 2);
  kb.deck.add(sweep);

  const kbHit = new THREE.Mesh(
    track(new THREE.BoxGeometry(kb.width + 0.01, 0.05, kb.depth + 0.01)),
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
  kb.group.add(kbHit);

  // ---------- mouse ----------
  const mouse = buildMouse(kit);
  const MOUSE0 = new THREE.Vector3(0.27, 0.004, 0.0);
  mouse.position.copy(MOUSE0);
  mouse.rotation.y = -0.12;
  group.add(mouse);

  // ---------- notebook, pencil, cup, and the rest of the desk ----------
  const NB = { x: -0.4, z: -0.04, ry: 0.22 };
  const notebook = buildNotebook(kit, opts.fonts);
  notebook.group.position.set(NB.x, 0.0, NB.z);
  notebook.group.rotation.y = NB.ry;
  group.add(notebook.group);

  const pencil = buildPencil(kit);
  pencil.position.set(-0.28, 0.0, 0.07);
  pencil.rotation.y = -0.55;
  group.add(pencil);

  const CUP = { x: -0.31, z: -0.37 };
  const cup = buildCup(kit);
  cup.group.position.set(CUP.x, 0, CUP.z);
  cup.group.rotation.y = 0.7;
  group.add(cup.group);

  const clock = buildClock(kit);
  clock.group.position.set(0.31, 0.0, -0.44);
  clock.group.rotation.y = -0.22;
  group.add(clock.group);

  // plants: trailing pothos, grown in loadPlants() from scanned leaves
  const plantHit = (x: number, y: number, z: number, w: number, h: number, id: string, title: string, note: string) => {
    const m = new THREE.Mesh(
      track(new THREE.BoxGeometry(w, h, w)),
      track(new THREE.MeshBasicMaterial({ visible: false }))
    );
    m.position.set(x, y, z);
    m.userData = { id, title, label: "TOUCH", note } satisfies DeskPickData;
    group.add(m);
    return m;
  };
  const deskPlantHit = plantHit(0.45, 0.07, -0.34, 0.26, 0.2, "plant-desk", "Pothos", "It leans toward the window that isn't there.");

  // ---------- the wall: posters and prints that say who's at the desk ----------
  const WALL_Z = -0.618;
  const defs = posterDefs(opts.fonts);

  // a walnut shelf under the triptych, lit from below by a warm strip: two albums, a stack of
  // books, and a pothos that trails off the end
  const LEDGE = { x: 0.0, y: 0.36, w: 0.72, d: 0.12, t: 0.022 };
  const walnutTex = track(woodTexture(false, 4, true));
  walnutTex.repeat.set(2, 1);
  const ledge = mesh(
    new RoundedBoxGeometry(LEDGE.w, LEDGE.t, LEDGE.d, 3, 0.004),
    std({ color: 0xffffff, map: walnutTex, roughness: 0.5 })
  );
  ledge.position.set(LEDGE.x, LEDGE.y, WALL_Z + LEDGE.d / 2);
  group.add(ledge);
  // the LED strip along its underside, and the wash it throws on the wall below
  const strip = new THREE.Mesh(
    track(new THREE.BoxGeometry(LEDGE.w - 0.04, 0.003, 0.006)),
    track(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }))
  );
  strip.position.set(LEDGE.x, LEDGE.y - LEDGE.t / 2 - 0.0016, WALL_Z + LEDGE.d - 0.022);
  group.add(strip);
  const shelfGlow = new THREE.SpotLight(0xffb36b, 0, 1.4, 1.2, 1, 1.6);
  shelfGlow.position.set(LEDGE.x, LEDGE.y - 0.02, WALL_Z + LEDGE.d - 0.03);
  shelfGlow.target.position.set(LEDGE.x, LEDGE.y - 0.5, WALL_Z);
  group.add(shelfGlow, shelfGlow.target);
  const books = buildBooks(kit);
  books.position.set(LEDGE.x + 0.11, LEDGE.y + LEDGE.t / 2, WALL_Z + 0.065);
  books.rotation.y = 0.08;
  books.scale.setScalar(0.78);
  group.add(books);
  // headphones on their stand, at the back right of the desk
  const phones = buildHeadphones(kit);
  phones.position.set(0.58, 0, -0.46);
  phones.rotation.y = -0.5;
  phones.scale.setScalar(0.8);
  group.add(phones);
  const shelfPlantHit = plantHit(LEDGE.x + 0.27, LEDGE.y - 0.1, WALL_Z + 0.08, 0.24, 0.36, "plant-shelf", "Pothos", "Trailing a little further every month.");

  const frames = defs.map((d) => {
    const f = buildFrame(kit, {
      w: d.w,
      h: d.h,
      border: d.w > 0.3 ? 0.011 : 0.008,
      finish: d.finish,
      mat: d.mat,
      tex: track(d.fallback()),
      data: { id: d.id, title: d.title, label: "VIEW", note: d.note } satisfies DeskPickData,
    });
    if (d.shelf) {
      f.group.position.set(d.x, LEDGE.y + LEDGE.t / 2 + d.h / 2 - 0.003, WALL_Z + LEDGE.d * 0.6);
      f.group.rotation.x = -0.1;
    } else {
      f.group.position.set(d.x, d.y, WALL_Z);
    }
    f.group.rotation.z = d.tilt ?? 0;
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
  const lampBase = new THREE.Vector3(-0.56, 0.0, -0.44);
  const j1 = new THREE.Vector3(-0.51, 0.26, -0.41);
  const j2 = new THREE.Vector3(-0.4, 0.46, -0.36);
  const headPos = new THREE.Vector3(-0.3, 0.5, -0.28);
  const lookAtPoint = new THREE.Vector3(-0.06, 0.0, -0.06);
  const lampRig = buildLamp(kit, { base: lampBase, j1, j2, head: headPos, target: lookAtPoint });
  group.add(lampRig.group);
  const bulbMat = lampRig.bulbMat;

  const KEY_COLOR = 0xffd9a6; // warm lamp
  const spot = new THREE.SpotLight(KEY_COLOR, 0, 0, 0.78, 0.95, 2);
  spot.position.copy(lampRig.lightPos);
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
  const hemi = new THREE.HemisphereLight(0xcfdcf0, 0x2a2a2e, 0.7);
  group.add(hemi);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
  rim.position.set(1.4, 0.9, -0.5);
  group.add(rim);
  // a large soft key from the front-left, like a window you cannot see
  const fill = new THREE.DirectionalLight(0xfff3e4, 0);
  fill.position.set(-0.8, 1.3, 1.5);
  group.add(fill);
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
    spot.intensity = 3.4 * k * focusDim;
    bulbMat.color.setScalar(0.04 + 1.0 * k);
    bulbMat.color.multiply(new THREE.Color(1, 0.9, 0.75));
    beamMat.uniforms.uI.value = k;
    dustMat.uniforms.uI.value = k;
    hemi.intensity = 0.7 * clamp(k * 1.5);
    fill.intensity = 0.8 * clamp(k * 1.5);
    rim.intensity = 0.9 * clamp(k * 1.5);
    wash.intensity = 2.6 * clamp(k);
    shelfGlow.intensity = 3.2 * clamp(k);
  };
  const setLamp = (v: number) => {
    lampValue = v;
    applyLamp();
  };
  setLamp(0);

  // ---------- cables: a charger lead and the keyboard's braided lead, both off the back ----------
  group.updateMatrixWorld(true);
  {
    const port = lap.group.localToWorld(new THREE.Vector3(-0.1525, 0.0054, 0.018));
    group.add(
      buildCable(
        kit,
        [
          port,
          port.clone().add(new THREE.Vector3(-0.03, -0.004, 0.012)),
          new THREE.Vector3(-0.2, 0.0045, -0.1),
          new THREE.Vector3(-0.215, 0.0035, -0.26),
          new THREE.Vector3(-0.17, 0.0035, -0.42),
          new THREE.Vector3(-0.15, 0.0035, -0.62),
        ],
        0xe8e8e4,
        0.0021
      )
    );
    const kbPort = kb.group.localToWorld(new THREE.Vector3(0, 0.0115, -kb.depth / 2 - 0.002));
    group.add(
      buildCable(
        kit,
        [
          kbPort,
          kbPort.clone().add(new THREE.Vector3(0.0, -0.004, -0.03)),
          new THREE.Vector3(0.09, 0.0055, -0.13),
          new THREE.Vector3(0.17, 0.0055, -0.2),
          new THREE.Vector3(0.19, 0.0045, -0.4),
          new THREE.Vector3(0.18, 0.0045, -0.62),
        ],
        0x6d94c1,
        0.0018
      )
    );
  }

  // ---------- the signal: a thin line from the notebook into the laptop ----------
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
  const scr = { sub: 0, typing: false, t0: 0, blink: true, lastBlink: 0, lastPaint: -1, keys: "", t: 0, mode: 0, dirty: true };
  const repaint = () => {
    screenUi.paint({ sub: scr.sub, keys: scr.keys, blink: scr.blink, t: scr.t, mode: scr.mode });
    scr.dirty = false;
  };
  repaint();

  // ---------- state application ----------
  // a slight nudge: a few centimetres, enough to send the pointer across the screen
  const MOUSE_END = new THREE.Vector3(-0.028, 0, -0.04);
  const camHeld = new Set<string>();
  const userHeld = new Set<string>();
  const iceTint = new THREE.Color(0.74, 0.86, 1.05);
  let lastWave = -2;
  let waveCenter = -1;
  let hoverId: string | null = null;
  const hoverAmt = new Map<string, number>();

  const applyKeys = () => kb.setTargets((code) => camHeld.has(code) || userHeld.has(code));

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
    if (Math.abs(s.screen - scr.mode) > 0.004) {
      scr.mode = s.screen;
      scr.dirty = true;
    }

    // highlight wave
    if (Math.abs(s.keyWave - lastWave) > 0.002) {
      lastWave = s.keyWave;
      waveCenter = s.keyWave < 0 ? -1 : s.keyWave * 18 - 1;
      kb.wave(waveCenter, iceTint);
      const on = waveCenter >= 0 && waveCenter <= 17;
      sweep.intensity = on ? 0.0024 : 0;
      if (on) sweep.position.set(kb.left + waveCenter * KEY_UNIT, 0.034, kb.rowZ(2));
    }

    // the mouse slides, and the dot of light goes with it
    const e = s.mouse;
    mouse.position.set(MOUSE0.x + MOUSE_END.x * e, MOUSE0.y, MOUSE0.z + MOUSE_END.z * e);
    mouse.rotation.y = -0.2 - 0.12 * e;
    arrow.visible = e > 0.001 && lidValue > 0.5;
    // from the middle of the screen toward the dock, in step with the mouse
    const u = THREE.MathUtils.lerp(0.64, 0.465, e);
    const v = THREE.MathUtils.lerp(0.5, 0.93, e);
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
    deskPlantHit,
    shelfPlantHit,
    ...frames.map((f) => f.frame.hit),
  ];

  // ---------- a loose sheet whose far corner lifts in a passing breeze ----------
  const SHEET = { w: 0.15, d: 0.21 };
  const sheetGeo = track(new THREE.PlaneGeometry(SHEET.w, SHEET.d, 8, 10));
  sheetGeo.rotateX(-Math.PI / 2);
  const sheetPos = sheetGeo.attributes.position as THREE.BufferAttribute;
  const sheetRest = new Float32Array(sheetPos.array as Float32Array);
  // a printed page: a heading, rows of text, a small diagram — never blank
  const pageC = makeCanvas(320, 448);
  {
    const x = pageC.getContext("2d")!;
    x.fillStyle = "#f1eee6";
    x.fillRect(0, 0, 320, 448);
    const R = rng(21);
    x.fillStyle = "#2a2d34";
    x.fillRect(28, 34, 120, 9);
    x.fillStyle = "rgba(42,45,52,0.55)";
    x.fillRect(28, 52, 70, 4);
    for (let i = 0; i < 17; i++) {
      const y = 88 + i * 13.5;
      let xx = 28;
      while (xx < 292) {
        const w = 14 + R() * 46;
        x.fillStyle = `rgba(42,45,52,${0.22 + R() * 0.16})`;
        x.fillRect(xx, y, Math.min(w, 292 - xx), 4);
        xx += w + 6;
      }
    }
    x.strokeStyle = "rgba(42,45,52,0.6)";
    x.lineWidth = 2;
    x.strokeRect(36, 330, 70, 44);
    x.strokeRect(128, 330, 70, 44);
    x.beginPath();
    x.moveTo(106, 352);
    x.lineTo(128, 352);
    x.moveTo(198, 352);
    x.lineTo(226, 352);
    x.stroke();
    x.beginPath();
    x.arc(248, 352, 20, 0, Math.PI * 2);
    x.stroke();
  }
  const pageTex = track(canvasTexture(pageC, 8));
  const sheetMesh = new THREE.Mesh(sheetGeo, std({ color: 0xffffff, map: pageTex, roughness: 0.92, side: THREE.DoubleSide }));
  sheetMesh.castShadow = true;
  sheetMesh.receiveShadow = true;
  sheetMesh.position.set(-0.57, 0.0012, -0.2);
  sheetMesh.rotation.y = 0.22;
  group.add(sheetMesh);
  const sheetCorner = new THREE.Vector3();
  const sheet = {
    lift: 0,
    vel: 0,
    update(dt: number) {
      if (Math.abs(this.lift) < 0.0004 && Math.abs(this.vel) < 0.002) return;
      const h = Math.min(dt, 1 / 30);
      this.vel += (-70 * this.lift - 5.5 * this.vel) * h;
      this.lift = clamp(this.lift + this.vel * h, 0, 1);
      for (let i = 0; i < sheetPos.count; i++) {
        const x = sheetRest[i * 3];
        const z = sheetRest[i * 3 + 2];
        const fx = clamp((x + SHEET.w / 2) / SHEET.w);
        const fz = clamp((SHEET.d / 2 - z) / SHEET.d);
        sheetPos.setY(i, this.lift * 0.05 * Math.pow(fx, 1.6) * Math.pow(fz, 1.6));
      }
      sheetPos.needsUpdate = true;
      sheetGeo.computeVertexNormals();
    },
  };
  // the plants in play. Built once the scanned leaves have loaded; if they cannot, the same
  // vines grow from painted leaves instead.
  let plants: Plant[] = [];
  let airReady = false;
  const loadPlants = async () => {
    let lib = null;
    if (high) {
      try {
        lib = await loadLeafLibrary(kit);
      } catch (err) {
        console.warn("scanned leaves failed to load; using painted ones", err);
      }
    }
    const shelf = buildPothos(kit, {
      seed: 5,
      vines: 9,
      nodes: 11,
      leafSize: 0.07,
      potR: 0.05,
      potH: 0.085,
      potColor: 0xe9e6df,
      dropMin: 0.16,
      dropMax: 0.42,
      lib,
    });
    shelf.group.position.set(LEDGE.x + 0.27, LEDGE.y + LEDGE.t / 2, WALL_Z + 0.075);
    const onDesk = buildPothos(kit, {
      seed: 11,
      vines: 10,
      nodes: 10,
      leafSize: 0.075,
      potR: 0.066,
      potH: 0.12,
      potColor: 0x1d1e21,
      dropMin: 0.1,
      dropMax: 0.2,
      creep: 0.2,
      lib,
    });
    onDesk.group.position.set(0.45, 0, -0.38);
    onDesk.group.rotation.y = 0.6;
    kit.addContact(onDesk.group, 0.3, 0.3, { alpha: 0.7 });
    group.add(shelf.group, onDesk.group);
    plants = [shelf, onDesk];
    airReady = false;
  };
  const _o = new THREE.Vector3();
  const touch = (ray: { origin: THREE.Vector3; dir: THREE.Vector3 } | null, velocity: THREE.Vector3) => {
    if (!airReady) {
      group.updateMatrixWorld(true);
      for (const p of plants) p.refresh();
      airReady = true;
    }
    for (const p of plants) p.touch(ray, velocity);
    if (!ray) return;
    // the loose sheet: its far corner lifts when the finger passes over it quickly
    sheetCorner.set(SHEET.w / 2, 0.01, -SHEET.d / 2);
    sheetMesh.localToWorld(sheetCorner);
    _o.copy(sheetCorner).sub(ray.origin);
    const t = _o.dot(ray.dir);
    if (t > 0) {
      const d = _o.sub(ray.dir.clone().multiplyScalar(t)).length();
      const f = Math.exp(-Math.pow(d / 0.1, 2)) * Math.min(2, velocity.length());
      if (f > 0.05) sheet.vel += f * 0.3;
    }
  };

  const update = (t: number, dt: number, viewScale: number) => {
    dustMat.uniforms.uT.value = t;
    dustMat.uniforms.uScale.value = viewScale;
    sigMat.uniforms.uT.value = t;
    cup.update(t, viewScale);
    notebook.update(t);
    for (const p of plants) p.update(t, dt);
    sheet.update(dt);

    scr.t = t;
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
    // the waveform moves a few times a second, only while the screen is lit
    if (lidValue > 0.5 && t - scr.lastPaint > (high ? 0.22 : 0.5)) scr.dirty = true;
    if (scr.dirty && lidValue > 0.5) {
      scr.lastPaint = t;
      repaint();
    }

    kb.update(dt);

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
    kb.dispose();
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
      laptop: new THREE.Vector3(0, 0.12, -0.32),
    },
    pickables,
    setLid,
    setEnvironment(tex) {
      lap.sheenMat.envMap = tex;
      lap.sheenMat.needsUpdate = true;
    },
    setLamp,
    setState,
    setHover(id) {
      hoverId = id;
    },
    loadPosters,
    loadPlants,
    touch,
    foliage() {
      let touching = false;
      let rustle = 0;
      for (const p of plants) {
        const st = p.state();
        touching = touching || st.touching;
        rustle = Math.max(rustle, st.rustle);
      }
      return { touching, rustle };
    },
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
