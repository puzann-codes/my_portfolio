import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import WorkGrid from "@/components/WorkGrid";

export const metadata: Metadata = {
  title: "All Projects — Pujan Bhatt",
  description: "Every project by Pujan Bhatt, each in its own world.",
};

export default function WorkPage() {
  return (
    <main className="relative min-h-screen px-6 md:px-10">
      <Nav />
      <div className="max-w-[1400px] mx-auto pt-36 md:pt-44 pb-12 md:pb-20 text-center">
        <div className="mx-auto mb-6 flex w-full max-w-[40rem] items-center justify-center gap-5">
          <span className="h-px flex-1 bg-gradient-to-l from-[#efe8d6]/50 to-transparent" />
          <span className="whitespace-nowrap text-[0.72rem] md:text-xs uppercase tracking-[0.36em] text-[#efe8d6]/75">
            Act IV &middot; The work
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#efe8d6]/50 to-transparent" />
        </div>
        <h1
          className="uppercase tracking-[0.12em] text-[#f3ecda] leading-[1.08]"
          style={{ fontSize: "clamp(2.2rem, 8vw, 7rem)" }}
        >
          All projects
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg md:text-xl italic leading-snug text-[#efe8d6]/80">
          Five projects, each with a world of its own. Pick one and the camera goes in.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto pb-24">
        <WorkGrid />
      </div>

      <div className="max-w-[1400px] mx-auto pb-24 flex justify-center">
        <Link href="/" className="pill-btn" data-cursor-hover>
          &larr; Back to the desk
        </Link>
      </div>
    </main>
  );
}
