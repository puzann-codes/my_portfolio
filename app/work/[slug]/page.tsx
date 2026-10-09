import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import { ALL_PROJECTS, getProject } from "@/data/projects";

export function generateStaticParams() {
  return ALL_PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title} — Pujan Bhatt`,
    description: project.summary,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const index = ALL_PROJECTS.findIndex((p) => p.slug === slug);
  const next = ALL_PROJECTS[(index + 1) % ALL_PROJECTS.length];
  const prev = ALL_PROJECTS[(index - 1 + ALL_PROJECTS.length) % ALL_PROJECTS.length];

  return (
    <main className="relative min-h-screen px-6 md:px-10">
      <Nav />
      <div className="max-w-[1400px] mx-auto pt-32 md:pt-40 pb-10">
        <Link
          href="/work"
          data-cursor-hover
          className="wiggle font-display text-xs tracking-[0.25em] uppercase opacity-60 mb-6 inline-block"
        >
          ← All projects
        </Link>
        <h1 className="ink-text font-display font-black text-[13vw] md:text-[7vw] leading-[0.92] tracking-tight mb-10">
          {project.title}
        </h1>

        <div className="grid md:grid-cols-[1fr_2fr] gap-8 md:gap-16 mb-16 md:mb-24">
          <dl className="text-sm space-y-5">
            <div>
              <dt className="text-xs tracking-widest uppercase opacity-50 mb-1">Category</dt>
              <dd>{project.category}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-widest uppercase opacity-50 mb-1">Year</dt>
              <dd>{project.year}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-widest uppercase opacity-50 mb-2">Stack</dt>
              <dd className="flex flex-wrap gap-2">
                {project.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2.5 py-1 rounded-full border border-black/15">
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          <p className="ink-text max-w-xl text-lg md:text-2xl leading-snug">{project.summary}</p>
        </div>

        <div
          className="w-full aspect-[16/8] rounded-3xl flex items-center justify-center mb-16 md:mb-24"
          style={{ background: project.color }}
        >
          <span className="font-display font-black text-white/10 text-[22vw] md:text-[14vw] select-none">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div className="max-w-2xl mb-24 md:mb-32 border border-dashed border-black/25 rounded-2xl p-6 md:p-8">
          <p className="font-display text-xs tracking-[0.25em] uppercase opacity-60 mb-3">
            Case study
          </p>
          <p className="text-sm md:text-base leading-relaxed opacity-75">
            The full write-up (problem, approach, what shipped, what I&apos;d change) is coming
            soon. For now, this page is the placeholder the workshop bench opens.
          </p>
        </div>

        <div className="flex items-center justify-between gap-6 border-t border-black/15 pt-8 pb-20">
          <Link href={`/work/${prev.slug}`} data-cursor-hover className="wiggle text-sm">
            ← {prev.title}
          </Link>
          <Link href="/" className="pill-btn" data-cursor-hover>
            Back to the desk
          </Link>
          <Link href={`/work/${next.slug}`} data-cursor-hover className="wiggle text-sm">
            {next.title} →
          </Link>
        </div>
      </div>
    </main>
  );
}
