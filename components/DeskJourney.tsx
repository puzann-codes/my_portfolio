"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";
import Mascot from "@/components/Mascot";
import { guitarSynth } from "@/lib/audio";
import { useLenis } from "@/lib/lenis-context";
import { prefersReducedMotion } from "@/lib/motion";
import type { Experience } from "@/lib/scene/experience";
import { TOP_PROJECTS } from "@/data/projects";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  /** the loader has been dismissed: turn the lamp on */
  go: boolean;
  onLoad: (v: number, label: string) => void;
  onUnsupported: () => void;
};

type StageInfo = {
  act: number;
  kicker: string;
  title: string;
  line: string;
  cta?: { href: string; label: string };
};

// index = the director's stage (see STAGE_AT in lib/scene/experience.ts)
const project = (slug: string) => TOP_PROJECTS.find((p) => p.slug === slug)!;
const placeholderLine = (slug: string) => project(slug).tags.join(" · ");

const STAGES: (StageInfo | null)[] = [
  null,
  {
    act: 1,
    kicker: "Act 02 — The input",
    title: "It starts with keystrokes",
    line: "Watch the keys, and the screen. The mouse is doing something too.",
  },
  {
    act: 1,
    kicker: "Act 02 — A pause",
    title: "Coffee first",
    line: "Not every part of the process is code.",
  },
  {
    act: 2,
    kicker: "Act 03 — The idea",
    title: "An idea is only the beginning",
    line: "Three sketches: a complaint finding its office, evidence becoming a timeline, an agent loop.",
  },
  {
    act: 3,
    kicker: "Act 04 — Sunūwā",
    title: "A citizen–government complaint platform",
    line: "Complaints that get routed to the right place.",
    cta: { href: "/work/sunuwa", label: "Open case study" },
  },
  {
    act: 3,
    kicker: "Act 04 — Crash Capsule",
    title: "Post-crash evidence reconstruction",
    line: "A concept for turning scattered evidence into a replayable timeline.",
    cta: { href: "/work/crash-capsule", label: "Open case study" },
  },
  {
    act: 3,
    kicker: "Act 04 — Agentic AI",
    title: "Hackathon work on agentic systems",
    line: "An architecture built from connected components.",
    cta: { href: "/work/agentic-ai-hackathon", label: "Open case study" },
  },
  {
    act: 3,
    kicker: "Act 04 — Signal Atlas",
    title: project("signal-atlas").category,
    line: placeholderLine("signal-atlas"),
    cta: { href: "/work/signal-atlas", label: "Open case study" },
  },
  {
    act: 3,
    kicker: "Act 04 — Nova Render",
    title: project("nova-render").category,
    line: placeholderLine("nova-render"),
    cta: { href: "/work/nova-render", label: "Open case study" },
  },
  {
    act: 3,
    kicker: "Act 04 — Harbor CMS",
    title: project("harbor-cms").category,
    line: placeholderLine("harbor-cms"),
    cta: { href: "/work/harbor-cms", label: "Open case study" },
  },
  {
    act: 4,
    kicker: "Act 05 — The stack",
    title: "Linux, code, computer science",
    line: "The part of the stack I like to understand all the way down.",
  },
  null,
];

const CONTACT_STAGE = STAGES.length - 1;

// the journey's six acts: label + where to jump
const ACTS = [
  { label: "The workspace", p: 0 },
  { label: "The input", p: 0.07 },
  { label: "The idea", p: 0.2 },
  { label: "The projects", p: 0.3 },
  { label: "The stack", p: 0.83 },
  { label: "Beyond the desk", p: 0.96 },
];

const INKY_QUIPS = [
  "Hi, I'm Inky. I live in the laptop.",
  "Try pressing some keys.",
  "Scroll. It gets weirder.",
  "Poke the posters. And the notebook.",
];

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const skipIntro = useCallback(() => {
    const target = document.getElementById("top-works");
    if (!target) return;
    const l = lenisRef.current;
    if (l) l.scrollTo(target, { duration: 1.2 });
    else target.scrollIntoView();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const sticky = stickyRef.current;
    if (!canvas || !container || !sticky) return;

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
      let exp: Experience;
      try {
        exp = await createExperience({
          canvas,
          lowPower,
          reduced: reducedMotion,
          onLoad: (v, label) => onLoadRef.current(v, label),
          onStage: setStage,
          onVeil: (o) => {
            if (veilRef.current) veilRef.current.style.opacity = String(o);
          },
          onHover: (info) => setTip(info ? { title: info.title } : null),
          onLampOn: () => guitarSynth.click(),
          onKeyTick: () => guitarSynth.tick(),
        });
      } catch (err) {
        console.warn("desk journey failed to start", err);
        onUnsupportedRef.current();
        return;
      }
      if (cancelled) {
        exp.dispose();
        return;
      }
      expRef.current = exp;
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
          else guitarSynth.tick();
        }
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
    };
  }, [router, showNote, jumpTo]);

  const info = STAGES[stage];
  const act = stage === 0 ? 0 : stage === CONTACT_STAGE ? 5 : (info?.act ?? 0);

  return (
    <section
      id="journey"
      ref={containerRef}
      aria-label="Interactive workspace"
      className="relative w-full bg-black text-white"
      style={{ height: reduced ? "1300vh" : "2600vh" }}
    >
      <div ref={stickyRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />

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

        {/* Act 01: a quiet introduction that leaves the desk uncovered */}
        <div
          className={`pointer-events-none absolute left-6 md:left-10 bottom-8 md:bottom-12 max-w-[min(26rem,80vw)] transition-all duration-700 ${
            stage === 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <p className="font-display text-[11px] tracking-[0.3em] uppercase text-white/55 mb-2">
            Act 01 — The workspace
          </p>
          <p className="font-display font-extrabold text-xl md:text-2xl tracking-tight">Pujan Bhatt</p>
          <p className="text-sm md:text-base leading-relaxed text-white/75 mt-1">
            AI engineer &amp; full-stack developer. Everything on this desk does something. Scroll.
          </p>
        </div>

        {/* acts 02 – 05 */}
        <div className="absolute left-6 md:left-10 bottom-8 md:bottom-12 max-w-[min(32rem,86vw)]">
          {STAGES.map((s, i) =>
            s ? (
              <div
                key={i}
                aria-hidden={stage !== i}
                className={`transition-all duration-700 ease-out ${
                  stage === i
                    ? "opacity-100 translate-y-0"
                    : "pointer-events-none opacity-0 translate-y-3 absolute left-0 bottom-0"
                }`}
              >
                <p className="font-display text-[11px] tracking-[0.3em] uppercase text-white/55 mb-3">
                  {s.kicker}
                </p>
                <h2 className="font-display font-bold text-xl md:text-3xl leading-tight tracking-tight mb-2">
                  {s.title}
                </h2>
                <p className="text-sm md:text-base leading-relaxed text-white/80">{s.line}</p>
                {s.cta && (
                  <Link
                    href={s.cta.href}
                    data-cursor-label="OPEN PROJECT"
                    className="pill-btn pill-btn-dark mt-5 pointer-events-auto text-xs"
                    tabIndex={stage === i ? 0 : -1}
                  >
                    {s.cta.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </div>
            ) : null
          )}
        </div>

        {/* scroll hint */}
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 md:bottom-8 flex flex-col items-center gap-3 transition-opacity duration-700 ${
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
          className="absolute right-6 md:right-10 top-20 md:top-24 text-[11px] md:text-xs tracking-[0.2em] uppercase text-white/70 hover:text-white border border-white/25 hover:border-white/70 rounded-full px-4 py-2 transition-colors"
        >
          Skip the intro ↓
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

        {/* Inky lives on the desk */}
        <div
          className={`absolute right-5 md:right-10 bottom-6 md:bottom-10 transition-opacity duration-700 ${
            stage === 0 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Mascot quips={INKY_QUIPS} size={60} tone="light" />
        </div>

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

        {/* Act 06: beyond the desk */}
        <div
          className={`absolute inset-x-0 bottom-0 flex justify-start md:justify-end px-6 md:px-14 pb-8 md:pb-10 transition-all duration-1000 ${
            stage === CONTACT_STAGE ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={stage !== 9}
        >
          <div className="max-w-md rounded-2xl bg-black/45 backdrop-blur-sm p-5 md:p-6">
            <p className="font-display text-[11px] tracking-[0.3em] uppercase text-white/55 mb-4">
              Act 06 — Beyond the desk
            </p>
            <h2 className="font-display font-black text-[9vw] md:text-[2.8vw] leading-[0.98] tracking-tight mb-4">
              Laptop closed.
              <br />
              Let&apos;s talk.
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-white/75 mb-5">
              If you&apos;ve got something to build (AI, full-stack, or just strange), I&apos;d like
              to hear about it.
            </p>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <li>
                <a
                  href="mailto:rohitpoudel020@gmail.com"
                  data-cursor-label="EMAIL"
                  tabIndex={stage === CONTACT_STAGE ? 0 : -1}
                  className="pill-btn pill-btn-dark"
                >
                  Say hello
                  <span aria-hidden="true">→</span>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={stage === CONTACT_STAGE ? 0 : -1}
                  className="wiggle text-white/85"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={stage === CONTACT_STAGE ? 0 : -1}
                  className="wiggle text-white/85"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <Link href="/work" tabIndex={stage === CONTACT_STAGE ? 0 : -1} className="wiggle text-white/85">
                  All projects
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => jumpTo(0)}
                  tabIndex={stage === CONTACT_STAGE ? 0 : -1}
                  className="wiggle text-white/55"
                >
                  Replay from the top
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* hover title for whatever object the pointer is over */}
        <div
          ref={tipRef}
          aria-hidden="true"
          className={`pointer-events-none fixed left-0 top-0 z-30 transition-opacity duration-200 ${
            tip ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="rounded-md bg-[#0d0e11]/90 text-white border border-white/20 px-3 py-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap">
            {tip?.title}
          </div>
        </div>
      </div>
    </section>
  );
}
