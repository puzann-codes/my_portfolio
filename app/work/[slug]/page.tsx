import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import ProjectDiagram from "@/components/ProjectDiagram";
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

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid md:grid-cols-[1fr_2fr] gap-4 md:gap-16 border-t border-[#efe8d6]/15 py-10 md:py-14">
      <h2 id={id} className="text-xs tracking-[0.3em] uppercase opacity-60">
        {title}
      </h2>
      <div className="max-w-2xl text-base md:text-lg leading-relaxed">{children}</div>
    </section>
  );
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const cs = project.caseStudy ?? {};
  const index = ALL_PROJECTS.findIndex((p) => p.slug === slug);
  const next = ALL_PROJECTS[(index + 1) % ALL_PROJECTS.length];
  const prev = ALL_PROJECTS[(index - 1 + ALL_PROJECTS.length) % ALL_PROJECTS.length];
  const stack = cs.stack ?? [];
  const complete = !!(cs.role && cs.architecture && cs.decisions && cs.results);

  return (
    <main className="relative min-h-screen px-6 md:px-10">
      <Nav />
      <div className="max-w-[1400px] mx-auto pt-32 md:pt-40 pb-10">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-xs tracking-[0.3em] uppercase">
          <Link href="/work" data-cursor-hover className="wiggle opacity-60 hover:opacity-100">
            ← All projects
          </Link>
          <Link href="/" data-cursor-hover className="wiggle opacity-60 hover:opacity-100">
            The desk
          </Link>
        </nav>

        <header className="mb-12 md:mb-16">
          <h1 className="uppercase tracking-[0.1em] text-[#f3ecda] text-[10vw] md:text-[5.4vw] leading-[1.06] mb-8">
            {project.title}
          </h1>
          <div className="grid md:grid-cols-[1fr_2fr] gap-8 md:gap-16">
            <dl className="text-sm space-y-5">
              <div>
                <dt className="text-xs tracking-[0.25em] uppercase opacity-50 mb-1">Category</dt>
                <dd>{project.category}</dd>
              </div>
              {project.year && (
                <div>
                  <dt className="text-xs tracking-[0.25em] uppercase opacity-50 mb-1">Year</dt>
                  <dd>{project.year}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs tracking-[0.25em] uppercase opacity-50 mb-2">Tags</dt>
                <dd className="flex flex-wrap gap-2">
                  {project.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2.5 py-1 rounded-full border border-[#efe8d6]/15">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="max-w-xl text-xl md:text-2xl italic leading-snug text-[#efe8d6]/90">{project.summary}</p>
          </div>
        </header>

        {project.flow && (
          <div className="mb-12 md:mb-16 rounded-3xl border border-[#efe8d6]/10 bg-[#efe8d6]/[0.04] p-6 md:p-10">
            <ProjectDiagram flow={project.flow} title={project.title} />
          </div>
        )}

        {cs.problem && (
          <Section id="problem" title="Problem">
            <p>{cs.problem}</p>
          </Section>
        )}

        {cs.role && (
          <Section id="role" title="My role">
            <ul className="list-disc pl-5 space-y-2">
              {cs.role.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        )}

        {cs.architecture && (
          <Section id="architecture" title="Architecture">
            <p>{cs.architecture.summary}</p>
            {cs.architecture.parts && (
              <ul className="list-disc pl-5 space-y-1 mt-4">
                {cs.architecture.parts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {stack.length > 0 && (
          <Section id="stack" title="Technologies">
            <ul className="flex flex-wrap gap-2">
              {stack.map((t) => (
                <li key={t} className="text-sm px-3 py-1 rounded-full border border-[#efe8d6]/25">
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {cs.decisions && (
          <Section id="decisions" title="Engineering decisions">
            <dl className="space-y-5">
              {cs.decisions.map((d) => (
                <div key={d.title}>
                  <dt className="font-semibold">{d.title}</dt>
                  <dd className="opacity-80">{d.detail}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {cs.media && cs.media.length > 0 && (
          <Section id="media" title="Screens and demos">
            <div className="space-y-8">
              {cs.media.map((m) => (
                <figure key={m.src}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- plain img: sizes vary per asset */}
                  <img src={m.src} alt={m.alt} className="w-full rounded-xl border border-[#efe8d6]/10" />
                  {m.caption && <figcaption className="mt-2 text-sm opacity-60">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Section>
        )}

        {cs.results && (
          <Section id="results" title="Results">
            <ul className="list-disc pl-5 space-y-2">
              {cs.results.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        )}

        {cs.limits && cs.limits.length > 0 && (
          <Section id="limits" title="Limits">
            <ul className="list-disc pl-5 space-y-2">
              {cs.limits.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        )}

        {cs.links && cs.links.length > 0 && (
          <Section id="links" title="Links">
            <ul className="space-y-2">
              {cs.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer" data-cursor-hover className="wiggle">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!complete && (
          <div className="border-t border-[#efe8d6]/15 py-10 md:py-14">
            <div className="max-w-2xl rounded-2xl border border-dashed border-[#efe8d6]/25 p-6 md:p-8">
              <p className="text-xs tracking-[0.3em] uppercase opacity-60 mb-3">
                In progress
              </p>
              <p className="text-sm md:text-base leading-relaxed opacity-75">
                The full write-up (role, architecture, engineering decisions and results) is still being written. What is on this page is what I can already stand behind.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-6 border-t border-[#efe8d6]/15 pt-8 pb-20">
          <Link href={`/work/${prev.slug}`} data-cursor-hover data-cursor-label="PREVIOUS" className="wiggle text-sm">
            ← {prev.title}
          </Link>
          <Link href="/" className="pill-btn" data-cursor-hover>
            The desk
          </Link>
          <Link href={`/work/${next.slug}`} data-cursor-hover data-cursor-label="NEXT" className="wiggle text-sm">
            {next.title} →
          </Link>
        </div>
      </div>
    </main>
  );
}
