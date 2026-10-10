import * as THREE from "three";

/** A heightfield mesh with per-vertex colour, shared by the outdoor environments. */
export function makeTerrain(o: {
  size: number;
  seg: number;
  height: (x: number, z: number) => number;
  color: (h: number, x: number, z: number) => THREE.Color;
}) {
  const g = new THREE.PlaneGeometry(o.size, o.size, o.seg, o.seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = o.height(x, z);
    pos.setY(i, h);
    const c = o.color(h, x, z);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  return { mesh, geometry: g, material: mat };
}
