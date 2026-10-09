import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import WorkGrid from "@/components/WorkGrid";

export const metadata: Metadata = {
  title: "All Projects — Pujan Bhatt",
  description: "Full list of selected projects by Pujan Bhatt.",
};

export default function WorkPage() {
  return (
    <main className="relative min-h-screen px-6 md:px-10">
      <Nav />
      <div className="max-w-[1400px] mx-auto pt-32 md:pt-40 pb-10">
        <p className="reveal-text font-display text-xs tracking-[0.25em] uppercase opacity-60 mb-4">
          Archive
        </p>
        <h1 className="reveal-text font-display font-black text-[13vw] md:text-[6.5vw] leading-[0.9] tracking-tight mb-6">
          All Projects
        </h1>
        <p className="reveal-text max-w-md text-sm md:text-base opacity-70 mb-16 md:mb-24">
          Every project, experiment and collaboration — from AI products to
          full-stack builds. Six of these live on the guitar back home.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto pb-32">
        <WorkGrid />
      </div>

      <div className="max-w-[1400px] mx-auto pb-20 flex justify-center">
        <Link href="/" className="pill-btn" data-cursor-hover>
          ← Back home
        </Link>
      </div>
    </main>
  );
}
