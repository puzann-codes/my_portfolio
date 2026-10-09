import * as THREE from "three";
import { MONO, canvasTexture, clamp, lerp, makeCanvas } from "./util";

/**
 * Stage 1 — the terminal. An i3-style tiling layout blown up to building
 * size: one big pane on the left, three stacked on the right, a status
 * bar underneath, plus a couple of floating panes at different depths.
 * Focus hops between panes like a keyboard-driven window manager.
 */

type Line = [string, ("dim" | "hi" | "acc")?];

const COLORS = { bg: "#09090a", dim: "rgba(244,244,240,0.45)", norm: "rgba(244,244,240,0.82)", hi: "#ffffff", acc: "#cfcfc8" };

function paneTexture(
  title: string,
  lines: Line[],
  pxW: number,
  pxH: number,
  font = 22
) {
  const c = makeCanvas(pxW, pxH);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, pxW, pxH);

  // title bar
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, 0, pxW, font * 1.9);
  ctx.fillStyle = COLORS.norm;
  ctx.font = `600 ${font * 0.85}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.fillText(title, font, font * 0.95);
  ctx.fillStyle = COLORS.dim;
  ctx.textAlign = "right";
  ctx.fillText("● ● ●", pxW - font, font * 0.95);
  ctx.textAlign = "left";

  ctx.font = `500 ${font}px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  let y = font * 3.4;
  for (const [text, tone] of lines) {
    ctx.fillStyle = tone === "dim" ? COLORS.dim : tone === "hi" ? COLORS.hi : tone === "acc" ? COLORS.acc : COLORS.norm;
    ctx.fillText(text, font, y);
    y += font * 1.38;
  }

  // frame
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, pxW - 3, pxH - 3);
  return canvasTexture(c, 8);
}

const ARCH = [
  "                   -`",
  "                  .o+`",
  "                 `ooo/",
  "                `+oooo:",
  "               `+oooooo:",
  "               -+oooooo+:",
  "             `/:-:++oooo+:",
  "            `/++++/+++++++:",
  "           `/++++++++++++++:",
  "          `/+++ooooooooooooo/`",
  "         ./ooosssso++osssssso+`",
  "        .oossssso-````/ossssss+`",
  "       -osssssso.      :ssssssso.",
  "      :osssssss/        osssso+++.",
  "     /ossssssss/        +ssssooo/-",
  "   `/ossssso+/:-        -:/+osssso+-",
  "  `+sso+:-`                 `.-/+oso:",
  " `++:.                           `-/+/",
];

function mainPane() {
  const lines: Line[] = [];
  const info = [
    ["pujan@arch", "hi"],
    ["─────────", "dim"],
    ["OS       Arch Linux", "norm"],
    ["WM       i3", "norm"],
    ["Shell    zsh", "norm"],
    ["Editor   nvim", "norm"],
    ["Term     kitty", "norm"],
    ["Focus    AI + full-stack", "norm"],
  ] as const;
  ARCH.forEach((row, i) => {
    const right = info[i - 3];
    const left = row.padEnd(36, " ");
    lines.push([right ? left + right[0] : row, right ? (right[1] === "norm" ? undefined : right[1]) : "acc"]);
  });
  lines.push(["", undefined]);
  lines.push(["❯ cat ~/.config/i3/config | head -n 9", "hi"]);
  lines.push(["set $mod Mod4", "dim"]);
  lines.push(["font pango:JetBrains Mono 10", "dim"]);
  lines.push(["bindsym $mod+Return exec kitty", "dim"]);
  lines.push(["bindsym $mod+d exec rofi -show drun", "dim"]);
  lines.push(["bindsym $mod+h focus left", "dim"]);
  lines.push(["bindsym $mod+l focus right", "dim"]);
  lines.push(["bindsym $mod+Shift+q kill", "dim"]);
  lines.push(["gaps inner 10", "dim"]);
  lines.push(["", undefined]);
  lines.push(["❯ make it work, then make it fast_", "hi"]);
  return paneTexture("1: kitty — zsh", lines, 1024, 1080, 21);
}

function codePane() {
  const L: Line[] = [
    ["async function run(goal: string) {", "hi"],
    ["  const plan = await planner(goal);", undefined],
    ["  for (const step of plan) {", undefined],
    ["    const out = await tools[step.tool](step.args);", undefined],
    ["    memory.push(out);", undefined],
    ["    if (await critic(out)) break;", undefined],
    ["  }", undefined],
    ["  return summarise(memory);", undefined],
    ["}", "hi"],
  ];
  return paneTexture("2: nvim — agent.ts", L, 1024, 380, 21);
}

function htopPane() {
  const bar = (n: number) => "█".repeat(Math.round(n / 4)).padEnd(25, "░");
  const L: Line[] = [
    [`1  ${bar(62)} 62%`, "hi"],
    [`2  ${bar(38)} 38%`],
    [`3  ${bar(81)} 81%`, "hi"],
    [`4  ${bar(24)} 24%`],
    [`Mem ${bar(57)} 9.1G/16G`, "acc"],
    ["", undefined],
    ["  PID USER      CPU%  COMMAND", "dim"],
    [" 1042 pujan     48.2  python train.py", undefined],
    [" 2231 pujan     12.9  node next dev", undefined],
    [" 3305 postgres   3.4  postgres: writer", undefined],
    [" 3917 pujan      1.1  nvim agent.ts", undefined],
  ];
  return paneTexture("3: htop", L, 1024, 380, 21);
}

function gitPane() {
  const L: Line[] = [
    ["❯ git log --graph --oneline", "hi"],
    ["* a3f9c1e  feat: tile windows like i3", undefined],
    ["* 7b21d90  fix: the thing I said I'd fix", undefined],
    ["|\\", "dim"],
    ["| * 51ce8a4  exp: let the model check itself", undefined],
    ["|/", "dim"],
    ["* 0d4e7f2  chore: delete dead code (finally)", undefined],
    ["* e19a6b3  init: it begins", undefined],
  ];
  return paneTexture("4: zsh — git", L, 1024, 380, 21);
}

function floatPane(title: string, lines: Line[]) {
  return paneTexture(title, lines, 768, 460, 20);
}

function statusBar() {
  const c = makeCanvas(2048, 96);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, 2048, 96);
  ctx.font = `600 38px ${MONO}`;
  ctx.textBaseline = "middle";
  for (let i = 1; i <= 9; i++) {
    const x = 20 + (i - 1) * 78;
    if (i === 1) {
      ctx.fillStyle = "#f4f4f0";
      ctx.fillRect(x - 8, 14, 64, 68);
      ctx.fillStyle = "#09090a";
    } else {
      ctx.fillStyle = i <= 4 ? "rgba(244,244,240,0.8)" : "rgba(244,244,240,0.3)";
    }
    ctx.fillText(String(i), x + 10, 50);
  }
  ctx.fillStyle = "rgba(244,244,240,0.8)";
  ctx.textAlign = "right";
  ctx.fillText("cpu 41%   mem 9.1G   wifi ▂▄▆█   bat 87%   Thu 9 Oct  21:41", 2020, 50);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 2045, 93);
  return canvasTexture(c, 4);
}

export function buildTerminal() {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];

  type Pane = {
    mesh: THREE.Mesh;
    border: THREE.LineSegments;
    mat: THREE.MeshBasicMaterial;
    bmat: THREE.LineBasicMaterial;
    baseY: number;
    phase: number;
    focus: number;
  };
  const panes: Pane[] = [];

  const add = (tex: THREE.Texture, x: number, y: number, z: number, w: number, h: number, phase: number) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    const bgeo = new THREE.EdgesGeometry(geo);
    const bmat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const border = new THREE.LineSegments(bgeo, bmat);
    border.scale.setScalar(1.012);
    mesh.add(border);
    group.add(mesh);
    tracked.push(geo, mat, bgeo, bmat, tex);
    panes.push({ mesh, border, mat, bmat, baseY: y, phase, focus: 0 });
  };

  const W = 64;
  add(mainPane(), -17, 0, 0, 30, 31.6, 0);
  add(codePane(), 15, 10.7, 0, 28, 10.2, 1.1);
  add(htopPane(), 15, 0, 0, 28, 10.2, 2.2);
  add(gitPane(), 15, -10.7, 0, 28, 10.2, 3.3);

  add(
    floatPane("nvim — ~/.config/nvim/init.lua", [
      ["vim.opt.number = true", undefined],
      ["vim.opt.relativenumber = true", undefined],
      ["vim.g.mapleader = ' '", "hi"],
      ["require('lazy').setup('plugins')", undefined],
      ["-- keep it small, keep it fast", "dim"],
    ]),
    -41,
    13,
    9,
    15,
    9,
    4.4
  );
  add(
    floatPane("journalctl -f", [
      ["i3[812]: focus → workspace 2", "dim"],
      ["kernel: nvme0: queue depth ok", "dim"],
      ["systemd[1]: Started pomodoro.timer", undefined],
      ["NetworkManager: link up", "dim"],
      ["i3[812]: tiling is a lifestyle", "hi"],
    ]),
    40,
    -13,
    -12,
    16,
    9.6,
    5.5
  );

  // i3 status bar
  const barTex = statusBar();
  const barGeo = new THREE.PlaneGeometry(W, (W * 96) / 2048);
  const barMat = new THREE.MeshBasicMaterial({ map: barTex, toneMapped: false });
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.set(-1, -19.2, 0);
  group.add(bar);
  tracked.push(barGeo, barMat, barTex);

  // thin construction lines behind the tiles
  const lines: number[] = [];
  for (let i = -3; i <= 3; i++) {
    lines.push(i * 14, -24, -2, i * 14, 24, -2);
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  const gMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 });
  group.add(new THREE.LineSegments(gGeo, gMat));
  tracked.push(gGeo, gMat);

  let focusIdx = 0;
  let lastSwitch = 0;
  const update = (t: number, dt: number) => {
    if (t - lastSwitch > 3.4) {
      lastSwitch = t;
      focusIdx = (focusIdx + 1) % 4;
    }
    panes.forEach((p, i) => {
      p.focus = lerp(p.focus, i === focusIdx ? 1 : 0, clamp(dt * 5));
      p.mat.color.setScalar(0.5 + 0.5 * p.focus);
      p.bmat.opacity = 0.25 + 0.75 * p.focus;
      p.mesh.position.y = p.baseY + Math.sin(t * 0.5 + p.phase) * (i >= 4 ? 0.5 : 0.12);
    });
  };

  return {
    group,
    update,
    dispose() {
      tracked.forEach((d) => d.dispose());
    },
  };
}
