import type { Flow } from "@/data/projects";

/**
 * A plain left-to-right flow of the steps a project's own documentation
 * describes. It is a reading aid, not an architecture diagram: every label is
 * lifted from the project's materials.
 */
export default function ProjectDiagram({ flow, title }: { flow: Flow; title: string }) {
  const n = flow.steps.length;
  return (
    <figure className="w-full">
      <ol
        aria-label={`${title}: ${flow.steps.join(", then ")}`}
        className="grid gap-3 md:gap-0"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {flow.steps.map((s, i) => (
          <li key={s} className="relative flex md:flex-col items-start gap-3 md:gap-4 md:pr-4">
            <span className="font-display text-[11px] tracking-[0.2em] opacity-50 md:mb-0 shrink-0">{String(i + 1).padStart(2, "0")}</span>
            <span className="hidden md:block absolute left-9 right-0 top-[7px] h-px bg-black/25" aria-hidden="true" />
            <span className="relative text-sm md:text-[15px] leading-snug">{s}</span>
          </li>
        ))}
      </ol>
      {flow.loop && <p className="mt-4 text-xs opacity-55">↺ The last step feeds back into the first.</p>}
      <figcaption className="mt-3 text-xs opacity-55">{flow.caption}</figcaption>
    </figure>
  );
}
