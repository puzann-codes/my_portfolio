import * as THREE from "three";

/**
 * A facade material for instanced boxes: ordinary PBR shading, plus a
 * procedural window grid on the vertical faces. Most windows are dark glass,
 * a share of them are lit (warm or cool, varying per building) and a few
 * breathe slowly, which is most of what makes a city look inhabited.
 * The grid is computed in world space, so there are no textures to load and
 * no UVs to author.
 */
export function facadeMaterial(opts: {
  cell?: [number, number];
  lit?: number;
  emit?: number;
  roughness?: number;
  metalness?: number;
}) {
  const cell = opts.cell ?? [1.35, 1.75];
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.12,
  });
  const uniforms = {
    uTime: { value: 0 },
    uCell: { value: new THREE.Vector2(cell[0], cell[1]) },
    uLit: { value: opts.lit ?? 0.42 },
    uEmit: { value: opts.emit ?? 2.2 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vWPos;
         varying vec3 vFace;
         varying vec2 vBld;`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         #ifdef USE_INSTANCING
           vec4 wp_ = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
           vBld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
         #else
           vec4 wp_ = modelMatrix * vec4(transformed, 1.0);
           vBld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
         #endif
         vWPos = wp_.xyz;
         vFace = normal;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform vec2 uCell;
         uniform float uLit;
         uniform float uEmit;
         varying vec3 vWPos;
         varying vec3 vFace;
         varying vec2 vBld;
         float h21(vec2 p) {
           p = fract(p * vec2(123.34, 456.21));
           p += dot(p, p + 45.32);
           return fract(p.x * p.y);
         }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         {
           float side = step(abs(vFace.y), 0.5);
           float u = abs(vFace.x) > 0.5 ? vWPos.z : vWPos.x;
           vec2 cellP = vec2(u / uCell.x, vWPos.y / uCell.y);
           vec2 id = floor(cellP);
           vec2 f = fract(cellP);
           float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.24, f.y) * step(f.y, 0.76);
           float b = h21(floor(vBld * 0.5));
           float r = h21(id * 1.37 + b * 31.0);
           float lit = step(1.0 - uLit * (0.35 + b * 0.9), r);
           float breathe = 0.82 + 0.18 * sin(uTime * 0.7 + r * 40.0) * step(0.9, h21(id + 5.0));
           vec3 warm = mix(vec3(1.0, 0.7, 0.38), vec3(0.72, 0.86, 1.0), step(0.8, h21(id + 3.1)));
           float ground = step(1.5, vWPos.y);
           totalEmissiveRadiance += warm * lit * win * side * ground * uEmit * breathe;
           diffuseColor.rgb *= mix(1.0, 0.38, win * side * (1.0 - lit));
         }`
      );
  };
  return { material: mat, uniforms };
}
