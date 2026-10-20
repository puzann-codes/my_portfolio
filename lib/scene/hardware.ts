import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, clamp, makeCanvas, smoothstep } from "./util";
import type { Kit } from "./props";

/**
 * The hardware on the desk: a laptop, a mechanical keyboard, a mouse, a stand
 * and a lamp. Each is built the way the real object is made rather than as a
 * box with a colour: a rounded-plan aluminium body with a bevelled edge, keycaps
 * with a sculpted, dished top and printed legends, a shell that rolls over at
 * its edges. The expensive parts are instanced (one draw call for every key)
 * and the legends come from one small atlas per keyboard.
 */

/* ============================ shapes ============================== */

/** Rounded rectangle in the XY plane, centred. */
function rrShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * A slab with a rounded plan and a filleted edge, lying flat: centred in x
 * and z, spanning y = 0 … h. The outer dimensions are exact.
 */
export function slab(w: number, d: number, h: number, r: number, bevel = 0.0012, segs = 3) {
  const b = Math.min(bevel, h / 2 - 1e-5);
  const geo = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(r - b, 0.0005)), {
    depth: Math.max(h - 2 * b, 1e-4),
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: segs,
    curveSegments: 8,
  });
  geo.translate(0, 0, b);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A flat rounded rectangle in the XZ plane facing up. */
function flatRR(w: number, d: number, r: number) {
  const g = new THREE.ShapeGeometry(rrShape(w, d, r), 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

type Ring = { x: number; y: number; z: number; u?: number; v?: number }[];

/**
 * Skins a list of rings (all with the same vertex count) into one indexed
 * surface. The winding is checked and corrected so normals point outward.
 */
function loft(rings: Ring[], cap: "none" | "top" = "none") {
  const n = rings[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (const r of rings) {
    for (const p of r) {
      pos.push(p.x, p.y, p.z);
      uv.push(p.u ?? 0, p.v ?? 0);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (cap === "top") {
    const last = rings[rings.length - 1];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of last) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const ci = pos.length / 3;
    pos.push(cx / n, cy / n, cz / n);
    uv.push(last[0].u ?? 0, last[0].v ?? 0);
    const base = (rings.length - 1) * n;
    for (let j = 0; j < n; j++) idx.push(base + j, ci, base + ((j + 1) % n));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // outward check: the first ring's normals should point away from the axis
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  let cx = 0;
  let cz = 0;
  for (const p of rings[0]) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  let s = 0;
  for (let j = 0; j < n; j++) {
    const p = rings[0][j];
    s += nrm.getX(j) * (p.x - cx) + nrm.getZ(j) * (p.z - cz);
  }
  if (s < 0) {
    const flipped = geo.index!.array as Uint32Array | Uint16Array;
    for (let i = 0; i < flipped.length; i += 3) {
      const t = flipped[i + 1];
      flipped[i + 1] = flipped[i + 2];
      flipped[i + 2] = t;
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/** Points around a rounded rectangle in XZ, `seg` per corner. */
function rrPoints(hw: number, hd: number, r: [number, number, number, number], seg: number) {
  const out: [number, number][] = [];
  const corners: [number, number, number, number][] = [
    [-hw + r[0], -hd + r[0], Math.PI, r[0]],
    [hw - r[1], -hd + r[1], Math.PI * 1.5, r[1]],
    [hw - r[2], hd - r[2], 0, r[2]],
    [-hw + r[3], hd - r[3], Math.PI * 0.5, r[3]],
  ];
  for (const [cx, cz, a0, rad] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push([cx + rad * Math.cos(a), cz + rad * Math.sin(a)]);
    }
  }
  return out;
}

/* ============================ legends ============================= */

export const KEY_UNIT = 0.019;

export type KeyDef = {
  code: string;
  /** left edge and width, in key units */
  x: number;
  w: number;
  row: number;
  /** modifier / function keys take the secondary colour */
  mod?: boolean;
  /** height as a fraction of a row, and offset in rows (for half-height arrows) */
  hf?: number;
  dz?: number;
};

const SYM: Record<string, [string, string]> = {
  Backquote: ["~", "`"],
  Digit1: ["!", "1"],
  Digit2: ["@", "2"],
  Digit3: ["#", "3"],
  Digit4: ["$", "4"],
  Digit5: ["%", "5"],
  Digit6: ["^", "6"],
  Digit7: ["&", "7"],
  Digit8: ["*", "8"],
  Digit9: ["(", "9"],
  Digit0: [")", "0"],
  Minus: ["_", "-"],
  Equal: ["+", "="],
  BracketLeft: ["{", "["],
  BracketRight: ["}", "]"],
  Backslash: ["|", "\\"],
  Semicolon: [":", ";"],
  Quote: ['"', "'"],
  Comma: ["<", ","],
  Period: [">", "."],
  Slash: ["?", "/"],
};
const WORD: Record<string, string> = {
  Escape: "esc",
  Delete: "del",
  Backspace: "delete",
  PageUp: "pg up",
  PageDown: "pg dn",
  Home: "home",
  End: "end",
  Tab: "tab",
  CapsLock: "caps",
  Enter: "return",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "ctrl",
  ControlRight: "ctrl",
  MetaLeft: "cmd",
  MetaRight: "cmd",
  AltLeft: "opt",
  AltRight: "opt",
  Fn: "fn",
  TouchId: "",
};

/**
 * One atlas for a whole keyboard: each key owns a cell as wide as the key. The
 * legend is dark on white (multiplied into the keycap colour) unless `invert`
 * is set, in which case it is white on black (used as an emissive map, for
 * backlit legends on black keys).
 */
export function legendAtlas(keys: KeyDef[], cell: number, invert: boolean, sans: string) {
  const cols = Math.max(...keys.map((k) => k.x + k.w));
  const rows = Math.max(...keys.map((k) => k.row)) + 1;
  const W = Math.ceil(cols * cell);
  const H = rows * cell;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = invert ? "#000" : "#fff";
  ctx.fillRect(0, 0, W, H);
  const ink = invert ? "#ffffff" : "#1c2431";
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rect = new Map<string, [number, number, number, number]>();
  for (const k of keys) {
    const x = k.x * cell;
    const y = k.row * cell;
    const w = k.w * cell;
    const cx = x + w / 2;
    const cy = y + cell / 2;
    // atlas rect in UV space (v measured from the bottom of the canvas)
    rect.set(k.code, [x / W, 1 - (y + cell) / H, w / W, cell / H]);
    const sym = SYM[k.code];
    const word = WORD[k.code];
    ctx.fillStyle = ink;
    if (/^Key[A-Z]$/.test(k.code)) {
      ctx.font = `700 ${cell * 0.42}px ${sans}`;
      ctx.fillText(k.code.slice(3), cx, cy + cell * 0.02);
    } else if (sym) {
      ctx.font = `700 ${cell * 0.28}px ${sans}`;
      if (/^Digit/.test(k.code) || ["Backquote", "Minus", "Equal"].includes(k.code)) {
        ctx.fillText(sym[0], cx, cy - cell * 0.16);
        ctx.fillText(sym[1], cx, cy + cell * 0.14);
      } else {
        ctx.fillText(sym[0], cx, cy - cell * 0.15);
        ctx.fillText(sym[1], cx, cy + cell * 0.14);
      }
    } else if (/^F\d+$/.test(k.code)) {
      ctx.font = `600 ${cell * 0.26}px ${sans}`;
      ctx.fillText(k.code, cx, cy);
    } else if (k.code.startsWith("Arrow")) {
      const s = cell * 0.17;
      ctx.beginPath();
      if (k.code === "ArrowUp") {
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.7);
        ctx.lineTo(cx - s, cy + s * 0.7);
      } else if (k.code === "ArrowDown") {
        ctx.moveTo(cx, cy + s);
        ctx.lineTo(cx + s, cy - s * 0.7);
        ctx.lineTo(cx - s, cy - s * 0.7);
      } else if (k.code === "ArrowLeft") {
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx + s * 0.7, cy - s);
        ctx.lineTo(cx + s * 0.7, cy + s);
      } else {
        ctx.moveTo(cx + s, cy);
        ctx.lineTo(cx - s * 0.7, cy - s);
        ctx.lineTo(cx - s * 0.7, cy + s);
      }
      ctx.closePath();
      ctx.fill();
    } else if (word) {
      ctx.font = `700 ${cell * 0.23}px ${sans}`;
      if (k.w >= 1.4) {
        ctx.textAlign = k.code.endsWith("Right") || k.code === "Enter" || k.code === "Backspace" ? "right" : "left";
        const px = ctx.textAlign === "right" ? x + w - cell * 0.2 : x + cell * 0.2;
        ctx.fillText(word, px, y + cell * 0.74);
        ctx.textAlign = "center";
      } else {
        ctx.fillText(word, cx, cy + cell * 0.2);
      }
    }
  }
  const tex = canvasTexture(c, 8);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rect, width: W, height: H };
}

/**
 * Per-instance atlas cell: the keycap's top-face UVs (0..1) are remapped into
 * that key's cell, in the vertex shader. The sides carry UV (0,0), which lands
 * on the cell's blank corner.
 */
function patchLegends(mat: THREE.MeshStandardMaterial, variant: string) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aCell;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = aCell.xy + vMapUv * aCell.zw;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = aCell.xy + vEmissiveMapUv * aCell.zw;
        #endif`
      );
  };
  mat.customProgramCacheKey = () => `legend-${variant}`;
}

/* =========================== keycap shape ========================= */

/**
 * A keycap: a squared-off, slightly tapered cap with a rolled top edge and a
 * cylindrical scoop. `size` is the footprint of a 1u key, `height` the top
 * rim above the base. The top face carries UVs 0..1 for the legend.
 */
export function keycapGeometry(size: number, height: number, dish: number, seg: number) {
  const S = size;
  const H = height;
  const rimHalf = (S * 0.745) / 2;
  const rows: { s: number; y: number | null; r: number }[] = [
    { s: 1.0, y: 0, r: 0.17 },
    { s: 0.975, y: H * 0.42, r: 0.17 },
    { s: 0.82, y: H * 0.78, r: 0.2 },
    { s: 0.745, y: null, r: 0.24 }, // rim: height follows the scoop
    { s: 0.6, y: null, r: 0.3 },
    { s: 0.42, y: null, r: 0.4 },
    { s: 0.22, y: null, r: 0.55 },
    { s: 0.05, y: null, r: 0.9 },
  ];
  const rings: Ring[] = rows.map((row, ri) => {
    const half = (S * row.s) / 2;
    const rad = Math.min(S * row.r * row.s, half * 0.98);
    const pts = rrPoints(half, half, [rad, rad, rad, rad], seg);
    return pts.map(([x, z]) => {
      const y = row.y !== null ? row.y : H - dish * (1 - Math.pow(Math.min(1, Math.abs(x) / rimHalf), 2));
      const top = ri >= 3;
      return { x, y, z, u: top ? 0.5 + x / (2 * rimHalf) : 0, v: top ? 0.5 - z / (2 * rimHalf) : 0 };
    });
  });
  // crisp where the cap turns a corner, smooth across the scoop
  return toCreasedNormals(loft(rings, "top"), 0.62);
}

/* ============================ keyboard ============================ */

export function keyLayout(): KeyDef[] {
  const R: [string, number, boolean?][][] = [
    [
      ["Escape", 1, true],
      ...Array.from({ length: 12 }, (_, i): [string, number] => [`F${i + 1}`, 1]),
      ["Delete", 1, true],
    ],
    [
      ["Backquote", 1],
      ...Array.from({ length: 9 }, (_, i): [string, number] => [`Digit${i + 1}`, 1]),
      ["Digit0", 1],
      ["Minus", 1],
      ["Equal", 1],
      ["Backspace", 2, true],
      ["PageUp", 1, true],
    ],
    [
      ["Tab", 1.5, true],
      ...[..."QWERTYUIOP"].map((c): [string, number] => [`Key${c}`, 1]),
      ["BracketLeft", 1],
      ["BracketRight", 1],
      ["Backslash", 1.5],
      ["PageDown", 1, true],
    ],
    [
      ["CapsLock", 1.75, true],
      ...[..."ASDFGHJKL"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Semicolon", 1],
      ["Quote", 1],
      ["Enter", 2.25, true],
      ["Home", 1, true],
    ],
    [
      ["ShiftLeft", 2.25, true],
      ...[..."ZXCVBNM"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Comma", 1],
      ["Period", 1],
      ["Slash", 1],
      ["ShiftRight", 1.75, true],
      ["ArrowUp", 1, true],
      ["End", 1, true],
    ],
    [
      ["ControlLeft", 1.25, true],
      ["MetaLeft", 1.25, true],
      ["AltLeft", 1.25, true],
      ["Space", 6.25],
      ["AltRight", 1, true],
      ["Fn", 1, true],
      ["ControlRight", 1, true],
      ["ArrowLeft", 1, true],
      ["ArrowDown", 1, true],
      ["ArrowRight", 1, true],
    ],
  ];
  const out: KeyDef[] = [];
  R.forEach((row, r) => {
    let x = 0;
    for (const [code, w, mod] of row) {
      out.push({ code, x, w, row: r, mod: !!mod });
      x += w;
    }
  });
  return out;
}

export type Keyboard = ReturnType<typeof buildKeyboard>;

/**
 * A 75% mechanical keyboard in a pale-blue shell: a wedge-shaped case with a
 * lower band, a plate with switch housings showing between sculpted keycaps,
 * a knurled aluminium knob and a small display. Positioned with its footprint
 * centred on the origin and its base on y = 0.
 */
export function buildKeyboard(kit: Kit, sans: string, mono: string) {
  const U = KEY_UNIT;
  const KBW = 0.338;
  const KBD = 0.142;
  const H = 0.026;
  const HF = 0.014;
  const g = new THREE.Group();

  // case: rounded plan, filleted, squashed into a wedge, banded by vertex colour
  let caseGeo: THREE.BufferGeometry = slab(KBW, KBD, H, 0.0085, 0.0028, 3);
  {
    const p = caseGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const upper = new THREE.Color(0xf4f6f8);
    const lower = new THREE.Color(0xe0e5ea);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = clamp((-z + KBD / 2) / KBD);
      c.copy(lower).lerp(upper, smoothstep(0.3 * H, 0.34 * H, y));
      col.set([c.r, c.g, c.b], i * 3);
      p.setY(i, y * (HF / H + (1 - HF / H) * t));
    }
    caseGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    caseGeo.deleteAttribute("normal");
    caseGeo = toCreasedNormals(caseGeo, 0.7);
  }
  const caseMat = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
    })
  );
  const caseMesh = kit.mesh(caseGeo, caseMat);
  g.add(caseMesh);

  const alpha = Math.atan((H - HF) / KBD);
  const topY = (H + HF) / 2;
  const deck = new THREE.Group();
  deck.position.set(0, topY, 0);
  deck.rotation.x = alpha;
  g.add(deck);

  // the well: a dark surround, then the plate with a faint icy backlight
  const surround = kit.mesh(flatRR(KBW - 0.011, KBD - 0.01, 0.006), kit.track(new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.5 })), false, true);
  surround.position.y = 0.0002;
  deck.add(surround);
  const plateMat = kit.track(
    // the plate is lit: cool white light leaking up between the caps, like an RGB board set to white
    new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.5, emissive: 0xdbe8ff, emissiveIntensity: 0.55 })
  );
  const plate = kit.mesh(flatRR(KBW - 0.016, KBD - 0.015, 0.0045), plateMat, false, true);
  plate.position.y = 0.0005;
  deck.add(plate);

  // key geometry, atlas and instances
  const layout = keyLayout();
  const S = 0.0172;
  const capGeo = kit.track(keycapGeometry(S, 0.0082, 0.0016, 3));
  const atlas = legendAtlas(layout, 96, false, sans);
  kit.track(atlas.tex);
  const capMat = kit.track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlas.tex, roughness: 0.52, metalness: 0 })
  );
  patchLegends(capMat, "aula");
  const cells = new Float32Array(layout.length * 4);
  layout.forEach((k, i) => cells.set(atlas.rect.get(k.code) ?? [0, 0, 0.01, 0.01], i * 4));
  const capGeoI = capGeo.clone();
  capGeoI.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 4));
  const keyMesh = new THREE.InstancedMesh(capGeoI, capMat, layout.length);
  keyMesh.castShadow = true;
  keyMesh.receiveShadow = true;
  deck.add(keyMesh);
  kit.track(capGeoI);

  const housingGeo = kit.track(new RoundedBoxGeometry(0.0148, 0.0046, 0.0148, 1, 0.0012));
  const housings = new THREE.InstancedMesh(
    housingGeo,
    kit.track(new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.5, emissive: 0xc9dcff, emissiveIntensity: 0.22 })),
    layout.length
  );
  deck.add(housings);

  const left = -(16 * U) / 2;
  const rowZ = (r: number) => (r - 2.5) * U;
  const baseY = 0.0048;
  const rowTilt = [0.14, 0.1, 0.05, 0, -0.04, -0.07];
  const rowScaleY = [0.94, 0.98, 1, 1, 1.02, 1.04];
  const press = new Float32Array(layout.length);
  const target = new Float32Array(layout.length);
  const baseColor: THREE.Color[] = [];
  const cA = new THREE.Color(0xe6eaee);
  const cB = new THREE.Color(0xa5c4e6);
  const cC = new THREE.Color(0x7ca6d2);
  const pressTint = new THREE.Color(0x8fb8f0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const index = new Map<string, number>();
  layout.forEach((k, i) => {
    index.set(k.code, i);
    const col = k.code === "Escape" || k.code === "Enter" ? cC : k.mod ? cB : cA;
    baseColor.push(col.clone());
    keyMesh.setColorAt(i, col);
    // the housing under it (one per key; wide keys sit on theirs, centred)
    m4.makeTranslation(left + (k.x + k.w / 2) * U, 0.0005 + 0.0023, rowZ(k.row));
    housings.setMatrixAt(i, m4);
  });
  const writeKey = (i: number) => {
    const k = layout[i];
    pos.set(left + (k.x + k.w / 2) * U, baseY - press[i] * 0.0022, rowZ(k.row));
    q.setFromEuler(e.set(rowTilt[k.row], 0, 0));
    sc.set((k.w * U - 0.0018) / S, rowScaleY[k.row], 1);
    m4.compose(pos, q, sc);
    keyMesh.setMatrixAt(i, m4);
  };
  layout.forEach((_, i) => writeKey(i));

  // knob + display, in the two units to the right of the function row
  const knobX = left + 15.5 * U;
  const knobZ = rowZ(0);
  const kg = new THREE.CylinderGeometry(0.0092, 0.0096, 0.011, 72, 1, true);
  {
    const p = kg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.035 * Math.pow(Math.abs(Math.sin(a * 24)), 0.6);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    kg.computeVertexNormals();
  }
  const knobMat = kit.track(
    new THREE.MeshStandardMaterial({ color: 0xbfc4cc, metalness: 1, roughness: 0.3 })
  );
  const knob = kit.mesh(kg, knobMat);
  knob.position.set(knobX, 0.0005 + 0.0055, knobZ);
  deck.add(knob);
  const topC = makeCanvas(256, 256);
  {
    const x = topC.getContext("2d")!;
    const gr = x.createRadialGradient(128, 128, 4, 128, 128, 128);
    gr.addColorStop(0, "#e9edf2");
    gr.addColorStop(1, "#b9bfc8");
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(60,66,78,0.28)";
    for (let r = 6; r < 126; r += 3) {
      x.lineWidth = 1;
      x.beginPath();
      x.arc(128, 128, r, 0, Math.PI * 2);
      x.stroke();
    }
    x.fillStyle = "rgba(40,46,58,0.8)";
    x.beginPath();
    x.arc(128, 38, 7, 0, Math.PI * 2);
    x.fill();
  }
  const knobTop = new THREE.Mesh(
    kit.track(new THREE.CircleGeometry(0.0089, 48)),
    kit.track(new THREE.MeshStandardMaterial({ map: kit.track(canvasTexture(topC, 4)), metalness: 0.9, roughness: 0.34 }))
  );
  knobTop.rotation.x = -Math.PI / 2;
  knobTop.position.set(knobX, 0.0005 + 0.0111, knobZ);
  deck.add(knobTop);

  const dispC = makeCanvas(256, 160);
  {
    const x = dispC.getContext("2d")!;
    x.fillStyle = "#04070b";
    x.fillRect(0, 0, 256, 160);
    x.fillStyle = "#cfe3ff";
    x.font = `700 70px ${mono}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("PB", 128, 66);
    x.fillStyle = "rgba(111,155,203,0.9)";
    x.fillRect(48, 118, 160, 5);
    x.fillStyle = "rgba(111,155,203,0.35)";
    x.fillRect(48, 118, 160, 5);
    x.fillStyle = "#6f9bcb";
    x.fillRect(48, 118, 96, 5);
  }
  const bezel = kit.mesh(
    flatRR(0.0172, 0.0124, 0.0014),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x06080b, roughness: 0.25 })),
    false,
    false
  );
  bezel.position.set(left + 14.5 * U, 0.0007, knobZ);
  deck.add(bezel);
  const disp = new THREE.Mesh(
    kit.track(new THREE.PlaneGeometry(0.0152, 0.0095)),
    kit.track(new THREE.MeshBasicMaterial({ map: kit.track(canvasTexture(dispC, 4)), toneMapped: false }))
  );
  disp.rotation.x = -Math.PI / 2;
  disp.position.set(left + 14.5 * U, 0.00085, knobZ);
  deck.add(disp);

  // rubber feet at the back are hidden; a short cable port is not
  const port = kit.mesh(
    new RoundedBoxGeometry(0.011, 0.0046, 0.003, 1, 0.0012),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.5 })),
    false,
    false
  );
  port.position.set(0, 0.0115, -KBD / 2 - 0.0002);
  g.add(port);

  // underglow: a soft pool of the same white on the desk under the case
  const glowC = makeCanvas(256, 128);
  {
    const x = glowC.getContext("2d")!;
    x.fillStyle = "rgba(0,0,0,1)";
    x.fillRect(0, 0, 256, 128);
    x.shadowColor = "rgba(210,228,255,1)";
    x.shadowBlur = 26;
    x.fillStyle = "rgba(210,228,255,0.9)";
    x.beginPath();
    x.roundRect(46, 30, 164, 68, 10);
    x.fill();
  }
  const glow = new THREE.Mesh(
    kit.track(new THREE.PlaneGeometry(KBW + 0.1, (KBW + 0.1) / 2)),
    kit.track(
      new THREE.MeshBasicMaterial({
        map: kit.track(canvasTexture(glowC, 2)),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.32,
        toneMapped: false,
      })
    )
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.0006;
  glow.renderOrder = 2;
  g.add(glow);

  const press01 = (code: string, down: boolean) => {
    const i = index.get(code);
    if (i !== undefined) target[i] = down ? 1 : 0;
  };

  return {
    group: g,
    deck,
    caseMat,
    keyMesh,
    layout,
    left,
    rowZ,
    width: KBW,
    depth: KBD,
    topY,
    knobPos: new THREE.Vector3(knobX, 0, knobZ),
    /** one boolean per key code, from the choreography and the visitor */
    setTargets(isDown: (code: string) => boolean) {
      layout.forEach((k, i) => {
        target[i] = isDown(k.code) ? 1 : 0;
      });
    },
    press: press01,
    /** tint the keys under a travelling highlight; centre in key units, <0 off */
    wave(center: number, tint: THREE.Color) {
      layout.forEach((k, i) => {
        const kx = k.x + k.w / 2;
        const I = center < 0 ? 0 : Math.exp(-Math.pow((kx - center) / 1.5, 2));
        keyMesh.setColorAt(i, baseColor[i].clone().lerp(tint, I * 0.6));
      });
      if (keyMesh.instanceColor) keyMesh.instanceColor.needsUpdate = true;
    },
    /** springs the keys; returns true if anything moved */
    update(dt: number) {
      let moved = false;
      let colorDirty = false;
      for (let i = 0; i < press.length; i++) {
        if (press[i] !== target[i]) {
          press[i] += (target[i] - press[i]) * Math.min(1, dt * 26);
          if (Math.abs(press[i] - target[i]) < 0.01) press[i] = target[i];
          writeKey(i);
          // a pressed key takes the light: it tints toward cool blue as it goes down
          keyMesh.setColorAt(i, baseColor[i].clone().lerp(pressTint, press[i] * 0.85));
          colorDirty = true;
          moved = true;
        }
      }
      if (moved) keyMesh.instanceMatrix.needsUpdate = true;
      if (colorDirty && keyMesh.instanceColor) keyMesh.instanceColor.needsUpdate = true;
      return moved;
    },
    dispose() {
      keyMesh.dispose();
      housings.dispose();
    },
  };
}

/* ============================== laptop ============================ */

/** A MacBook-style layout in key units; row 0 is the shallow function row. */
function laptopKeys(): { keys: KeyDef[]; widthU: number } {
  const rows: [string, number][][] = [
    [["Escape", 1.5], ...Array.from({ length: 12 }, (_, i): [string, number] => [`F${i + 1}`, 1]), ["TouchId", 1]],
    [
      ["Backquote", 1],
      ...Array.from({ length: 9 }, (_, i): [string, number] => [`Digit${i + 1}`, 1]),
      ["Digit0", 1],
      ["Minus", 1],
      ["Equal", 1],
      ["Backspace", 1.5],
    ],
    [
      ["Tab", 1.5],
      ...[..."QWERTYUIOP"].map((c): [string, number] => [`Key${c}`, 1]),
      ["BracketLeft", 1],
      ["BracketRight", 1],
      ["Backslash", 1],
    ],
    [
      ["CapsLock", 1.75],
      ...[..."ASDFGHJKL"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Semicolon", 1],
      ["Quote", 1],
      ["Enter", 1.75],
    ],
    [
      ["ShiftLeft", 2.25],
      ...[..."ZXCVBNM"].map((c): [string, number] => [`Key${c}`, 1]),
      ["Comma", 1],
      ["Period", 1],
      ["Slash", 1],
      ["ShiftRight", 2.25],
    ],
    [
      ["Fn", 1],
      ["ControlLeft", 1],
      ["AltLeft", 1],
      ["MetaLeft", 1.25],
      ["Space", 5],
      ["MetaRight", 1.25],
      ["AltRight", 1],
    ],
  ];
  const keys: KeyDef[] = [];
  rows.forEach((row, r) => {
    let x = 0;
    for (const [code, w] of row) {
      keys.push({ code, x, w, row: r });
      x += w;
    }
  });
  // arrow cluster: left, a stacked up/down, right (half-height keys)
  const x0 = 11.5;
  keys.push({ code: "ArrowLeft", x: x0, w: 1, row: 5, hf: 0.5, dz: 0.25 });
  keys.push({ code: "ArrowUp", x: x0 + 1, w: 1, row: 5, hf: 0.5, dz: -0.25 });
  keys.push({ code: "ArrowDown", x: x0 + 1, w: 1, row: 5, hf: 0.5, dz: 0.25 });
  keys.push({ code: "ArrowRight", x: x0 + 2, w: 1, row: 5, hf: 0.5, dz: 0.25 });
  return { keys, widthU: 14.5 };
}

function perforationTexture() {
  const c = makeCanvas(128, 512);
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, 128, 512);
  x.fillStyle = "#15171b";
  for (let j = 0; j < 40; j++) {
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.arc(14 + i * 20 + (j % 2) * 10, 8 + j * 12.5, 3.2, 0, Math.PI * 2);
      x.fill();
    }
  }
  return canvasTexture(c, 8);
}

/**
 * A 13-inch aluminium laptop. Origin at the middle of the underside of the
 * base, +z toward the typist. The lid pivots on `lidPivot`; `screen` is the
 * display plane, parented to it.
 */
export function buildLaptop(kit: Kit, screenTex: THREE.Texture, sans: string) {
  const LW = 0.304;
  const LD = 0.215;
  const LH = 0.0113;
  const g = new THREE.Group();

  const alu = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: 0x686b73,
      metalness: 1,
      roughness: 0.34,
      anisotropy: 0.5,
      anisotropyRotation: Math.PI / 2,
    })
  );
  const black = kit.track(new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.7 }));

  // base: a rounded plan, filleted edge
  const base = kit.mesh(slab(LW, LD, LH, 0.012, 0.0016, 3), alu);
  g.add(base);

  // the key well and the keys
  const P = 0.0187;
  const { keys, widthU } = laptopKeys();
  const wellW = widthU * P + 0.0035;
  const wellD = 0.1065;
  const wellZ = -LD / 2 + 0.012 + wellD / 2;
  const well = kit.mesh(flatRR(wellW, wellD, 0.0035), black, false, true);
  well.position.set(0, LH + 0.0001, wellZ);
  g.add(well);

  const atlas = legendAtlas(keys, 64, true, sans);
  kit.track(atlas.tex);
  const keyGeo = kit.track(keycapGeometry(0.0165, 0.0022, 0.0004, 2)).clone();
  const cells = new Float32Array(keys.length * 4);
  keys.forEach((k, i) => cells.set(atlas.rect.get(k.code) ?? [0, 0, 0.01, 0.01], i * 4));
  keyGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 4));
  kit.track(keyGeo);
  const keyMat = kit.track(
    new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.55,
      emissive: 0xffffff,
      emissiveMap: atlas.tex,
      emissiveIntensity: 0.55,
    })
  );
  patchLegends(keyMat, "laptop");
  const rowDepth = [0.0112, 0.0165, 0.0165, 0.0165, 0.0165, 0.0165];
  const rowGap = 0.0022;
  const rowCenter: number[] = [];
  {
    let z = wellZ - wellD / 2 + 0.0035;
    rowDepth.forEach((d, r) => {
      rowCenter[r] = z + d / 2;
      z += d + rowGap;
    });
  }
  const keyMesh = new THREE.InstancedMesh(keyGeo, keyMat, keys.length);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const qI = new THREE.Quaternion();
  const x0 = -(widthU * P) / 2;
  keys.forEach((k, i) => {
    const d = rowDepth[k.row] * (k.hf ?? 1);
    pos.set(x0 + (k.x + k.w / 2) * P, LH + 0.0004, rowCenter[k.row] + (k.dz ?? 0) * rowDepth[k.row]);
    sc.set((k.w * P - 0.0022) / 0.0165, 1, d / 0.0165);
    m4.compose(pos, qI, sc);
    keyMesh.setMatrixAt(i, m4);
  });
  keyMesh.castShadow = false;
  keyMesh.receiveShadow = true;
  g.add(keyMesh);

  // speaker grilles either side of the keys
  const perf = kit.track(perforationTexture());
  const grilleMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x777a82, map: perf, metalness: 1, roughness: 0.4 }));
  for (const s of [-1, 1]) {
    const gr = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(0.0075, wellD * 0.96)), grilleMat);
    gr.rotation.x = -Math.PI / 2;
    gr.position.set(s * (wellW / 2 + 0.0075), LH + 0.00012, wellZ);
    g.add(gr);
  }

  // trackpad: a recessed groove and a slightly glossier glass pad
  const padZ = wellZ + wellD / 2 + 0.0175 + 0.0745 / 2 - 0.0035;
  const groove = kit.mesh(flatRR(0.1215, 0.0775, 0.004), black, false, true);
  groove.position.set(0, LH + 0.00008, padZ);
  g.add(groove);
  const padMat = kit.track(
    new THREE.MeshPhysicalMaterial({ color: 0x70737b, metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 })
  );
  const pad = kit.mesh(flatRR(0.118, 0.0745, 0.0035), padMat, false, true);
  pad.position.set(0, LH + 0.00016, padZ);
  g.add(pad);

  // ports on the left edge, a headphone socket on the right
  for (const z of [-0.012, 0.018]) {
    const p = kit.mesh(new RoundedBoxGeometry(0.0016, 0.0027, 0.0085, 1, 0.0009), black, false, false);
    p.position.set(-LW / 2 + 0.0002, LH * 0.48, z);
    g.add(p);
  }
  const jack = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(0.0014, 0.0014, 0.002, 12)), black);
  jack.rotation.z = Math.PI / 2;
  jack.position.set(LW / 2 - 0.0002, LH * 0.48, 0.0);
  g.add(jack);

  // ---------- lid ----------
  const lidD = LD - 0.004;
  const lidT = 0.0034;
  const pivot = new THREE.Group();
  pivot.position.set(0, LH + 0.0022, -LD / 2 + 0.006);
  g.add(pivot);
  const lidGeo = slab(LW, lidD, lidT, 0.012, 0.0013, 3);
  // stand it up: the slab lies in XZ with thickness in y; the lid needs height in y, thickness in -z
  lidGeo.rotateX(-Math.PI / 2);
  lidGeo.translate(0, lidD / 2, 0);
  const lid = kit.mesh(lidGeo, alu);
  pivot.add(lid);

  // a polished disc on the back of the lid, where a mark would be
  const mark = new THREE.Mesh(
    kit.track(new THREE.CircleGeometry(0.0105, 40)),
    kit.track(new THREE.MeshStandardMaterial({ color: 0xd9dce2, metalness: 1, roughness: 0.12 }))
  );
  mark.rotation.y = Math.PI;
  mark.position.set(0, lidD * 0.56, -lidT - 0.0001);
  pivot.add(mark);

  // glass: edge-to-edge black, then the display and a faint reflection over it
  const glassH = lidD - 0.005;
  const glass = new THREE.Mesh(
    kit.track(new THREE.ShapeGeometry(rrShape(LW - 0.004, glassH, 0.009), 6)),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.18, metalness: 0.2 }))
  );
  glass.position.set(0, lidD / 2, 0.0002);
  pivot.add(glass);

  const SW = 0.29;
  const SH = SW / 1.537;
  const SCR_Y = lidD / 2 - 0.0016;
  const screenMat = kit.track(new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  const screen = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(SW, SH)), screenMat);
  screen.position.set(0, SCR_Y, 0.0005);
  pivot.add(screen);

  // a faint reflection of the room in the glass: unlit, so the screen's own glow light
  // never produces a hotspot on it. The environment is supplied after construction.
  const sheenMat = kit.track(
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      combine: THREE.AddOperation,
      reflectivity: 0.16,
    })
  );
  const sheen = new THREE.Mesh(kit.track(new THREE.PlaneGeometry(LW - 0.004, glassH)), sheenMat);
  sheen.position.set(0, lidD / 2, 0.0009);
  pivot.add(sheen);

  const hinge = kit.mesh(
    new THREE.CylinderGeometry(0.0034, 0.0034, LW * 0.8, 24),
    kit.track(new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.5, metalness: 0.5 })),
    false,
    false
  );
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, -0.0005, 0);
  pivot.add(hinge);

  const glow = new THREE.PointLight(0xdfe8ff, 0, 0.9, 2);
  glow.position.set(0, lidD / 2, 0.08);
  pivot.add(glow);

  const OPEN = -0.27;
  const CLOSED = Math.PI / 2;
  let value = 1;
  const setLid = (v: number) => {
    value = clamp(v);
    pivot.rotation.x = THREE.MathUtils.lerp(CLOSED, OPEN, value);
    screenMat.color.setScalar(clamp(value * 3));
    glow.intensity = 0.35 * clamp(value * 2 - 1);
  };
  setLid(1);

  return {
    group: g,
    pivot,
    screen,
    screenMat,
    sheenMat,
    glow,
    setLid,
    get lid() {
      return value;
    },
    width: LW,
    depth: LD,
    thickness: LH,
    SW,
    SH,
    SCR_Y,
  };
}

/* =============================== mouse ============================ */

function honeycombTexture(W: number, L: number) {
  const w = 512;
  const h = Math.round((w * L) / W);
  const c = makeCanvas(w, h);
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = "destination-out";
  const R = 17; // hex circumradius, px
  const dx = R * Math.sqrt(3);
  const dy = R * 1.5;
  for (let row = -1; row * dy < h + R; row++) {
    for (let col = -1; col * dx < w + R; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      // only inside the shell's field: a solid rim all round, and a solid bridge for the buttons' split
      const u = (cx / w - 0.5) / 0.4;
      const v = (cy / h - 0.5) / 0.455;
      if (Math.pow(Math.abs(u), 2.6) + Math.pow(Math.abs(v), 2.6) > 1) continue;
      if (Math.abs(cx / w - 0.5) < 0.012 && cy / h < 0.36) continue;
      x.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = cx + Math.cos(a) * (R - 3.2);
        const py = cy + Math.sin(a) * (R - 3.2);
        if (k === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.fill();
    }
  }
  const t = canvasTexture(c, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A lightweight honeycomb mouse in the manner of the Gravastar Mercury: a
 * white shell cut through with hexagons, the whole of it lit from inside by a
 * cool white glow, a small wheel, a white base on glide skates. About
 * 120 × 64 × 38 mm. Origin on the desk, front toward −z.
 */
export function buildMouse(kit: Kit) {
  const W = 0.064;
  const L = 0.122;
  const HT = 0.036;
  const FRONT_H = 0.019;
  const hw = W / 2;
  const hd = L / 2;
  const NT = 96;
  const outline = (th: number) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const n = s < 0 ? 3.0 : 2.5; // a little squarer at the front
    return {
      x: hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6),
      z: hd * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
    };
  };
  const rhos = [1, 0.995, 0.985, 0.97, 0.945, 0.91, 0.865, 0.81, 0.745, 0.67, 0.58, 0.48, 0.37, 0.26, 0.15, 0.06, 0];
  const crown = (x: number, z: number) => {
    const t = clamp((z + hd) / L);
    const along = smoothstep(0, 0.6, t) * (1 - 0.2 * smoothstep(0.72, 1, t));
    const across = 1 - 0.22 * Math.pow(Math.abs(x) / hw, 2);
    return (FRONT_H + (HT - FRONT_H) * along) * across;
  };
  const rings: Ring[] = rhos.map((rho) => {
    const pts: Ring = [];
    for (let i = 0; i < NT; i++) {
      const o = outline((i / NT) * Math.PI * 2);
      const x = o.x * rho;
      const z = o.z * rho;
      const e = clamp((1 - rho) / 0.2);
      const roll = Math.sqrt(Math.max(0, 1 - Math.pow(1 - e, 2)));
      const y = 0.004 + (crown(x, z) - 0.004) * roll;
      pts.push({ x, y, z, u: x / W + 0.5, v: 0.5 - z / L });
    }
    return pts;
  });
  const shellGeo = kit.track(loft(rings, "none"));
  const tex = kit.track(honeycombTexture(W, L));
  const shellMat = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: 0xf7f8f9,
      map: tex,
      alphaTest: 0.5,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
    })
  );
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  const g = new THREE.Group();
  g.add(shell);

  // the light inside: a plate under the shell and a ring of it along the base
  const glowMat = kit.track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1.0).multiplyScalar(1.15), toneMapped: false }));
  const innerRings: Ring[] = [0.011, 0.0112].map((y) =>
    Array.from({ length: NT }, (_, i) => {
      const o = outline((i / NT) * Math.PI * 2);
      return { x: o.x * 0.8, y, z: o.z * 0.8 };
    })
  );
  const plate = new THREE.Mesh(kit.track(loft(innerRings, "top")), glowMat);
  g.add(plate);
  const ringR: Ring[] = [0.0045, 0.0062].map((y) =>
    Array.from({ length: NT }, (_, i) => {
      const o = outline((i / NT) * Math.PI * 2);
      return { x: o.x * 0.93, y, z: o.z * 0.93 };
    })
  );
  g.add(new THREE.Mesh(kit.track(loft(ringR, "none")), glowMat));

  // base plate and skates
  const baseMat = kit.track(new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.4, metalness: 0.1 }));
  const baseRings: Ring[] = [0, 0.0042].map((y) =>
    Array.from({ length: NT }, (_, i) => {
      const o = outline((i / NT) * Math.PI * 2);
      return { x: o.x * 0.985, y, z: o.z * 0.985 };
    })
  );
  g.add(new THREE.Mesh(kit.track(loft(baseRings, "top")), baseMat));
  const skate = kit.track(new RoundedBoxGeometry(0.012, 0.0014, 0.03, 1, 0.0006));
  const skateMat = kit.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  for (const [x, z] of [
    [-0.02, -0.035],
    [0.02, -0.035],
    [-0.018, 0.035],
    [0.018, 0.035],
  ]) {
    const sk = new THREE.Mesh(skate, skateMat);
    sk.position.set(x, -0.0003, z);
    g.add(sk);
  }

  // the wheel, with a ring of light
  const wz = -0.032;
  const wy = crown(0, wz) - 0.0035;
  const wheelMat = kit.track(new THREE.MeshStandardMaterial({ color: 0xf5f6f8, roughness: 0.3, metalness: 0.2 }));
  const wheel = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(0.0085, 0.0085, 0.0065, 40)), wheelMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, wy, wz);
  g.add(wheel);
  const hub = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0072, 24)), glowMat);
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(wheel.position);
  g.add(hub);

  g.position.y = 0.0007;
  const holder = new THREE.Group();
  holder.add(g);
  kit.addContact(holder, 0.095, 0.15, { alpha: 0.6, y: 0.0003 });
  return holder;
}

/* ============================ laptop stand ======================== */

/**
 * A bent-aluminium stand: a cradle plate on two open arched sides, a lip at
 * the front edge so the laptop cannot slide, and four rubber feet. Returns
 * where to put a laptop (origin of its underside, in the stand's space) and
 * the tilt to give it.
 */
export function buildLaptopStand(kit: Kit) {
  const g = new THREE.Group();
  const alu = kit.track(
    new THREE.MeshPhysicalMaterial({
      color: 0xc3c6cc,
      metalness: 1,
      roughness: 0.3,
      anisotropy: 0.45,
      anisotropyRotation: 0,
    })
  );
  const rubber = kit.track(new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.9 }));
  const D = 0.232;
  const hf = 0.034;
  const tilt = 0.2;
  const hb = hf + D * Math.tan(tilt);
  const T = 0.004;
  const W = 0.248;

  // cradle plate, tilted
  const plateGeo = kit.track(slab(W, D / Math.cos(tilt), T, 0.008, 0.0013, 2));
  const plate = new THREE.Mesh(plateGeo, alu);
  plate.castShadow = true;
  plate.receiveShadow = true;
  const mid = (hf + hb) / 2;
  plate.position.set(0, mid - T * Math.cos(tilt), -T * Math.sin(tilt));
  plate.rotation.x = tilt;
  g.add(plate);

  // the front lip
  const lip = kit.mesh(new RoundedBoxGeometry(W * 0.86, 0.0075, 0.005, 2, 0.0022), alu);
  lip.rotation.x = tilt;
  lip.position.set(0, hf + 0.0005, D / 2 - 0.001);
  g.add(lip);

  // sides: a trapezoid with an open arch
  const sideShape = new THREE.Shape();
  sideShape.moveTo(D / 2, 0);
  sideShape.lineTo(-D / 2, 0);
  sideShape.lineTo(-D / 2, hb - T);
  sideShape.lineTo(D / 2, hf - T);
  sideShape.closePath();
  const arch = new THREE.Path();
  arch.absellipse(0.0, 0.0215, D * 0.34, 0.0165, 0, Math.PI * 2, true);
  sideShape.holes.push(arch);
  const sideGeo = kit.track(
    new THREE.ExtrudeGeometry(sideShape, {
      depth: 0.007,
      bevelEnabled: true,
      bevelSize: 0.0008,
      bevelThickness: 0.0008,
      bevelSegments: 1,
      curveSegments: 24,
    })
  );
  sideGeo.rotateY(-Math.PI / 2); // shape x → world z (front +z); extrusion → −x
  for (const x of [-W / 2 + 0.014, W / 2 - 0.014]) {
    const s = new THREE.Mesh(sideGeo, alu);
    s.castShadow = true;
    s.receiveShadow = true;
    s.position.set(x + 0.0035, 0, 0);
    g.add(s);
  }
  // four feet
  const footGeo = kit.track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0016, 16));
  for (const x of [-W / 2 + 0.0175, W / 2 - 0.0175]) {
    for (const z of [-D / 2 + 0.014, D / 2 - 0.014]) {
      const f = new THREE.Mesh(footGeo, rubber);
      f.position.set(x, -0.0004, z);
      g.add(f);
    }
  }
  g.position.y = 0.0016;
  const holder = new THREE.Group();
  holder.add(g);
  kit.addContact(holder, 0.3, 0.3, { alpha: 0.7, y: 0.0008 });

  // where the laptop's underside origin sits: on the plate's top face, centred
  const n = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const origin = new THREE.Vector3(0, mid, 0).addScaledVector(n, 0.0003).setY(mid + 0.0003 * Math.cos(tilt) + 0.0016);
  return { group: holder, tilt, origin, depth: D, front: hf };
}

/* ================================ lamp ============================ */

/**
 * An architect's lamp: a weighted round base, a vertical post, two arms of
 * paired rods with a coil spring, brass pivots, and a domed shade. Placed
 * with the same points the light uses so what you see is where the light is.
 */
export function buildLamp(
  kit: Kit,
  p: { base: THREE.Vector3; j1: THREE.Vector3; j2: THREE.Vector3; head: THREE.Vector3; target: THREE.Vector3 }
) {
  const g = new THREE.Group();
  const matte = kit.track(new THREE.MeshPhysicalMaterial({ color: 0x131417, roughness: 0.46, metalness: 0.55, clearcoat: 0.25 }));
  const brass = kit.track(new THREE.MeshStandardMaterial({ color: 0xb48e55, metalness: 1, roughness: 0.28 }));
  const inner = kit.track(new THREE.MeshStandardMaterial({ color: 0xe2d6c0, metalness: 0.4, roughness: 0.4, side: THREE.BackSide }));

  // weighted base: a lathe with a soft shoulder and a brass ring
  const prof: [number, number][] = [
    [0, 0],
    [0.074, 0],
    [0.077, 0.002],
    [0.077, 0.009],
    [0.071, 0.0145],
    [0.03, 0.017],
    [0.011, 0.019],
    [0.011, 0.022],
  ];
  const baseGeo = kit.track(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64));
  const base = new THREE.Mesh(baseGeo, matte);
  base.position.copy(p.base).setY(0);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const ring = new THREE.Mesh(kit.track(new THREE.TorusGeometry(0.0735, 0.0008, 8, 64)), brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(p.base).setY(0.0105);
  g.add(ring);

  const up = new THREE.Vector3(0, 1, 0);
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const mesh = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(r, r, len, 10)), m);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(up, d.normalize());
    mesh.castShadow = true;
    return mesh;
  };
  const pivotAt = (at: THREE.Vector3, axis: THREE.Vector3, r = 0.0125, w = 0.016) => {
    const c = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(r, r, w, 28)), matte);
    c.position.copy(at);
    c.quaternion.setFromUnitVectors(up, axis);
    c.castShadow = true;
    g.add(c);
    const cap = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.0016, 20)), brass);
    cap.position.copy(at);
    cap.quaternion.copy(c.quaternion);
    g.add(cap);
  };

  const post = new THREE.Vector3(p.base.x, 0.022, p.base.z);
  const arm = (a: THREE.Vector3, b: THREE.Vector3, spring: boolean) => {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    // pivots are drawn perpendicular to the plane of the arm
    const axis = new THREE.Vector3().crossVectors(dir, side).normalize().cross(dir).normalize();
    for (const s of [-1, 1]) {
      const o = side.clone().multiplyScalar(s * 0.0065);
      g.add(rod(a.clone().add(o), b.clone().add(o), 0.0022, matte));
    }
    if (spring) {
      // a tight coil running along the arm
      const A = a.clone().addScaledVector(dir, 0.04);
      const B = b.clone().addScaledVector(dir, -0.04);
      const len = A.distanceTo(B);
      const turns = Math.round(len / 0.0055);
      const pts: THREE.Vector3[] = [];
      const n2 = new THREE.Vector3().crossVectors(dir, side).normalize();
      for (let i = 0; i <= turns * 6; i++) {
        const u = i / (turns * 6);
        const ang = u * turns * Math.PI * 2;
        pts.push(
          A.clone()
            .lerp(B, u)
            .addScaledVector(side, Math.cos(ang) * 0.0035)
            .addScaledVector(n2, Math.sin(ang) * 0.0035)
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const coil = new THREE.Mesh(kit.track(new THREE.TubeGeometry(curve, turns * 6, 0.0007, 4, false)), brass);
      g.add(coil);
    }
    return axis;
  };
  const ax1 = arm(post, p.j1, true);
  pivotAt(post, ax1.clone(), 0.0115, 0.02);
  const ax2 = arm(p.j1, p.j2, true);
  pivotAt(p.j1, ax1, 0.0125, 0.02);
  pivotAt(p.j2, ax2, 0.0125, 0.02);
  g.add(rod(p.j2, p.head, 0.003, matte));

  // shade: a dome open toward the target, brass lip, warm inner
  const toTarget = new THREE.Vector3().subVectors(p.target, p.head).normalize();
  const shadeProf: [number, number][] = [
    [0.0, 0.0],
    [0.014, 0.001],
    [0.03, 0.012],
    [0.05, 0.034],
    [0.062, 0.058],
    [0.066, 0.071],
  ];
  const shadeGeo = kit.track(
    new THREE.LatheGeometry(shadeProf.map(([r, y]) => new THREE.Vector2(r, y)), 56)
  );
  const shade = new THREE.Mesh(shadeGeo, matte);
  const innerShade = new THREE.Mesh(shadeGeo, inner);
  const shadeGroup = new THREE.Group();
  // lathe opens toward +y; aim +y at the target
  shadeGroup.add(shade, innerShade);
  shadeGroup.position.copy(p.head).addScaledVector(toTarget, -0.012);
  shadeGroup.quaternion.setFromUnitVectors(up, toTarget);
  shade.castShadow = true;
  g.add(shadeGroup);
  const lip = new THREE.Mesh(kit.track(new THREE.TorusGeometry(0.066, 0.0011, 8, 56)), brass);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.071;
  shadeGroup.add(lip);

  const bulbMat = kit.track(new THREE.MeshBasicMaterial({ color: 0xffe6c0, toneMapped: false }));
  const bulb = new THREE.Mesh(kit.track(new THREE.SphereGeometry(0.021, 20, 14)), bulbMat);
  bulb.position.copy(p.head).addScaledVector(toTarget, 0.03);
  g.add(bulb);

  return { group: g, bulbMat, lightPos: bulb.position.clone().addScaledVector(toTarget, 0.012), toTarget };
}

/* =============================== cable ============================ */

export function buildCable(kit: Kit, pts: THREE.Vector3[], color: number, r = 0.0016) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const geo = kit.track(new THREE.TubeGeometry(curve, 60, r, 8, false));
  const m = new THREE.Mesh(geo, kit.track(new THREE.MeshStandardMaterial({ color, roughness: 0.78 })));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}


/* ============================ textures ============================ */

/** Oak grain, light and slightly warm. `vertical` runs the grain top to bottom. */
export function woodTexture(vertical: boolean, seed = 5, walnut = false) {
  const S = 512;
  const c = makeCanvas(S, S);
  const x = c.getContext("2d")!;
  const base = x.createLinearGradient(0, 0, vertical ? S : 0, vertical ? 0 : S);
  base.addColorStop(0, walnut ? "#5a3d28" : "#c8a572");
  base.addColorStop(0.5, walnut ? "#4d3322" : "#bf9b66");
  base.addColorStop(1, walnut ? "#5c402b" : "#c9a877");
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  let a = seed * 9301 + 49297;
  const rnd = () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
  for (let i = 0; i < 260; i++) {
    const p = rnd() * S;
    const w = 0.5 + rnd() * 2.2;
    const wob = 2 + rnd() * 5;
    const ph = rnd() * 6;
    x.strokeStyle = `rgba(${rnd() > 0.5 ? "92,62,28" : "120,84,44"},${0.05 + rnd() * 0.13})`;
    x.lineWidth = w;
    x.beginPath();
    for (let t = 0; t <= S; t += 8) {
      const o = Math.sin(t * 0.021 + ph) * wob;
      if (vertical) x.lineTo(p + o, t);
      else x.lineTo(t, p + o);
    }
    x.stroke();
  }
  const tex = canvasTexture(c, 8);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Wool felt with a stitched edge, for the desk pad. */
export function feltPadTexture(aspect: number) {
  const w = 1024;
  const h = Math.round(w / aspect);
  const c = makeCanvas(w, h);
  const x = c.getContext("2d")!;
  x.fillStyle = "#3d4047";
  x.fillRect(0, 0, w, h);
  let a = 7;
  const rnd = () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
  for (let i = 0; i < 9000; i++) {
    const px = rnd() * w;
    const py = rnd() * h;
    const l = 2 + rnd() * 5;
    const ang = rnd() * Math.PI;
    x.strokeStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l);
    x.stroke();
  }
  x.strokeStyle = "rgba(190,194,202,0.4)";
  x.lineWidth = 1.6;
  x.setLineDash([8, 7]);
  x.strokeRect(16, 16, w - 32, h - 32);
  return canvasTexture(c, 8);
}
