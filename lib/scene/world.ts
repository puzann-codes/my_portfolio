import * as THREE from "three";
import { TOP_PROJECTS } from "@/data/projects";
import { rng, nextFrame } from "./util";
import { buildTerminal } from "./terminal";
import { buildNeural } from "./neural";
import { buildCity } from "./city";
import { buildCrash } from "./crash";
import { buildWorkshop } from "./workshop";

/**
 * "Inside the machine": one scene, five environments laid out along a
 * long corridor of the camera's path. Everything is monochrome — black
 * void, white hairlines, grey solids — so it stays architectural.
 */

export type World = {
  scene: THREE.Scene;
  pickables: THREE.Object3D[];
  update(t: number, dt: number, p: number, cam: THREE.Vector3): void;
  setHover(slug: string | null): void;
  dispose(): void;
};

// stage centres in world space
export const STAGE_POS = {
  terminal: new THREE.Vector3(0, 6, -60),
  neural: new THREE.Vector3(30, 10, -200),
  city: new THREE.Vector3(-10, 0, -335),
  crash: new THREE.Vector3(20, 0, -465),
  workshop: new THREE.Vector3(0, 0, -600),
};

export async function buildWorld(opts: {
  quality: "high" | "low";
  fonts: { hero: string };
  progress: (v: number, label: string) => void;
}): Promise<World> {
  const { quality, fonts, progress } = opts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.009);

  // lighting shared by the lit environments (city, crash)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-40, 80, 50);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfc4d0, 0.5);
  fill.position.set(40, 20, -30);
  scene.add(fill);

  // drifting motes along the whole corridor (parallax while travelling)
  const R = rng(3);
  const N = quality === "high" ? 900 : 400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (R() - 0.5) * 220;
    pos[i * 3 + 1] = -20 + R() * 100;
    pos[i * 3 + 2] = 60 - R() * 700;
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.3,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  scene.add(new THREE.Points(mGeo, mMat));

  progress(0.02, "terminal");
  await nextFrame();
  const terminal = buildTerminal();
  terminal.group.position.copy(STAGE_POS.terminal);
  scene.add(terminal.group);

  progress(0.18, "neural");
  await nextFrame();
  const neural = buildNeural({ quality });
  neural.group.position.copy(STAGE_POS.neural);
  scene.add(neural.group);

  progress(0.32, "city");
  await nextFrame();
  const city = buildCity({ quality, fonts });
  city.group.position.copy(STAGE_POS.city);
  scene.add(city.group);

  progress(0.52, "crash");
  await nextFrame();
  const crash = buildCrash();
  crash.group.position.copy(STAGE_POS.crash);
  scene.add(crash.group);

  progress(0.7, "workshop");
  await nextFrame();
  const workshop = buildWorkshop(
    TOP_PROJECTS.map((p) => ({ slug: p.slug, title: p.title })),
    { quality }
  );
  workshop.group.position.copy(STAGE_POS.workshop);
  scene.add(workshop.group);
  progress(1, "world");

  // only update/draw what's near the camera
  const groups: [THREE.Group, THREE.Vector3, number][] = [
    [terminal.group, STAGE_POS.terminal, 110],
    [neural.group, STAGE_POS.neural, 100],
    [city.group, STAGE_POS.city, 130],
    [crash.group, STAGE_POS.crash, 112],
    [workshop.group, STAGE_POS.workshop, 60],
  ];

  return {
    scene,
    pickables: workshop.pickables,
    update(t, dt, _progress, cam) {
      for (const [g, c, r] of groups) g.visible = cam.distanceTo(c) < r;
      if (terminal.group.visible) terminal.update(t, dt);
      if (neural.group.visible) neural.update(t, cam);
      if (city.group.visible) city.update(t, dt);
      if (crash.group.visible) crash.update(t);
      if (workshop.group.visible) workshop.update(t, dt);
    },
    setHover: workshop.setHover,
    dispose() {
      terminal.dispose();
      neural.dispose();
      city.dispose();
      crash.dispose();
      workshop.dispose();
      mGeo.dispose();
      mMat.dispose();
    },
  };
}
