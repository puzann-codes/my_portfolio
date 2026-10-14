import { MONO, canvasTexture, clamp, makeCanvas } from "./util";

/**
 * What is on the laptop's screen. A small, finished interface rather than a
 * poster: a menu bar, a terminal window that the keyboard types into, a large
 * wordmark over a wireframe globe, a quiet waveform, and a dock. The static
 * layer is painted once; only the time, the prompt, the typed role and the
 * waveform are drawn per repaint.
 */

export type ScreenState = {
  /** 0..1 how much of the role line has been typed */
  sub: number;
  /** characters typed with the keyboard */
  keys: string;
  blink: boolean;
  t: number;
};

const SANS = '-apple-system, "SF Pro Text", "Inter", system-ui, "Helvetica Neue", Arial, sans-serif';
const ICE = "#8fb8ff";
const W = 1280;
const H = 833;

const ROLE = "AI engineer & full-stack developer";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paintStatic(ctx: CanvasRenderingContext2D, hero: string, projects: string[]) {
  // ---- background ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0c0e13");
  bg.addColorStop(1, "#050608");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.76, H * 0.46, 10, W * 0.76, H * 0.46, 520);
  glow.addColorStop(0, "rgba(90,130,200,0.22)");
  glow.addColorStop(1, "rgba(90,130,200,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // dot grid
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let y = 40; y < H; y += 26) {
    for (let x = 20; x < W; x += 26) ctx.fillRect(x, y, 1.6, 1.6);
  }

  // wireframe globe behind the name
  const gx = 968;
  const gy = 392;
  const R = 262;
  ctx.strokeStyle = "rgba(143,184,255,0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(gx, gy, R, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = -3; i <= 3; i++) {
    const k = i / 4;
    ctx.beginPath();
    ctx.ellipse(gx, gy + k * R * 0.92, R * Math.sqrt(1 - k * k), R * 0.14 * (1 - Math.abs(k) * 0.4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(gx, gy, R * (i / 4), R, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // a tilted orbit
  ctx.strokeStyle = "rgba(143,184,255,0.32)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(gx, gy, R * 1.12, R * 0.34, -0.28, 0, Math.PI * 2);
  ctx.stroke();

  // corner brackets around the right column
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.5;
  const bx0 = 720;
  const by0 = 64;
  const bx1 = W - 40;
  const by1 = 704;
  const L = 18;
  for (const [x, y, sx, sy] of [
    [bx0, by0, 1, 1],
    [bx1, by0, -1, 1],
    [bx0, by1, 1, -1],
    [bx1, by1, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + sx * L, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * L);
    ctx.stroke();
  }

  // the wordmark
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let size = 126;
  ctx.font = `900 ${size}px ${hero}, ${SANS}`;
  const widest = ctx.measureText("PUJAN").width;
  const maxW = 470;
  if (widest > maxW) size = Math.floor((size * maxW) / widest);
  ctx.font = `900 ${size}px ${hero}, ${SANS}`;
  ctx.fillStyle = "#f4f4f0";
  ctx.shadowColor = "rgba(143,184,255,0.35)";
  ctx.shadowBlur = 32;
  ctx.fillText("PUJAN", gx, gy - size * 0.04);
  ctx.fillText("BHATT", gx, gy + size * 0.98);
  ctx.shadowBlur = 0;

  // role label under it
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = "rgba(244,244,240,0.62)";
  ctx.letterSpacing = "3px";
  ctx.fillText("AI ENGINEER  ·  FULL-STACK DEVELOPER", gx + 1.5, gy + size * 0.98 + 58);
  ctx.letterSpacing = "0px";

  // chips
  const chips = [`${projects.length} projects`, "Arch Linux + i3", "MacBook"];
  ctx.font = `500 13px ${SANS}`;
  const widths = chips.map((c) => ctx.measureText(c).width + 28);
  let cx = gx - (widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10) / 2;
  const cy = gy + size * 0.98 + 82;
  chips.forEach((c, i) => {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    roundRect(ctx, cx, cy, widths[i], 30, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(244,244,240,0.82)";
    ctx.fillText(c, cx + widths[i] / 2, cy + 20);
    cx += widths[i] + 10;
  });

  // ---- the terminal window ----
  const wx = 48;
  const wy = 64;
  const ww = 640;
  const wh = 524;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "rgba(16,18,24,0.94)";
  roundRect(ctx, wx, wy, ww, wh, 16);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  roundRect(ctx, wx + 0.5, wy + 0.5, ww - 1, wh - 1, 16);
  ctx.stroke();
  // title bar
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, 42, [16, 16, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.moveTo(wx, wy + 42.5);
  ctx.lineTo(wx + ww, wy + 42.5);
  ctx.stroke();
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(wx + 24 + i * 22, wy + 21, 6.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.font = `500 13px ${MONO}`;
  ctx.fillStyle = "rgba(244,244,240,0.5)";
  ctx.fillText("pujan — zsh — 80×24", wx + ww / 2, wy + 26);

  // static lines of the session
  ctx.textAlign = "left";
  ctx.font = `500 18px ${MONO}`;
  const tx = wx + 30;
  let ty = wy + 88;
  const line = 31;
  const prompt = (cmd: string) => {
    ctx.fillStyle = ICE;
    ctx.fillText("❯", tx, ty);
    ctx.fillStyle = "#f4f4f0";
    ctx.fillText(cmd, tx + 28, ty);
    ty += line;
  };
  prompt("whoami");
  ctx.fillStyle = "rgba(244,244,240,0.7)";
  ctx.fillText("pujan bhatt", tx, ty);
  ty += line * 1.25;
  prompt("cat role.txt");
  // (the role line is typed in the dynamic layer)
  ty += line * 1.25;
  prompt("ls projects/");
  projects.forEach((p, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.fillStyle = "rgba(143,184,255,0.9)";
    ctx.fillText("◆", tx + col * 280, ty + row * line);
    ctx.fillStyle = "rgba(244,244,240,0.82)";
    ctx.fillText(p.toLowerCase().replace(/\s+/g, "-"), tx + 28 + col * 280, ty + row * line);
  });

  // ---- menu bar ----
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  ctx.fillRect(0, 0, W, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.moveTo(0, 32.5);
  ctx.lineTo(W, 32.5);
  ctx.stroke();
  ctx.fillStyle = "#f4f4f0";
  ctx.beginPath();
  ctx.arc(24, 16, 6.5, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#f4f4f0";
  ctx.stroke();
  ctx.font = `700 14px ${SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText("pujan.dev", 42, 17);
  ctx.font = `500 14px ${SANS}`;
  ctx.fillStyle = "rgba(244,244,240,0.85)";
  let mx = 140;
  for (const m of ["Terminal", "File", "Edit", "View", "Window", "Help"]) {
    ctx.fillText(m, mx, 17);
    mx += ctx.measureText(m).width + 26;
  }
  // wifi + battery
  ctx.strokeStyle = "rgba(244,244,240,0.85)";
  ctx.lineWidth = 1.8;
  const wxp = W - 238;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(wxp, 22, i * 4.2, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(244,244,240,0.85)";
  ctx.beginPath();
  ctx.arc(wxp, 22, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(244,244,240,0.7)";
  ctx.lineWidth = 1.3;
  roundRect(ctx, W - 202, 10, 26, 13, 3.5);
  ctx.stroke();
  ctx.fillStyle = "rgba(244,244,240,0.85)";
  roundRect(ctx, W - 200, 12, 19, 9, 2);
  ctx.fill();
  ctx.fillRect(W - 175.5, 14.5, 2, 4);

  // the camera notch
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 78, -2, 156, 34, [0, 0, 12, 12]);
  ctx.fill();
  ctx.fillStyle = "#10131a";
  ctx.beginPath();
  ctx.arc(W / 2 + 36, 13, 4, 0, Math.PI * 2);
  ctx.fill();

  // ---- the dock ----
  const dw = 486;
  const dh = 66;
  const dx = (W - dw) / 2;
  const dy = H - 90;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, dx, dy, dw, dh, 20);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  roundRect(ctx, dx + 0.5, dy + 0.5, dw - 1, dh - 1, 20);
  ctx.stroke();
  const icon = (i: number, draw: (x: number, y: number, s: number) => void, fill: string | CanvasGradient) => {
    const s = 48;
    const x = dx + 20 + i * 74;
    const y = dy + (dh - s) / 2;
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, s, s, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, 12);
    ctx.stroke();
    ctx.save();
    roundRect(ctx, x, y, s, s, 12);
    ctx.clip();
    draw(x, y, s);
    ctx.restore();
  };
  const grad = (y0: number, a: string, b: string) => {
    const g = ctx.createLinearGradient(0, dy + y0, 0, dy + y0 + 60);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  };
  icon(
    0,
    (x, y, s) => {
      ctx.fillStyle = ICE;
      ctx.font = `700 20px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(">_", x + s / 2, y + s / 2 + 1);
    },
    "#171a21"
  );
  icon(
    1,
    (x, y, s) => {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ff8a6b";
      ctx.beginPath();
      ctx.moveTo(x + s / 2 + 7, y + s / 2 - 7);
      ctx.lineTo(x + s / 2 + 2, y + s / 2 + 2);
      ctx.lineTo(x + s / 2 - 7, y + s / 2 + 7);
      ctx.lineTo(x + s / 2 - 2, y + s / 2 - 2);
      ctx.closePath();
      ctx.fill();
    },
    grad(0, "#2c5da8", "#16335f")
  );
  icon(
    2,
    (x, y, s) => {
      ctx.fillStyle = "#cfe3ff";
      ctx.font = `700 18px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText("</>", x + s / 2, y + s / 2 + 1);
    },
    "#1d222b"
  );
  icon(
    3,
    (x, y, s) => {
      ctx.strokeStyle = "rgba(30,32,38,0.5)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 11, y + 14 + i * 7);
        ctx.lineTo(x + s - 11 - (i === 3 ? 12 : 0), y + 14 + i * 7);
        ctx.stroke();
      }
    },
    "#ece6d2"
  );
  icon(
    4,
    (x, y, s) => {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 11, y + 15, s - 22, s - 30);
      ctx.beginPath();
      ctx.moveTo(x + 11, y + 15);
      ctx.lineTo(x + s / 2, y + s / 2 + 2);
      ctx.lineTo(x + s - 11, y + 15);
      ctx.stroke();
    },
    grad(0, "#3b82f6", "#1e4fb8")
  );
  icon(
    5,
    (x, y, s) => {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(x + s / 2 - 5, y + s / 2 + 8, 6, 4.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + s / 2, y + 10, 2.6, s / 2 - 1);
      ctx.beginPath();
      ctx.moveTo(x + s / 2 + 2.6, y + 10);
      ctx.quadraticCurveTo(x + s / 2 + 14, y + 14, x + s / 2 + 10, y + 24);
      ctx.lineTo(x + s / 2 + 2.6, y + 19);
      ctx.fill();
    },
    "#23262e"
  );
  // the running indicator
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(dx + 20 + 24, dy + dh - 5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dx + 20 + 74 * 2 + 24, dy + dh - 5, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // the waveform's frame
  ctx.font = `600 11px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(244,244,240,0.45)";
  ctx.letterSpacing = "2.5px";
  ctx.fillText("INPUT", 746, 640);
  ctx.letterSpacing = "0px";
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(746, 654);
  ctx.lineTo(1234, 654);
  ctx.stroke();
}

export function createScreen(opts: { hero: string; projects: string[] }) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d")!;
  const base = makeCanvas(W, H);
  paintStatic(base.getContext("2d")!, opts.hero, opts.projects);
  const texture = canvasTexture(canvas, 8);

  const paint = (s: ScreenState) => {
    ctx.drawImage(base, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // clock
    const d = new Date();
    const clock = d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
      "  " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    ctx.font = `500 14px ${SANS}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(244,244,240,0.88)";
    ctx.fillText(clock, W - 22, 17);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // the role line, typed
    const tx = 48 + 30;
    const wy = 64;
    const line = 31;
    let ty = wy + 88 + line * 2 + line * 1.25;
    ctx.font = `500 18px ${MONO}`;
    const n = Math.floor(ROLE.length * clamp(s.sub));
    ctx.fillStyle = "rgba(244,244,240,0.7)";
    ctx.fillText(ROLE.slice(0, n), tx, ty);
    if (s.sub < 1) {
      const w = ctx.measureText(ROLE.slice(0, n)).width;
      ctx.fillStyle = "#f4f4f0";
      ctx.fillRect(tx + w + 2, ty - 16, 10, 21);
    }

    // the prompt the keyboard types into: below the project list
    ty = wy + 88 + line * 2 + line * 1.25 * 2 + line * 3 + line * 1.1;
    ctx.fillStyle = ICE;
    ctx.fillText("❯", tx, ty);
    ctx.fillStyle = "#f4f4f0";
    ctx.fillText(s.keys, tx + 28, ty);
    const kw = ctx.measureText(s.keys).width;
    if (s.blink || s.keys.length > 0) {
      ctx.fillStyle = s.blink ? "#f4f4f0" : "rgba(244,244,240,0.35)";
      ctx.fillRect(tx + 28 + kw + 2, ty - 16, 10, 21);
    }

    // waveform
    const x0 = 746;
    const x1 = 1234;
    const mid = 678;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const u = (x - x0) / (x1 - x0);
      const env = Math.sin(u * Math.PI);
      const amp = 4 + 8 * env + (s.keys.length > 0 ? 6 * env : 0);
      const y =
        mid +
        Math.sin(u * 22 + s.t * 2.2) * amp * 0.6 +
        Math.sin(u * 9 - s.t * 1.3) * amp * 0.5 +
        Math.sin(u * 51 + s.t * 4.1) * amp * 0.18;
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(143,184,255,0.85)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    texture.needsUpdate = true;
  };

  return { canvas, texture, paint, width: W, height: H };
}

