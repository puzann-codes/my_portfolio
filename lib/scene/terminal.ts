import * as THREE from "three";
import { MONO, canvasTexture, clamp, lerp, makeCanvas } from "./util";

/**
 * Stage — the terminal. An i3-style tiling layout blown up to building
 * size: one big pane on the left, three stacked on the right, a status
 * bar underneath, plus two floating panes at different depths. Focus hops
 * between panes like a keyboard-driven window manager; every pane has its
 * own accent and its text is syntax-coloured like a real editor.
 */

type Seg = [string, string?];
type Line = Seg[];

const C = {
  bg: "#0a0b0f",
  dim: "rgba(220,224,235,0.42)",
  text: "#dfe3ec",
  hi: "#ffffff",
  teal: "#5eead4",
  amber: "#fbbf24",
  pink: "#f472b6",
  blue: "#7dd3fc",
  arch: "#1793d1",
  violet: "#c4b5fd",
  green: "#86efac",
  red: "#fca5a5",
};

const ACCENTS = [0x5eead4, 0xfbbf24, 0xf472b6, 0x7dd3fc, 0xc4b5fd, 0x86efac];

const t = (s: string, color?: string): Seg => [s, color];

function paneTexture(title: string, lines: Line[], pxW: number, pxH: number, accent: string, font = 22) {
  const c = makeCanvas(pxW, pxH);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, pxW, pxH);

  // title bar, tinted with the pane's accent
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, pxW, font * 1.9);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 6, font * 1.9);
  ctx.fillStyle = C.text;
  ctx.font = `600 ${font * 0.85}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.fillText(title, font, font * 0.95);
  ctx.textAlign = "right";
  ctx.fillStyle = "#fb7185";
  ctx.fillText("●", pxW - font * 3.4, font * 0.95);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText("●", pxW - font * 2.2, font * 0.95);
  ctx.fillStyle = "#4ade80";
  ctx.fillText("●", pxW - font, font * 0.95);
  ctx.textAlign = "left";

  ctx.font = `500 ${font}px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  let y = font * 3.4;
  for (const line of lines) {
    let x = font;
    for (const [text, color] of line) {
      ctx.fillStyle = color ?? C.text;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    }
    y += font * 1.38;
  }

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
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
  const info: Seg[][] = [
    [t("pujan@arch", C.arch)],
    [t("──────────", C.dim)],
    [t("OS       ", C.arch), t("Arch Linux")],
    [t("WM       ", C.arch), t("i3")],
    [t("Shell    ", C.arch), t("zsh")],
    [t("Editor   ", C.arch), t("nvim")],
    [t("Term     ", C.arch), t("kitty")],
    [t("Focus    ", C.arch), t("AI + full-stack")],
  ];
  const lines: Line[] = [];
  ARCH.forEach((row, i) => {
    const right = info[i - 3];
    const left = row.padEnd(36, " ");
    lines.push([t(left, C.arch), ...(right ?? [])]);
  });
  lines.push([]);
  lines.push([t("❯ ", C.green), t("cat ~/.config/i3/config | head -n 9", C.hi)]);
  lines.push([t("set ", C.pink), t("$mod Mod4", C.dim)]);
  lines.push([t("font ", C.pink), t("pango:JetBrains Mono 10", C.dim)]);
  lines.push([t("bindsym ", C.pink), t("$mod+Return ", C.amber), t("exec ", C.violet), t("kitty", C.teal)]);
  lines.push([t("bindsym ", C.pink), t("$mod+d ", C.amber), t("exec ", C.violet), t("rofi -show drun", C.teal)]);
  lines.push([t("bindsym ", C.pink), t("$mod+h ", C.amber), t("focus left", C.blue)]);
  lines.push([t("bindsym ", C.pink), t("$mod+l ", C.amber), t("focus right", C.blue)]);
  lines.push([t("bindsym ", C.pink), t("$mod+Shift+q ", C.amber), t("kill", C.red)]);
  lines.push([t("gaps ", C.pink), t("inner ", C.violet), t("10", C.amber)]);
  lines.push([]);
  lines.push([t("❯ ", C.green), t("make it work, then make it fast_", C.hi)]);
  return paneTexture("1: kitty — zsh", lines, 1024, 1080, "#5eead4", 21);
}

function codePane() {
  const kw = (s: string) => t(s, C.pink);
  const L: Line[] = [
    [kw("async function "), t("run", C.amber), t("(goal: "), t("string", C.blue), t(") {")],
    [t("  "), kw("const "), t("plan = "), kw("await "), t("planner", C.amber), t("(goal);")],
    [t("  "), kw("for "), t("("), kw("const "), t("step "), kw("of "), t("plan) {")],
    [t("    "), kw("const "), t("out = "), kw("await "), t("tools[step.tool](step.args);")],
    [t("    memory."), t("push", C.amber), t("(out);")],
    [t("    "), kw("if "), t("("), kw("await "), t("critic", C.amber), t("(out)) "), kw("break"), t(";")],
    [t("  }")],
    [t("  "), kw("return "), t("summarise", C.amber), t("(memory);")],
    [t("}")],
  ];
  return paneTexture("2: nvim — agent.ts", L, 1024, 380, "#fbbf24", 21);
}

function htopPane() {
  const bar = (n: number, color: string): Seg[] => {
    const filled = Math.round(n / 4);
    return [t("█".repeat(filled), color), t("░".repeat(25 - filled), C.dim)];
  };
  const L: Line[] = [
    [t("1  "), ...bar(62, C.green), t(" 62%", C.hi)],
    [t("2  "), ...bar(38, C.green), t(" 38%")],
    [t("3  "), ...bar(81, C.red), t(" 81%", C.hi)],
    [t("4  "), ...bar(24, C.green), t(" 24%")],
    [t("Mem "), ...bar(57, C.amber), t(" 9.1G/16G", C.amber)],
    [],
    [t("  PID USER      CPU%  COMMAND", C.dim)],
    [t(" 1042 pujan     "), t("48.2", C.amber), t("  python train.py", C.teal)],
    [t(" 2231 pujan     "), t("12.9", C.green), t("  node next dev", C.teal)],
    [t(" 3305 postgres   "), t("3.4", C.green), t("  postgres: writer", C.teal)],
    [t(" 3917 pujan      "), t("1.1", C.green), t("  nvim agent.ts", C.teal)],
  ];
  return paneTexture("3: htop", L, 1024, 380, "#f472b6", 21);
}

function gitPane() {
  const L: Line[] = [
    [t("❯ ", C.green), t("git log --graph --oneline", C.hi)],
    [t("* ", C.pink), t("a3f9c1e ", C.amber), t("(HEAD -> main) ", C.teal), t("feat: tile windows like i3")],
    [t("* ", C.pink), t("7b21d90 ", C.amber), t("fix: the thing I said I'd fix")],
    [t("|\\", C.blue)],
    [t("| * ", C.blue), t("51ce8a4 ", C.amber), t("exp: let the model check itself")],
    [t("|/", C.blue)],
    [t("* ", C.pink), t("0d4e7f2 ", C.amber), t("chore: delete dead code (finally)")],
    [t("* ", C.pink), t("e19a6b3 ", C.amber), t("init: it begins")],
  ];
  return paneTexture("4: zsh — git", L, 1024, 380, "#7dd3fc", 21);
}

function floatPane(title: string, lines: Line[], accent: string) {
  return paneTexture(title, lines, 768, 460, accent, 20);
}

function statusBar() {
  const c = makeCanvas(2048, 96);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0b0c11";
  ctx.fillRect(0, 0, 2048, 96);
  ctx.font = `600 38px ${MONO}`;
  ctx.textBaseline = "middle";
  for (let i = 1; i <= 9; i++) {
    const x = 20 + (i - 1) * 78;
    if (i === 1) {
      ctx.fillStyle = "#5eead4";
      ctx.fillRect(x - 8, 14, 64, 68);
      ctx.fillStyle = "#07120f";
    } else {
      ctx.fillStyle = i <= 4 ? "rgba(223,227,236,0.85)" : "rgba(223,227,236,0.3)";
    }
    ctx.fillText(String(i), x + 10, 50);
  }
  const segs: [string, string][] = [
    ["cpu 41%", "#86efac"],
    ["mem 9.1G", "#fbbf24"],
    ["wifi ▂▄▆█", "#7dd3fc"],
    ["bat 87%", "#86efac"],
    ["Thu 9 Oct  21:41", "#f4f4f0"],
  ];
  let x = 2020;
  ctx.textAlign = "right";
  for (const [text, color] of [...segs].reverse()) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, 50);
    x -= ctx.measureText(text).width + 56;
  }
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 2045, 93);
  return canvasTexture(c, 4);
}

export function buildTerminal() {
  const group = new THREE.Group();
  const tracked: { dispose(): void }[] = [];

  type Pane = {
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    bmat: THREE.LineBasicMaterial;
    baseY: number;
    phase: number;
    focus: number;
  };
  const panes: Pane[] = [];

  const add = (
    tex: THREE.Texture,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    phase: number,
    accent: number
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    const bgeo = new THREE.EdgesGeometry(geo);
    const bmat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.3 });
    const border = new THREE.LineSegments(bgeo, bmat);
    border.scale.setScalar(1.012);
    mesh.add(border);
    group.add(mesh);
    tracked.push(geo, mat, bgeo, bmat, tex);
    panes.push({ mesh, mat, bmat, baseY: y, phase, focus: 0 });
  };

  const W = 64;
  add(mainPane(), -17, 0, 0, 30, 31.6, 0, ACCENTS[0]);
  add(codePane(), 15, 10.7, 0, 28, 10.2, 1.1, ACCENTS[1]);
  add(htopPane(), 15, 0, 0, 28, 10.2, 2.2, ACCENTS[2]);
  add(gitPane(), 15, -10.7, 0, 28, 10.2, 3.3, ACCENTS[3]);

  add(
    floatPane(
      "nvim — ~/.config/nvim/init.lua",
      [
        [t("vim.opt.number", C.blue), t(" = "), t("true", C.amber)],
        [t("vim.opt.relativenumber", C.blue), t(" = "), t("true", C.amber)],
        [t("vim.g.mapleader", C.blue), t(" = "), t("' '", C.teal)],
        [t("require", C.pink), t("("), t("'lazy'", C.teal), t(")."), t("setup", C.amber), t("("), t("'plugins'", C.teal), t(")")],
        [t("-- keep it small, keep it fast", C.dim)],
      ],
      "#c4b5fd"
    ),
    -41,
    13,
    9,
    15,
    9,
    4.4,
    ACCENTS[4]
  );
  add(
    floatPane(
      "journalctl -f",
      [
        [t("i3[812]: ", C.dim), t("focus → workspace 2", C.teal)],
        [t("kernel: ", C.dim), t("nvme0: queue depth ok", C.green)],
        [t("systemd[1]: ", C.dim), t("Started pomodoro.timer", C.amber)],
        [t("NetworkManager: ", C.dim), t("link up", C.green)],
        [t("i3[812]: ", C.dim), t("tiling is a lifestyle", C.pink)],
      ],
      "#86efac"
    ),
    40,
    -13,
    -12,
    16,
    9.6,
    5.5,
    ACCENTS[5]
  );

  // i3 status bar
  const barTex = statusBar();
  const barGeo = new THREE.PlaneGeometry(W, (W * 96) / 2048);
  const barMat = new THREE.MeshBasicMaterial({ map: barTex, toneMapped: false });
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.set(-1, -19.2, 0);
  group.add(bar);
  tracked.push(barGeo, barMat, barTex);

  let focusIdx = 0;
  let lastSwitch = 0;
  const update = (time: number, dt: number) => {
    if (time - lastSwitch > 3.4) {
      lastSwitch = time;
      focusIdx = (focusIdx + 1) % 4;
    }
    panes.forEach((p, i) => {
      p.focus = lerp(p.focus, i === focusIdx ? 1 : 0, clamp(dt * 5));
      p.mat.color.setScalar(0.5 + 0.5 * p.focus);
      p.bmat.opacity = 0.25 + 0.75 * p.focus;
      p.mesh.position.y = p.baseY + Math.sin(time * 0.5 + p.phase) * (i >= 4 ? 0.5 : 0.12);
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
