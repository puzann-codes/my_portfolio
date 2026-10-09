"use client";

import { useEffect, useRef } from "react";
import { cursorState, onCursor } from "@/lib/cursor-bus";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The Prismatic Signal Cursor.
 *
 * Physical desk: a crisp point plus a thin optical aperture that follows a
 * beat behind it, like a lens trailing the mouse.
 * Inside the laptop: the same two parts become a precise technical marker —
 * the aperture squares off into a reticle and cools to icy blue. That change
 * is driven by `cursorState.digital`, which the camera director sets from the
 * camera's own progress, never from a timer.
 * Interactive things (links, buttons, 3D objects) pull the aperture around
 * themselves; a click sends a short, precise ripple. Nothing here emits
 * particles, blends against the page, or intercepts pointer events.
 */

const RING = 30;
const SELECTOR =
  'a[href], button, summary, [role="button"], [data-cursor-hover], input[type="range"], input[type="checkbox"], input[type="radio"]';
const TEXT_FIELD = "input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select";

export default function PrismCursor() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const rippleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const label = labelRef.current;
    const rippleEl = rippleRef.current;
    if (!root || !ring || !dot || !label || !rippleEl) return;

    // touch / no-hover devices keep the system cursor entirely
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = prefersReducedMotion();
    const onReduced = () => (reduced = prefersReducedMotion());
    reducedMq.addEventListener("change", onReduced);

    const html = document.documentElement;
    html.classList.add("has-prism-cursor");

    const pos = { x: -100, y: -100 };
    const r = { x: -100, y: -100, w: RING, h: RING, rad: RING / 2, m: 0, press: 0 };
    let hoverEl: Element | null = null;
    let hoverLabel: string | null = null;
    let visible = false;
    let down = false;
    let raf = 0;
    let last = performance.now();

    const show = (v: boolean) => {
      if (visible === v) return;
      visible = v;
      root.style.opacity = v ? "1" : "0";
    };

    const targetRect = () => {
      const s = cursorState.rect;
      if (s) return s;
      if (hoverEl && hoverEl.isConnected) {
        const b = hoverEl.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) {
          const cs = getComputedStyle(hoverEl);
          const rad = Math.max(parseFloat(cs.borderTopLeftRadius) || 0, 0);
          return { x: b.left, y: b.top, w: b.width, h: b.height, r: rad };
        }
      }
      return null;
    };

    const tick = () => {
      raf = 0;
      const now = performance.now();
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      const follow = reduced ? 1 : 1 - Math.pow(1 - 0.22, dt);
      const shape = reduced ? 1 : 1 - Math.pow(1 - 0.3, dt);

      const m = cursorState.digital;
      const t = targetRect();
      const hint = cursorState.hint ?? hoverLabel;

      // aperture target: a lens around the pointer, or a frame around a target
      let tx = pos.x;
      let ty = pos.y;
      let tw = RING + m * 10;
      let th = RING + m * 10;
      let trad = (RING / 2) * (1 - m) + 3 * m;
      if (t) {
        tx = t.x + t.w / 2;
        ty = t.y + t.h / 2;
        tw = t.w + 12;
        th = t.h + 12;
        trad = Math.min(t.r + 6, Math.min(tw, th) / 2);
        if (m > 0.5) trad = Math.min(trad, 4);
      }
      r.x += (tx - r.x) * (t ? shape : follow);
      r.y += (ty - r.y) * (t ? shape : follow);
      r.w += (tw - r.w) * shape;
      r.h += (th - r.h) * shape;
      r.rad += (trad - r.rad) * shape;
      r.m += (m - r.m) * shape;
      r.press += ((down ? 1 : 0) - r.press) * shape;

      ring.style.transform = `translate3d(${r.x - r.w / 2}px, ${r.y - r.h / 2}px, 0)`;
      ring.style.width = `${r.w}px`;
      ring.style.height = `${r.h}px`;
      ring.style.borderRadius = `${r.rad}px`;
      ring.style.setProperty("--m", r.m.toFixed(3));
      ring.style.setProperty("--press", r.press.toFixed(3));

      // the point is immediate; it contracts on targets and presses
      const scale = (t ? 0.7 : 1) * (1 - r.press * 0.25);
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${r.m * 45}deg) scale(${scale})`;
      dot.style.setProperty("--m", r.m.toFixed(3));

      if (hint) {
        label.textContent = hint;
        label.style.opacity = "1";
        label.style.transform = `translate3d(${r.x + r.w / 2 + 10}px, ${r.y - 7}px, 0)`;
      } else {
        label.style.opacity = "0";
      }

      const settled =
        Math.abs(tx - r.x) < 0.1 &&
        Math.abs(ty - r.y) < 0.1 &&
        Math.abs(tw - r.w) < 0.1 &&
        Math.abs(th - r.h) < 0.1 &&
        Math.abs(trad - r.rad) < 0.1 &&
        Math.abs(m - r.m) < 0.002 &&
        Math.abs((down ? 1 : 0) - r.press) < 0.01;
      // keep running while a DOM target is held (it can move on scroll)
      if (!settled || hoverEl) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!visible) {
        // appear where the pointer is, not sliding in from the corner
        r.x = pos.x;
        r.y = pos.y;
        show(true);
      }
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${r.m * 45}deg)`;
      wake();
    };

    const onOver = (e: Event) => {
      const el = e.target as Element | null;
      if (!el || !el.closest) return;
      if (el.closest(TEXT_FIELD)) {
        // text fields keep the system caret/cursor
        html.classList.add("prism-native");
        show(false);
        return;
      }
      html.classList.remove("prism-native");
      if (!visible && pos.x > 0) show(true);
      const target = el.closest(SELECTOR);
      if (target && target !== hoverEl) {
        hoverEl = target;
        hoverLabel = target.getAttribute("data-cursor-label");
        wake();
      }
    };

    const onOut = (e: PointerEvent) => {
      if (!hoverEl) return;
      const to = e.relatedTarget as Node | null;
      if (to && hoverEl.contains(to)) return;
      hoverEl = null;
      hoverLabel = null;
      wake();
    };

    const ripple = () => {
      if (reduced) return;
      const digital = cursorState.digital > 0.5;
      rippleEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      const inner = rippleEl.firstElementChild as HTMLElement | null;
      if (!inner) return;
      inner.style.borderRadius = digital ? "3px" : "50%";
      inner.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.35)", opacity: 0.95 },
          { transform: "translate(-50%, -50%) scale(1.5)", opacity: 0 },
        ],
        { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      down = true;
      ripple();
      wake();
    };
    const onUp = () => {
      down = false;
      wake();
    };
    const onLeave = () => show(false);
    const onEnter = () => {
      if (pos.x > 0) show(true);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    html.addEventListener("mouseleave", onLeave);
    html.addEventListener("mouseenter", onEnter);
    window.addEventListener("blur", onLeave);
    const off = onCursor(wake);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      html.removeEventListener("mouseleave", onLeave);
      html.removeEventListener("mouseenter", onEnter);
      window.removeEventListener("blur", onLeave);
      reducedMq.removeEventListener("change", onReduced);
      off();
      html.classList.remove("has-prism-cursor", "prism-native");
    };
  }, []);

  return (
    <div ref={rootRef} className="prism-cursor" aria-hidden="true" style={{ opacity: 0 }}>
      <div ref={ringRef} className="prism-ring">
        <i className="prism-corner tl" />
        <i className="prism-corner tr" />
        <i className="prism-corner bl" />
        <i className="prism-corner br" />
      </div>
      <div ref={dotRef} className="prism-dot" />
      <span ref={labelRef} className="prism-label" />
      <div ref={rippleRef} className="prism-ripple">
        <span />
      </div>
    </div>
  );
}
