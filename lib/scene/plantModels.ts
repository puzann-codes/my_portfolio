import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp } from "./util";
import type { Kit } from "./props";
import type { Plant } from "./foliage";

/**
 * Real plants: photo-scanned, textured models (Poly Haven, CC0; see
 * public/models/CREDITS.md). A scanned mesh cannot be rigged into stems and
 * blades, so the motion is done where it can be done honestly, in the vertex
 * shader and a few springs:
 *
 *   - the foliage sways as a body, more toward the top and the outer leaves,
 *     with every vertex on its own phase so leaves do not move in lockstep;
 *   - the pointer is a finger: its ray is tested against a sample of the
 *     foliage, the first leaf cluster it meets is pressed and dragged, and
 *     when the finger lifts that cluster springs back past rest and settles;
 *   - brushing past, without touching, sets the whole plant swaying.
 */

export type PlantModelSpec = {
  url: string;
  /** model-space y where the foliage starts moving (the pot's rim) */
  baseY: number;
  /** how far the finger reaches into the foliage, and how wide the pressed cluster is (model units) */
  hitRadius: number;
  pokeRadius: number;
  /** how far a pressed leaf cluster travels (model units) */
  press: number;
};

type Uni = {
  uTime: { value: number };
  uH: { value: THREE.Vector2 };
  uAxis: { value: THREE.Vector2 };
  uRad: { value: number };
  uSway: { value: THREE.Vector2 };
  uFlut: { value: number };
  uPoke: { value: THREE.Vector4 };
  uPokeDir: { value: THREE.Vector3 };
  uPokeR: { value: number };
  uRustle: { value: number };
};

const FOLIAGE = /leaves|_plant$|stem/i;
const NOT_FOLIAGE = /pot$|dirt|pebbles|ground/i;

function patch(mat: THREE.MeshStandardMaterial, uni: Uni) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform vec2 uH;
         uniform vec2 uAxis;
         uniform float uRad;
         uniform vec2 uSway;
         uniform float uFlut;
         uniform vec4 uPoke;
         uniform vec3 uPokeDir;
         uniform float uPokeR;
         uniform float uRustle;`
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         {
           float hN = clamp((position.y - uH.x) / max(uH.y - uH.x, 1e-4), 0.0, 1.0);
           float radN = clamp(length(position.xz - uAxis) / uRad, 0.0, 1.0);
           float w = (0.2 + 0.8 * hN * hN) * (0.45 + 0.75 * radN);
           float ph = position.x * 9.0 + position.z * 7.0 + position.y * 5.0;
           float fl = sin(uTime * 1.7 + ph) * 0.5 + sin(uTime * 3.1 + ph * 1.7) * 0.5;
           transformed.xz += uSway * w + vec2(fl, fl * 0.7) * uFlut * w;
           transformed.y -= abs(fl) * uFlut * 0.35 * w;
           vec3 d = position - uPoke.xyz;
           float f = exp(-dot(d, d) / (uPokeR * uPokeR));
           transformed += uPokeDir * uPoke.w * f * (0.5 + 0.5 * hN);
           transformed += vec3(sin(uTime * 26.0 + ph * 3.0), cos(uTime * 31.0 + ph * 2.0), sin(uTime * 23.0 + ph))
                          * uRustle * f * uFlut * 2.5;
         }`
      );
  };
  mat.customProgramCacheKey = () => "plant-model";
}

export async function loadPlantModel(kit: Kit, spec: PlantModelSpec, seed = 1): Promise<Plant> {
  const gltf = await new GLTFLoader().loadAsync(spec.url);
  const holder = new THREE.Group();
  const root = gltf.scene;
  holder.add(root);
  root.updateMatrixWorld(true);

  // bake node transforms into the vertices: everything below is in model space
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    m.geometry.applyMatrix4(m.matrixWorld);
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    m.updateMatrix();
    kit.track(m.geometry);
  }

  const uni: Uni = {
    uTime: { value: 0 },
    uH: { value: new THREE.Vector2(spec.baseY, 1) },
    uAxis: { value: new THREE.Vector2(0, 0) },
    uRad: { value: 0.3 },
    uSway: { value: new THREE.Vector2() },
    uFlut: { value: 0.004 },
    uPoke: { value: new THREE.Vector4(0, -10, 0, 0) },
    uPokeDir: { value: new THREE.Vector3(0, 0, -1) },
    uPokeR: { value: spec.pokeRadius },
    uRustle: { value: 0 },
  };

  // foliage meshes: their own material copy, patched; a sample of their vertices for the finger
  const samples: number[] = [];
  let top = -Infinity;
  const box = new THREE.Box3();
  const foliage = meshes.filter((m) => FOLIAGE.test(m.name) && !NOT_FOLIAGE.test(m.name));
  for (const m of foliage) {
    box.expandByObject(m);
    top = Math.max(top, box.max.y);
  }
  const axis = new THREE.Vector3();
  box.getCenter(axis);
  for (const m of meshes) {
    const isFoliage = foliage.includes(m);
    const verts = m.geometry.attributes.position.count;
    m.castShadow = isFoliage ? verts < 30000 : !/pebbles|dirt|ground/i.test(m.name);
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat) => {
      const s = mat as THREE.MeshStandardMaterial;
      if (s.map) s.map.anisotropy = 8;
      if (s.alphaTest > 0) s.alphaToCoverage = true;
      s.envMapIntensity = 0.9;
      kit.track(s);
    });
    if (isFoliage) {
      const own = (mats[0] as THREE.MeshStandardMaterial).clone();
      patch(own, uni);
      kit.track(own);
      m.material = own;
      const p = m.geometry.attributes.position as THREE.BufferAttribute;
      const step = Math.max(1, Math.floor(p.count / 1800));
      for (let i = 0; i < p.count; i += step) samples.push(p.getX(i), p.getY(i), p.getZ(i));
    }
  }
  uni.uH.value.set(spec.baseY, Math.max(top, spec.baseY + 0.1));
  uni.uAxis.value.set(axis.x, axis.z);
  uni.uRad.value = Math.max(0.12, (box.max.x - box.min.x) * 0.5);
  const size = uni.uH.value.y - uni.uH.value.x;

  // ---- the finger and the springs ----
  const inv = new THREE.Matrix4();
  const invQ = new THREE.Quaternion();
  let scale = 1;
  let ray: { o: THREE.Vector3; d: THREE.Vector3 } | null = null;
  const vel = new THREE.Vector3();
  const poke = { a: 0, v: 0 };
  const sway = { x: 0, z: 0, vx: 0, vz: 0 };
  const point = new THREE.Vector3(0, -10, 0);
  const dir = new THREE.Vector3(0, 0, -1);
  let touching = false;
  let rustle = 0;
  let wasTouching = false;
  const ph = seed * 7.13;
  const _v = new THREE.Vector3();

  const refresh = () => {
    holder.updateMatrixWorld(true);
    inv.copy(holder.matrixWorld).invert();
    holder.getWorldQuaternion(invQ).invert();
    scale = holder.getWorldScale(_v).x;
  };

  const update = (t: number, dt: number) => {
    const h = Math.min(dt, 1 / 30);
    uni.uTime.value = t;
    const speed = vel.length();
    let hitT = Infinity;
    touching = false;

    if (ray) {
      const r2 = spec.hitRadius * spec.hitRadius;
      for (let i = 0; i < samples.length; i += 3) {
        _v.set(samples[i] - ray.o.x, samples[i + 1] - ray.o.y, samples[i + 2] - ray.o.z);
        const tt = _v.dot(ray.d);
        if (tt < 0 || tt >= hitT) continue;
        if (_v.lengthSq() - tt * tt < r2) {
          hitT = tt;
          point.set(samples[i], samples[i + 1], samples[i + 2]);
          touching = true;
        }
      }
      if (touching) {
        // pressed along the ray, dragged along the pointer's own motion
        dir.copy(ray.d).addScaledVector(vel, 0.9 / Math.max(0.4, speed + 0.4)).normalize();
        uni.uPoke.value.set(point.x, point.y, point.z, uni.uPoke.value.w);
        uni.uPokeDir.value.copy(dir);
      }
      // brushing, touching or not: a plant the pointer sweeps near sways with it
      _v.set(axis.x - ray.o.x, uni.uH.value.x + size * 0.5 - ray.o.y, axis.z - ray.o.z);
      const tt = Math.max(0, _v.dot(ray.d));
      const near = Math.sqrt(Math.max(0, _v.lengthSq() - tt * tt));
      const reach = uni.uRad.value * 1.3;
      if (near < reach && speed > 0.02) {
        const f = (1 - near / reach) * (touching ? 1 : 0.6);
        sway.vx += vel.x * f * 0.9 * size * h * 60;
        sway.vz += vel.z * f * 0.9 * size * h * 60;
      }
    }

    // the pressed cluster: a spring toward the press, so it overshoots when the finger lifts
    if (touching && !wasTouching) poke.v += spec.press * 9;
    wasTouching = touching;
    const target = touching ? spec.press * (0.65 + 0.35 * Math.min(1, speed * 1.5)) : 0;
    for (let s = 0; s < 2; s++) {
      const acc = -150 * (poke.a - target) - 6.5 * poke.v;
      poke.v += acc * (h / 2);
      poke.a += poke.v * (h / 2);
    }
    uni.uPoke.value.w = poke.a;

    // the whole plant: a soft spring with a slow breath of wind
    const wind = (Math.sin(t * 0.55 + ph) * 0.6 + Math.sin(t * 1.4 + ph * 2.1) * 0.4) * (0.7 + 0.3 * Math.sin(t * 0.17));
    const lim = size * 0.09;
    for (let s = 0; s < 2; s++) {
      sway.vx += (-48 * sway.x - 3.2 * sway.vx + wind * 0.4 * size) * (h / 2);
      sway.vz += (-48 * sway.z - 3.2 * sway.vz + wind * 0.25 * size) * (h / 2);
      sway.x = clamp(sway.x + sway.vx * (h / 2), -lim, lim);
      sway.z = clamp(sway.z + sway.vz * (h / 2), -lim, lim);
    }
    uni.uSway.value.set(sway.x, sway.z);
    rustle = clamp(rustle + (touching ? speed * 0.6 : 0) * h * 12 - h * 2.2);
    uni.uRustle.value = rustle;
    uni.uFlut.value = size * (0.0045 + 0.012 * rustle);
  };

  return {
    group: holder,
    refresh,
    touch(r, v) {
      if (!r) {
        ray = null;
        vel.set(0, 0, 0);
        return;
      }
      ray = {
        o: r.origin.clone().applyMatrix4(inv),
        d: r.dir.clone().transformDirection(inv).normalize(),
      };
      vel.copy(v).applyQuaternion(invQ).divideScalar(scale);
    },
    update,
    state: () => ({ touching, rustle }),
  };
}
