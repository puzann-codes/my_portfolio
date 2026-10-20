"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";
import { guitarSynth } from "@/lib/audio";
import { sfx } from "@/lib/sfx";
import { useLenis } from "@/lib/lenis-context";
import { prefersReducedMotion } from "@/lib/motion";
import { PROJECT_MARKS } from "@/lib/journey";
import type { Experience } from "@/lib/scene/experience";
import { TOP_PROJECTS } from "@/data/projects";
import ActStage, { type Card } from "@/components/ActStage";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  /** the loader has been dismissed: turn the lamp on */
  go: boolean;
  onLoad: (v: number, label: string) => void;
  onUnsupported: () => void;
};

// index = the director's stage (see STAGE_AT in lib/scene/experience.ts)
const project = (slug: string) => TOP_PROJECTS.find((p) => p.slug === slug)!;
const projectCard = (slug: string): Card => {
  const p = project(slug);
  return {
    numeral: "IV",
    kicker: p.category.split(" · ")[0],
    title: p.title,
    line: p.summary,
    cta: { href: `/work/${p.slug}`, label: "Open the case study" },
  };
};

const CARDS: (Card | null)[] = [
  {
    numeral: "I",
    kicker: "The workspace",
    title: "Pujan Bhatt",
    line: "AI engineer & full-stack developer. Everything on this desk does something. Scroll.",
  },
  {
    numeral: "II",
    kicker: "The input",
    title: "It starts with keystrokes",
    line: "Watch the keys, and the screen. The mouse is doing something too.",
  },
  {
    numeral: "II",
    kicker: "A pause",
    title: "Coffee first",
    line: "Not every part of the process is code.",
  },
  {
    numeral: "III",
    kicker: "The idea",
    title: "An idea is only the beginning",
    line: "A complaint finding its office, evidence becoming a timeline, a loop that investigates.",
  },
  projectCard("sunuwa"),
  projectCard("crash-capsule"),
  projectCard("harvo"),
  projectCard("learnscape-ai"),
  projectCard("mul"),
  {
    numeral: "V",
    kicker: "The stack",
    title: "Linux, code, computer science",
    line: "The part of the stack I like to understand all the way down.",
  },
  {
    numeral: "VI",
    kicker: "Beyond the desk",
    title: "Laptop closed. Let's talk.",
    line: "If you've got something to build (AI, full-stack, or just strange), I'd like to hear about it.",
  },
];

const CONTACT_STAGE = CARDS.length - 1;

// the journey's six acts: label + where to jump
const ACTS = [
  { label: "The workspace", p: 0 },
  { label: "The input", p: 0.07 },
  { label: "The idea", p: 0.2 },
  { label: "The projects", p: 0.3 },
  { label: "The stack", p: 0.83 },
  { label: "Beyond the desk", p: 0.96 },
];

// which of the six acts each director stage belongs to (for the navigation dots)
const ACT_OF_STAGE = [0, 1, 1, 2, 3, 3, 3, 3, 3, 4, 5];


function webglSupported() {
  // `?webgl=off` lets the no-3D fallback be reviewed
  if (new URLSearchParams(window.location.search).get("webgl") === "off") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function DeskJourney({ go, onLoad, onUnsupported }: Props) {
  const router = useRouter();
  const lenis = useLenis();
  const containerRef = useRef<HTMLElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  // the canvas is created per mount (see the effect): a WebGL context that has been
  // released can never be handed back to a new renderer
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const expRef = useRef<Experience | null>(null);
  const goRef = useRef(go);
  const onLoadRef = useRef(onLoad);
  const onUnsupportedRef = useRef(onUnsupported);
  const lenisRef = useRef(lenis);
  const [stage, setStage] = useState(0);
  const [tip, setTip] = useState<{ title: string } | null>(null);
  const [note, setNote] = useState<{ title: string; text: string } | null>(null);
  const [reduced, setReduced] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onUnsupportedRef.current = onUnsupported;
    lenisRef.current = lenis;
  });

  useEffect(() => {
    goRef.current = go;
    if (go) expRef.current?.intro();
  }, [go]);

  // reduced motion is read once; it also shortens the journey
  useEffect(() => {
    // media queries are client-only, so this can't seed initial state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(prefersReducedMotion());
  }, []);

  const showNote = useCallback((title: string, text: string) => {
    setNote({ title, text });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 9000);
  }, []);

  // notes belong to the moment they were opened in
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote(null);
  }, [stage]);

  const jumpTo = useCallback((p: number) => {
    const container = containerRef.current;
    if (!container) return;
    const y = container.offsetTop + p * (container.offsetHeight - window.innerHeight);
    const l = lenisRef.current;
    if (l) l.scrollTo(y, { duration: prefersReducedMotion() ? 0 : 1.8 });
    else window.scrollTo({ top: y });
  }, []);

  // "skip" goes straight to the first project's act
  const skipIntro = useCallback(() => jumpTo(PROJECT_MARKS[0]), [jumpTo]);

  useEffect(() => {
    const host = canvasHostRef.current;
    const container = containerRef.current;
    const sticky = stickyRef.current;
    if (!host || !container || !sticky) return;
    // Each mount (StrictMode, Fast Refresh, a route change) gets its own canvas, because
    // disposing an experience deliberately loses its context, and a lost context left on a
    // reused canvas makes the next WebGLRenderer throw "reading 'precision'".
    const makeCanvas = () => {
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.className = "absolute inset-0 block h-full w-full";
      c.addEventListener("webglcontextcreationerror", (e) =>
        console.warn("WebGL context creation error:", (e as WebGLContextEvent).statusMessage)
      );
        host.appendChild(c);
      return c;
    };
    let canvas = makeCanvas();

    let cancelled = false;
    let st: ScrollTrigger | null = null;
    let io: IntersectionObserver | null = null;
    const cleanups: (() => void)[] = [];

    // A tick later, so React StrictMode's throwaway first mount never
    // creates a WebGL context that its cleanup would then tear down.
    const timer = setTimeout(async () => {
      if (!webglSupported()) {
        onUnsupportedRef.current();
        return;
      }
      const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800;
      const reducedMotion = prefersReducedMotion();

      const { createExperience } = await import("@/lib/scene/experience");
      if (cancelled) return;
      let exp: Experience | null = null;
      // Safari can hand back a context that is already lost when contexts are recycled quickly
      // (it fails inside the renderer's constructor): retry once on a fresh canvas.
      for (let attempt = 0; attempt < 3 && !exp; attempt++) {
        if (attempt > 0) {
          canvas.remove();
          canvas = makeCanvas();
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;
        }
      try {
        exp = await createExperience({
          canvas,
          lowPower: lowPower || attempt > 0,
          simpleContext: attempt > 0,
          reduced: reducedMotion,
          onLoad: (v, label) => onLoadRef.current(v, label),
          onStage: setStage,
          onVeil: (o) => {
            if (veilRef.current) veilRef.current.style.opacity = String(o);
          },
          onHover: (info) => setTip(info ? { title: info.title } : null),
          onLampOn: () => guitarSynth.click(),
          // the choreography's own keystrokes, and the click that opens the code
          onKey: (code, down) => (down ? sfx.keyDown(code) : sfx.keyUp(code)),
          onClick: () => sfx.click(),
        });
      } catch (err) {
        console.warn("desk journey failed to start", err);
      }
      }
      if (!exp) {
        onUnsupportedRef.current();
        return;
      }
      if (cancelled) {
        exp.dispose();
        return;
      }
      expRef.current = exp;
      // `?stats=1` exposes what a frame costs, for checking the scene's budget
      if (new URLSearchParams(window.location.search).get("stats") === "1") {
        const w = window as unknown as { __stats?: () => unknown; __audio?: unknown };
        w.__stats = () => exp.stats();
        w.__audio = { sfx, guitarSynth };
      }
      if (goRef.current) exp.intro();

      st = ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => exp.setProgress(self.progress),
      });
      exp.setProgress(st.progress);

      io = new IntersectionObserver(([e]) => exp.setActive(e.isIntersecting), { rootMargin: "100px" });
      io.observe(sticky);

      const onMove = (e: PointerEvent) => {
        exp.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
        exp.hover(e.clientX, e.clientY);
        if (tipRef.current) {
          tipRef.current.style.transform = `translate3d(${e.clientX + 18}px, ${e.clientY + 22}px, 0)`;
        }
      };
      const onLeave = () => exp.leave();
      const onClick = (e: MouseEvent) => {
        const hit = exp.click(e.clientX, e.clientY);
        if (!hit) return;
        if (hit.type === "project") router.push(`/work/${hit.slug}`);
        else if (hit.type === "note") showNote(hit.title, hit.note);
        else if (hit.type === "jump") jumpTo(hit.p);
      };
      const onKey = (down: boolean) => (e: KeyboardEvent) => {
        if (e.repeat) return;
        const el = e.target as HTMLElement | null;
        if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        exp.key(e.code, down);
        if (down) {
          if (e.key === "Escape") setNote(null);
          sfx.keyDown(e.code);
        } else sfx.keyUp(e.code);
      };
      const kd = onKey(true);
      const ku = onKey(false);
      const onResize = () => exp.resize();
      canvas.addEventListener("pointermove", onMove, { passive: true });
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("click", onClick);
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("resize", onResize);
      cleanups.push(() => {
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("click", onClick);
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("resize", onResize);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (noteTimer.current) clearTimeout(noteTimer.current);
      st?.kill();
      io?.disconnect();
      cleanups.forEach((c) => c());
      expRef.current?.dispose();
      expRef.current = null;
      canvas.remove();
    };
  }, [router, showNote, jumpTo]);

  const act = ACT_OF_STAGE[stage] ?? 0;

  return (
    <section
      id="journey"
      ref={containerRef}
      aria-label="Interactive workspace"
      className="relative w-full bg-black text-white"
      style={{ height: reduced ? "1300vh" : "2600vh" }}
    >
      <div ref={stickyRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <div ref={canvasHostRef} className="absolute inset-0" />

        {/* screen-reader and no-3D route into the work: same content, plain links */}
        <nav aria-label="Projects" className="sr-only">
          <h1>Pujan Bhatt — AI Engineer &amp; Full-Stack Developer</h1>
          <ul>
            {TOP_PROJECTS.map((p) => (
              <li key={p.slug}>
                <Link href={`/work/${p.slug}`}>
                  {p.title}: {p.category}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/work">All projects</Link>
            </li>
            <li>
              <a href="mailto:rohitpoudel020@gmail.com">Email</a>
            </li>
          </ul>
        </nav>

        {/* a soft vignette so the scene sits in the dark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 48%, transparent 58%, rgba(0,0,0,0.5) 100%)",
          }}
        />

        {/* crossing the screen / leaving the machine */}
        <div
          ref={veilRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: 0 }}
        />

        {/* the acts: centred title cards, then a quiet subtitle */}
        <ActStage
          onPlay={(s) => sfx.transition(s === 4 ? "enter" : s === CONTACT_STAGE ? "close" : "act", s)}
          stage={stage}
          cards={CARDS}
          live={go}
          reduced={reduced}
          endStage={CONTACT_STAGE}
          onReplay={() => jumpTo(0)}
        />

        {/* a soft shade at the foot of the frame keeps the subtitles legible over the white desk */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] bg-gradient-to-t from-black/70 via-black/30 to-transparent transition-opacity duration-1000 ${
            stage === 0 ? "opacity-60" : "opacity-100"
          }`}
        />

        {/* scroll hint */}
        <div
          className={`pointer-events-none absolute left-6 md:left-10 bottom-6 md:bottom-8 hidden md:flex flex-col items-start gap-3 transition-opacity duration-700 ${
            stage === 0 ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="font-display text-[11px] tracking-[0.35em] uppercase text-white/60">
            Scroll
          </span>
          <span className="scroll-line block h-10 w-px bg-white/50" />
        </div>

        {/* skip: the work is one click away for anyone who doesn't want the journey */}
        <button
          type="button"
          onClick={skipIntro}
          data-cursor-label="SKIP"
          className="absolute right-6 md:right-10 top-6 md:top-8 text-[11px] md:text-xs tracking-[0.3em] uppercase text-[#efe8d6]/70 hover:text-[#efe8d6] border border-[#efe8d6]/30 hover:border-[#efe8d6]/80 px-4 py-2 transition-colors"
        >
          Skip to the work →
        </button>

        {/* act navigation */}
        <nav
          aria-label="Journey acts"
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 hidden sm:block"
        >
          <ul className="flex flex-col gap-3">
            {ACTS.map((a, i) => (
              <li key={a.label}>
                <button
                  type="button"
                  onClick={() => jumpTo(a.p)}
                  aria-label={`Go to ${a.label}`}
                  aria-current={act === i ? "step" : undefined}
                  data-cursor-label={a.label.toUpperCase()}
                  className="group flex h-4 w-4 items-center justify-center"
                >
                  <span
                    className={`block rounded-full transition-all duration-300 ${
                      act === i ? "h-2.5 w-2.5 bg-white" : "h-1.5 w-1.5 bg-white/40 group-hover:bg-white/80"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* a note found on the desk (keyboard, posters) */}
        <div
          role="status"
          aria-live="polite"
          className={`absolute right-4 md:right-10 bottom-24 md:bottom-28 max-w-[min(22rem,88vw)] transition-all duration-500 ${
            note ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
          }`}
        >
          {note && (
            <div className="rounded-xl border border-white/20 bg-[#0d0e11]/85 backdrop-blur-md p-4 shadow-xl shadow-black/40">
              <div className="flex items-start justify-between gap-4">
                <p className="font-display text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2">
                  {note.title}
                </p>
                <button
                  type="button"
                  onClick={() => setNote(null)}
                  aria-label="Close note"
                  className="-mt-1 -mr-1 p-1 text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm leading-relaxed text-white/85">{note.text}</p>
            </div>
          )}
        </div>

        {/* hover title for whatever object the pointer is over */}
        <div
          ref={tipRef}
          aria-hidden="true"
          className={`pointer-events-none fixed left-0 top-0 z-30 transition-opacity duration-200 ${
            tip ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="bg-[#0a0a0b]/90 text-[#efe8d6] border border-[#efe8d6]/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] whitespace-nowrap">
            {tip?.title}
          </div>
        </div>
      </div>
    </section>
  );
}
