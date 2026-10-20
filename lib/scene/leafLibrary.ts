import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Kit } from "./props";

/**
 * Real leaves. The scanned plant `potted_plant_02` (Poly Haven, CC0) is made of
 * dozens of separate leaf meshes. This pulls them apart (connected triangles),
 * stands each one up on its own axis (base at the origin, tip at +y, length 1,
 * upper face toward +z) and hands them back as a small library, together with
 * the photographic textures. The vines then grow *these* leaves, so the shape
 * and the surface are scanned and the motion is simulated.
 */

export type LeafLibrary = {
  variants: { geo: THREE.BufferGeometry; /** width ÷ length */ aspect: number }[];
  map: THREE.Texture;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
};

/** eigenvectors of a symmetric 3×3 by Jacobi rotations, largest eigenvalue first */
function eigen3(m: number[][]) {
  const a = m.map((r) => r.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i][j] * a[i][j];
    if (off < 1e-14) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  const order = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
  return order.map((i) => new THREE.Vector3(v[0][i], v[1][i], v[2][i]));
}

export async function loadLeafLibrary(kit: Kit, url = "/models/potted_plant_02/potted_plant_02.gltf"): Promise<LeafLibrary> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  let leaves: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && /leaves/i.test(o.name)) leaves = o as THREE.Mesh;
  });
  if (!leaves) throw new Error("no leaf mesh in " + url);
  const mesh = leaves as THREE.Mesh;
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const mat = mesh.material as THREE.MeshStandardMaterial;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const index = geo.index!;
  const n = pos.count;

  // connected components of the triangle graph
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    for (const [u, w] of [
      [a, b],
      [b, c],
    ]) {
      const ru = find(u);
      const rw = find(w);
      if (ru !== rw) parent[ru] = rw;
    }
  }
  const islands = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = islands.get(r) ?? [];
    list.push(i);
    islands.set(r, list);
  }
  const tris = new Map<number, number[]>();
  for (let t = 0; t < index.count; t += 3) {
    const r = find(index.getX(t));
    const list = tris.get(r) ?? [];
    list.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
    tris.set(r, list);
  }

  const centre = new THREE.Vector3(0, 0.34, 0); // roughly where the stems leave the soil
  type Cand = { geo: THREE.BufferGeometry; aspect: number; verts: number };
  const cands: Cand[] = [];
  for (const [root, verts] of islands) {
    if (verts.length < 150) continue;
    const p = verts.map((i) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    const c = new THREE.Vector3();
    p.forEach((v) => c.add(v));
    c.divideScalar(p.length);
    const cov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const v of p) {
      const d = v.clone().sub(c);
      const a = [d.x, d.y, d.z];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += a[i] * a[j];
    }
    const [e1, , e3] = eigen3(cov);
    // which end is the base: the one nearer the plant's heart
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of p) {
      const s = v.clone().sub(c).dot(e1);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    const endLo = c.clone().addScaledVector(e1, lo);
    const endHi = c.clone().addScaledVector(e1, hi);
    const baseEnd = endLo.distanceTo(centre) <= endHi.distanceTo(centre) ? endLo : endHi;
    const y = e1.clone();
    if (baseEnd === endHi) y.negate();
    // normal faces up in the original pose
    const z = e3.clone();
    if (z.y < 0) z.negate();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const zz = new THREE.Vector3().crossVectors(x, y).normalize();
    const M = new THREE.Matrix4().makeBasis(x, y, zz).invert();
    const base = baseEnd;
    const loc = p.map((v) => v.clone().sub(base).applyMatrix4(M));
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const v of loc) {
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
    const L = maxY - minY;
    if (L < 0.04) continue;
    const width = (maxX - minX) / L;
    const thick = (maxZ - minZ) / L;
    if (width < 0.3 || width > 1.4 || thick > 0.5) continue;
    // build the island's own indexed geometry
    const remap = new Map<number, number>();
    const P: number[] = [];
    const N: number[] = [];
    const U: number[] = [];
    const rot = new THREE.Matrix3().setFromMatrix4(M);
    const cx = (minX + maxX) / 2;
    verts.forEach((vi, k) => {
      remap.set(vi, k);
      const v = loc[k];
      P.push((v.x - cx) / L, (v.y - minY) / L, v.z / L);
      const nn = new THREE.Vector3(nor.getX(vi), nor.getY(vi), nor.getZ(vi)).applyMatrix3(rot).normalize();
      N.push(nn.x, nn.y, nn.z);
      U.push(uv.getX(vi), uv.getY(vi));
    });
    const I = (tris.get(root) ?? []).map((i) => remap.get(i)!);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    cands.push({ geo: g, aspect: width, verts: verts.length });
  }
  geo.dispose();
  if (!cands.length) throw new Error("no usable leaves in " + url);
  cands.sort((a, b) => b.verts - a.verts);
  const chosen = cands.slice(0, 9);
  chosen.forEach((c) => kit.track(c.geo));

  const tex = (t: THREE.Texture | null | undefined) => {
    if (t) {
      t.anisotropy = 8;
      kit.track(t);
    }
    return t ?? null;
  };
  return {
    variants: chosen.map((c) => ({ geo: c.geo, aspect: c.aspect })),
    map: tex(mat.map)!,
    normal: tex(mat.normalMap),
    rough: tex(mat.roughnessMap ?? mat.metalnessMap),
  };
}
