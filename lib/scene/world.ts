import * as THREE from "three";
import { rng, nextFrame } from "./util";
import { Atmosphere, type PaletteName } from "./sky";
import { buildCity } from "./city";
import { buildCrash } from "./crash";
import { buildHarvo } from "./harvo";
import { buildLearnscape } from "./learnscape";
import { buildMul } from "./mul";
import { buildTerminal } from "./terminal";

/**
 * "Inside the machine": a long corridor of environments, one per project and
 * then the technical backdrop. Each has its own palette and time of day (see
 * sky.ts); they blend as the camera travels, so it stays one continuous shot.
 */

export type WorldEnv = { viewScale: number };

export type World = {
  scene: THREE.Scene;
  pickables: THREE.Object3D[];
  /** bloom strength for the current palette */
  readonly bloom: number;
  update(t: number, dt: number, p: number, cam: THREE.Vector3, env: WorldEnv): void;
  setHover(id: string | null): void;
  dispose(): void;
};

// Stage centres in world space, in the order of the story: the projects,
// then the terminal. `experience.ts` frames the camera relative to these.
export const STAGE_POS = {
  city: new THREE.Vector3(-10, 0, -120),
  crash: new THREE.Vector3(20, 0, -320),
  harvo: new THREE.Vector3(0, 0, -520),
  learnscape: new THREE.Vector3(0, 8, -720),
  mul: new THREE.Vector3(0, 0, -920),
  terminal: new THREE.Vector3(0, 6, -1120),
};

const PALETTE_OF: Record<keyof typeof STAGE_POS, PaletteName> = {
  city: "city",
  crash: "crash",
  harvo: "harvo",
  learnscape: "learnscape",
  mul: "mul",
  terminal: "terminal",
};

export async function buildWorld(opts: {
  quality: "high" | "low";
  fonts: { hero: string };
  progress: (v: number, label: string) => void;
}): Promise<World> {
  const { quality, fonts, progress } = opts;
  const scene = new THREE.Scene();

  const order = Object.keys(STAGE_POS) as (keyof typeof STAGE_POS)[];
  const atmosphere = new Atmosphere(
    scene,
    order.map((k) => ({ name: PALETTE_OF[k], z: STAGE_POS[k].z }))
  );

  // drifting motes along the whole corridor (parallax while travelling)
  const R = rng(3);
  const N = quality === "high" ? 1500 : 600;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (R() - 0.5) * 260;
    pos[i * 3 + 1] = -20 + R() * 120;
    pos[i * 3 + 2] = 60 - R() * 1500;
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  scene.add(new THREE.Points(mGeo, mMat));

  const stages: {
    key: keyof typeof STAGE_POS;
    group: THREE.Group;
    radius: number;
    update: (t: number, dt: number, cam: THREE.Vector3, env: WorldEnv, fog: THREE.FogExp2) => void;
    pickables: THREE.Object3D[];
    setHover: (id: string | null) => void;
    dispose: () => void;
  }[] = [];

  const place = (key: keyof typeof STAGE_POS, g: THREE.Group) => {
    g.position.copy(STAGE_POS[key]);
    scene.add(g);
  };
  const steps: [keyof typeof STAGE_POS, number, number][] = [
    ["city", 0.02, 220],
    ["crash", 0.18, 100],
    ["harvo", 0.38, 170],
    ["learnscape", 0.56, 130],
    ["mul", 0.74, 170],
    ["terminal", 0.88, 110],
  ];
  for (const [key, at, radius] of steps) {
    progress(at, key);
    await nextFrame();
    const cam = (s: { group: THREE.Group; update: (t: number, dt: number, c: THREE.Vector3) => void; pickables: THREE.Object3D[]; setHover: (id: string | null) => void; dispose: () => void }) => {
      place(key, s.group);
      stages.push({ key, group: s.group, radius, update: (t, dt, c) => s.update(t, dt, c), pickables: s.pickables, setHover: s.setHover, dispose: s.dispose });
    };
    if (key === "city") {
      const s = buildCity({ quality, fonts });
      place(key, s.group);
      stages.push({ key, group: s.group, radius, update: (t, dt) => s.update(t, dt), pickables: s.pickables, setHover: s.setHover, dispose: s.dispose });
    } else if (key === "crash") cam(buildCrash({ fonts }));
    else if (key === "harvo") cam(buildHarvo({ quality, fonts }));
    else if (key === "learnscape") cam(buildLearnscape({ quality, fonts }));
    else if (key === "mul") cam(buildMul({ quality, fonts }));
    else {
      const s = buildTerminal();
      place(key, s.group);
      stages.push({ key, group: s.group, radius, update: (t, dt) => s.update(t, dt), pickables: [], setHover: () => {}, dispose: s.dispose });
    }
  }
  progress(1, "world");

  return {
    scene,
    pickables: stages.flatMap((s) => s.pickables),
    get bloom() {
      return atmosphere.bloom;
    },
    update(t, dt, _progress, cam, env) {
      atmosphere.update(cam, t);
      for (const s of stages) {
        s.group.visible = cam.distanceTo(STAGE_POS[s.key]) < s.radius;
        if (s.group.visible) s.update(t, dt, cam, env, atmosphere.fog);
      }
    },
    setHover(id) {
      for (const s of stages) s.setHover(id);
    },
    dispose() {
      stages.forEach((s) => s.dispose());
      atmosphere.dispose();
      mGeo.dispose();
      mMat.dispose();
    },
  };
}
