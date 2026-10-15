import Link from "next/link";
import Nav from "@/components/Nav";
import { TOP_PROJECTS } from "@/data/projects";

/**
 * What a visitor without WebGL gets: the opening title card, held still, and
 * the work as plain links. Same room, same type, no 3D.
 */
export default function Hero() {
  return (
    <section className="relative min-h-[100svh] w-full flex flex-col items-center justify-center px-6 py-32 text-center">
      <Nav />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(239,232,214,0.07), transparent 70%)" }}
      />
      <div className="relative flex w-full max-w-[46rem] items-center justify-center gap-5 mb-6">
        <span className="h-px flex-1 bg-gradient-to-l from-[#efe8d6]/50 to-transparent" />
        <span className="whitespace-nowrap text-[0.72rem] md:text-xs uppercase tracking-[0.36em] text-[#efe8d6]/75">
          Act I &middot; The workspace
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-[#efe8d6]/50 to-transparent" />
      </div>
      <h1
        className="relative uppercase tracking-[0.12em] text-[#f3ecda] leading-[1.08] whitespace-nowrap"
        style={{ fontSize: "clamp(2.2rem, 9vw, 8rem)", animation: "fadein 1.2s ease both" }}
      >
        Pujan Bhatt
      </h1>
      <p className="relative mt-6 max-w-xl text-lg md:text-xl italic leading-snug text-[#efe8d6]/85">
        AI engineer &amp; full-stack developer. Building things that think, ship and scale.
      </p>

      <ul className="relative mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs uppercase tracking-[0.28em]">
        {TOP_PROJECTS.map((p) => (
          <li key={p.slug}>
            <Link href={`/work/${p.slug}`} className="wiggle text-[#efe8d6]/85">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
      <div className="relative mt-12 flex flex-wrap items-center justify-center gap-5">
        <Link href="/work" className="pill-btn">
          All projects <span aria-hidden="true">&rarr;</span>
        </Link>
        <a href="mailto:rohitpoudel020@gmail.com" className="pill-btn">
          Say hello
        </a>
      </div>
    </section>
  );
}
