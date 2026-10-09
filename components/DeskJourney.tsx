"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Mascot from "@/components/Mascot";
import { guitarSynth } from "@/lib/audio";
import type { Experience } from "@/lib/scene/experience";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  /** the loader has been dismissed — turn the lamp on */
  go: boolean;
  onLoad: (v: number, label: string) => void;
  onUnsupported: () => void;
};

const STAGES: ({ n: string; name: string; line: string } | null)[] = [
  null,
  {
    n: "01",
    name: "Terminal",
    line: "Linux, programming and computer science. Arch, i3, and a config file I'll never finish.",
  },
  {
    n: "02",
    name: "Neural network",
    line: "AI and agentic systems: models that plan, call tools and check their own work.",
  },
  {
    n: "03",
    name: "City grid",
    line: "Sunūwā. Civic technology, built like a city: a lot of small parts that have to work together.",
  },
  {
    n: "04",
    name: "Crash reconstruction",
    line: "Crash Capsule. Rebuilding an accident from the evidence, then replaying it.",
  },
  {
    n: "05",
    name: "Workshop",
    line: "Experiments, prototypes and unfinished ideas. Click anything on the bench.",
  },
  null,
];

const INKY_QUIPS = [
  "Hi, I'm Inky. I live in the laptop.",
  "Try pressing some keys.",
  "Scroll. It gets weirder.",
  "Careful, I stain.",
];

function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function DeskJourney({ go, onLoad, onUnsupported }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const expRef = useRef<Experience | null>(null);
  const goRef = useRef(go);
  const onLoadRef = useRef(onLoad);
  const onUnsupportedRef = useRef(onUnsupported);
  const [stage, setStage] = useState(0);
  const [tip, setTip] = useState<{ title: string } | null>(null);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onUnsupportedRef.current = onUnsupported;
  });

  useEffect(() => {
    goRef.current = go;
    if (go) expRef.current?.intro();
  }, [go]);

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
      const lowPower =
        window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800;

      const { createExperience } = await import("@/lib/scene/experience");
      if (cancelled) return;
      let exp: Experience;
      try {
        exp = await createExperience({
          canvas,
          lowPower,
          onLoad: (v, label) => onLoadRef.current(v, label),
          onStage: setStage,
          onVeil: (o) => {
            if (veilRef.current) veilRef.current.style.opacity = String(o);
          },
          onHover: (info) => {
            setTip(info ? { title: info.title } : null);
            canvas.style.cursor = info ? "pointer" : "";
            // keep the custom dot's hover grow in sync
            if (info) canvas.setAttribute("data-cursor-hover", "");
            canvas.dispatchEvent(new PointerEvent(info ? "pointerover" : "pointerout", { bubbles: true }));
            if (!info) canvas.removeAttribute("data-cursor-hover");
          },
          onLampOn: () => guitarSynth.click(),
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
          tipRef.current.style.transform = `translate3d(${e.clientX + 18}px, ${e.clientY + 18}px, 0)`;
        }
      };
      const onClick = (e: MouseEvent) => {
        const slug = exp.click(e.clientX, e.clientY);
        if (slug) router.push(`/work/${slug}`);
      };
      const onKey = (down: boolean) => (e: KeyboardEvent) => {
        if (e.repeat) return;
        exp.key(e.code, down);
        if (down && !(e.target instanceof HTMLInputElement)) guitarSynth.tick();
      };
      const kd = onKey(true);
      const ku = onKey(false);
      const onResize = () => exp.resize();
      canvas.addEventListener("pointermove", onMove, { passive: true });
      canvas.addEventListener("click", onClick);
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("resize", onResize);
      cleanups.push(() => {
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("click", onClick);
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("resize", onResize);
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      st?.kill();
      io?.disconnect();
      cleanups.forEach((c) => c());
      expRef.current?.dispose();
      expRef.current = null;
    };
  }, [router]);

  return (
    <section
      id="journey"
      ref={containerRef}
      className="relative w-full bg-black text-white"
      style={{ height: "1400vh" }}
    >
      <div ref={stickyRef} className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

        {/* soft vignette so the scene sits in the dark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* crossing the screen / leaving the machine */}
        <div
          ref={veilRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: 0 }}
        />

        {/* stage caption */}
        <div className="pointer-events-none absolute left-6 md:left-10 bottom-8 md:bottom-12 max-w-[min(34rem,85vw)]">
          {STAGES.map((s, i) =>
            s ? (
              <div
                key={s.n}
                className={`transition-all duration-700 ease-out ${
                  stage === i
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-3 absolute left-0 bottom-0"
                }`}
              >
                <p className="font-display text-xs tracking-[0.3em] uppercase text-white/55 mb-3">
                  {s.n} / 05 — {s.name}
                </p>
                <p className="text-sm md:text-base leading-relaxed text-white/85">{s.line}</p>
              </div>
            ) : null
          )}
        </div>

        {/* desk: scroll hint */}
        <div
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 md:bottom-8 flex flex-col items-center gap-3 transition-opacity duration-700 ${
            stage === 0 ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="font-display text-[11px] tracking-[0.35em] uppercase text-white/60">
            Scroll to enter
          </span>
          <span className="scroll-line block h-10 w-px bg-white/50" />
        </div>

        {/* Inky lives on the desk */}
        <div
          className={`absolute right-5 md:right-10 bottom-6 md:bottom-10 transition-opacity duration-700 ${
            stage === 0 || stage === 6 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Mascot quips={INKY_QUIPS} size={64} tone="light" />
        </div>

        {/* back to reality */}
        <div
          className={`absolute inset-0 flex items-end md:items-center justify-start md:justify-end px-6 md:px-14 pb-10 md:pb-0 transition-all duration-1000 ${
            stage === 6 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="max-w-md">
            <p className="font-display text-xs tracking-[0.3em] uppercase text-white/55 mb-4">
              06 — Back to reality
            </p>
            <h2 className="font-display font-black text-[11vw] md:text-[4.6vw] leading-[0.95] tracking-tight mb-5">
              Laptop closed.
              <br />
              Let&apos;s talk.
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-white/75 mb-6">
              Thanks for walking through the machine. If you&apos;ve got something to build
              (AI, full-stack, or just strange), I&apos;d like to hear about it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="mailto:rohitpoudel020@gmail.com"
                data-cursor-hover
                className="pill-btn pill-btn-dark"
              >
                Say hello
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                data-cursor-hover
                className="wiggle text-sm text-white/80"
              >
                LinkedIn
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                data-cursor-hover
                className="wiggle text-sm text-white/80"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>

        {/* workshop hover label */}
        <div
          ref={tipRef}
          className={`pointer-events-none fixed left-0 top-0 z-30 transition-opacity duration-200 ${
            tip ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="rounded-full bg-white text-black px-4 py-2 text-xs font-semibold tracking-wide whitespace-nowrap">
            {tip?.title} <span aria-hidden="true">↗</span>
          </div>
        </div>
      </div>
    </section>
  );
}
