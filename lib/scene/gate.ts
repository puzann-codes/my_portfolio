import * as THREE from "three";
import { clamp, lerp, textPlane } from "./util";

/**
 * A project "gate": an upright, framed title inside the machine that doubles
 * as the way into that project's case study. It is part of the architecture
 * of each environment, not a UI card; the cursor aligns to its frame on hover.
 */
export type GateOpts = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  width: number;
  fonts: { hero: string };
  /** "dark" ink for gates seen against a bright sky */
  tone?: "light" | "dark";
};

export function buildGate(o: GateOpts) {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];

  const title = textPlane(o.title, {
    width: o.width,
    font: o.fonts.hero,
    weight: 900,
    px: 200,
    letterSpacing: 0.02,
    color: o.tone === "dark" ? "#17181c" : "#c9ccd6",
  });
  const th = (title.geometry as THREE.PlaneGeometry).parameters.height;
  title.position.y = 0;
  group.add(title);
  // the gate stays crisp: it is the way into the case study, not scenery
  (title.material as THREE.MeshBasicMaterial).fog = false;

  const sub = textPlane(o.subtitle, {
    width: o.width * 0.5,
    px: 80,
    letterSpacing: 0.26,
    weight: 600,
    color: o.tone === "dark" ? "#34363d" : "#9ea2ad",
  });
  const sh = (sub.geometry as THREE.PlaneGeometry).parameters.height;
  sub.position.y = -(th / 2 + sh * 0.8);
  group.add(sub);
  (sub.material as THREE.MeshBasicMaterial).fog = false;
  tracked.push(title.geometry, title.material, sub.geometry, sub.material);

  // the frame: hairline rectangle with heavier corners
  const pad = o.width * 0.045;
  const hw = o.width / 2 + pad;
  const top = th / 2 + pad;
  const bottom = -(th / 2 + sh * 1.8 + pad * 0.4);
  const frameGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, top, 0),
    new THREE.Vector3(hw, top, 0),
    new THREE.Vector3(hw, bottom, 0),
    new THREE.Vector3(-hw, bottom, 0),
  ]);
  const frameMat = new THREE.LineBasicMaterial({ color: o.tone === "dark" ? 0x1b1c20 : 0xffffff, transparent: true, opacity: 0.28, fog: true });
  group.add(new THREE.LineLoop(frameGeo, frameMat));
  const cl = o.width * 0.05;
  const cornerPts: number[] = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const cx = sx * hw;
    const cy = sy > 0 ? top : bottom;
    cornerPts.push(cx, cy, 0, cx - sx * cl, cy, 0, cx, cy, 0, cx, cy - sy * cl, 0);
  }
  const cornerGeo = new THREE.BufferGeometry();
  cornerGeo.setAttribute("position", new THREE.Float32BufferAttribute(cornerPts, 3));
  const cornerMat = new THREE.LineBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0.0, fog: true });
  group.add(new THREE.LineSegments(cornerGeo, cornerMat));
  tracked.push(frameGeo, frameMat, cornerGeo, cornerMat);

  const hitGeo = new THREE.PlaneGeometry(hw * 2, top - bottom);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.set(0, (top + bottom) / 2, 0.05);
  hit.userData = { id: o.id, slug: o.slug, title: o.title, label: "OPEN CASE STUDY" };
  group.add(hit);
  tracked.push(hitGeo, hitMat);

  let hover = 0;
  let target = 0;
  const titleMat = title.material as THREE.MeshBasicMaterial;
  const subMat = sub.material as THREE.MeshBasicMaterial;
  return {
    group,
    hit,
    setHover(v: boolean) {
      target = v ? 1 : 0;
    },
    update(dt: number) {
      if (Math.abs(hover - target) < 0.002) return;
      hover = lerp(hover, target, clamp(dt * 9));
      frameMat.opacity = 0.28 + 0.6 * hover;
      cornerMat.opacity = hover;
      titleMat.opacity = 0.82 + 0.18 * hover;
      subMat.opacity = 0.7 + 0.3 * hover;
    },
    dispose() {
      tracked.forEach((d) => d.dispose());
    },
  };
}
