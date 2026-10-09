import type { Project } from "@/data/projects";

/**
 * The same three sketches that are drawn in the notebook on the desk, as
 * plain SVG. They show the *idea* of each project from its one-line
 * description. They are not claims about how it is built.
 */
export default function ProjectDiagram({ kind }: { kind: NonNullable<Project["diagram"]> }) {
  const stroke = "currentColor";
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const label = { fill: "currentColor", fontSize: 15, textAnchor: "middle" as const, fontFamily: "var(--font-hand), cursive" };

  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 640 220"
        role="img"
        aria-label={
          kind === "routing"
            ? "Sketch: a citizen's complaint is routed to the right government office"
            : kind === "timeline"
              ? "Sketch: evidence is ordered into a timeline"
              : "Sketch: a loop of connected components that plan, act and check"
        }
        className="w-full h-auto text-black/80"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10" {...common} strokeWidth={1.6} />
          </marker>
        </defs>

        {kind === "routing" && (
          <g>
            <circle cx="110" cy="100" r="42" {...common} />
            <rect x="250" y="62" width="140" height="76" rx="6" {...common} />
            <circle cx="530" cy="100" r="42" {...common} />
            <path d="M156 100H244" {...common} markerEnd="url(#arrow)" />
            <path d="M396 100H484" {...common} markerEnd="url(#arrow)" />
            <text x="110" y="176" {...label}>citizen</text>
            <text x="320" y="176" {...label}>routing</text>
            <text x="530" y="176" {...label}>government</text>
          </g>
        )}

        {kind === "timeline" && (
          <g>
            <path d="M50 108H590" {...common} />
            {[120, 250, 390, 520].map((x) => (
              <g key={x}>
                <path d={`M${x} 90V126`} {...common} />
                <circle cx={x} cy="70" r="9" {...common} />
              </g>
            ))}
            <text x="120" y="164" {...label}>evidence</text>
            <text x="320" y="164" {...label}>scene</text>
            <text x="520" y="164" {...label}>timeline</text>
          </g>
        )}

        {kind === "agents" && (
          <g>
            <circle cx="150" cy="140" r="34" {...common} />
            <circle cx="320" cy="64" r="34" {...common} />
            <circle cx="490" cy="140" r="34" {...common} />
            <path d="M180 124L290 76" {...common} markerEnd="url(#arrow)" />
            <path d="M352 76L460 124" {...common} markerEnd="url(#arrow)" />
            <path d="M470 172C420 214 220 214 170 172" {...common} markerEnd="url(#arrow)" />
            <text x="150" y="196" {...label}>plan</text>
            <text x="320" y="20" {...label}>act</text>
            <text x="490" y="196" {...label}>check</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-2 text-xs opacity-55">
        A sketch of the idea, drawn in the notebook. Not the system architecture.
      </figcaption>
    </figure>
  );
}
