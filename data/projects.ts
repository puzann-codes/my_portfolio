/**
 * Project content.
 *
 * `caseStudy` fields are optional on purpose: a section on the project page
 * only renders when it has real content. Nothing here is invented. What is
 * filled in below is exactly what has been stated about each project; add the
 * rest (role, architecture, decisions, results, links, screenshots) as you
 * write it, and the page picks it up.
 */

export type CaseStudy = {
  /** what problem the project addresses */
  problem?: string;
  /** your verified contributions */
  role?: string[];
  /** how it is put together */
  architecture?: { summary: string; parts?: string[] };
  /** technologies actually used */
  stack?: string[];
  /** a decision, and why */
  decisions?: { title: string; detail: string }[];
  /** screenshots / demos / diagrams, as files under /public */
  media?: { src: string; alt: string; caption?: string }[];
  /** verified results or achievements */
  results?: string[];
  /** repository, live site, write-up… */
  links?: { label: string; href: string }[];
};

export type Project = {
  slug: string;
  title: string;
  category: string;
  year: string;
  tags: string[];
  /** which guitar string / playground pad this project sits on */
  note: string;
  color: string;
  /** one or two sentences for the project page */
  summary: string;
  /** which schematic the page shows; `null` for placeholders */
  diagram: "routing" | "timeline" | "agents" | null;
  caseStudy?: CaseStudy;
  /** placeholder projects stay in the archive but are marked as such */
  placeholder?: boolean;
};

// Order matters: index i is string i on the guitar, pad i in the
// playground, and object i on the workshop bench.
export const TOP_PROJECTS: Project[] = [
  {
    slug: "sunuwa",
    title: "Sunūwā",
    category: "Civic Technology",
    year: "2026",
    tags: ["Civic Tech", "Web App"],
    note: "E2",
    color: "#1c1c1c",
    summary:
      "A citizen–government complaint platform: people raise a complaint, and it is routed to the office that should deal with it.",
    diagram: "routing",
    caseStudy: {
      problem:
        "Citizens need a clear way to raise complaints with government, and complaints need to reach the right office.",
    },
  },
  {
    slug: "crash-capsule",
    title: "Crash Capsule",
    category: "Accident Reconstruction",
    year: "2026",
    tags: ["Reconstruction", "Concept"],
    note: "A2",
    color: "#242424",
    summary:
      "A post-crash evidence-reconstruction concept: scattered evidence is ordered into a timeline that can be replayed.",
    diagram: "timeline",
    caseStudy: {
      problem:
        "After a crash, the evidence is scattered. Reconstructing what happened means putting it back in order.",
    },
  },
  {
    slug: "agentic-ai-hackathon",
    title: "Agentic AI Hackathon",
    category: "Hackathon · Agentic AI",
    year: "2026",
    tags: ["Agentic AI", "Hackathon"],
    note: "D3",
    color: "#2c2c2c",
    summary: "Hackathon work on an agentic AI architecture built from connected components.",
    diagram: "agents",
    caseStudy: {
      problem: "Building a system where several AI components work together toward a goal.",
    },
  },
  {
    slug: "signal-atlas",
    title: "Signal Atlas",
    category: "Data Visualization",
    year: "2025",
    tags: ["Realtime", "D3", "WebGL"],
    note: "G3",
    color: "#343434",
    summary: "Placeholder project. Replace with a real case study.",
    diagram: null,
    placeholder: true,
  },
  {
    slug: "nova-render",
    title: "Nova Render",
    category: "AI Research Tool",
    year: "2024",
    tags: ["PyTorch", "Diffusion", "FastAPI"],
    note: "B3",
    color: "#3c3c3c",
    summary: "Placeholder project. Replace with a real case study.",
    diagram: null,
    placeholder: true,
  },
  {
    slug: "harbor-cms",
    title: "Harbor CMS",
    category: "Developer Tooling",
    year: "2023",
    tags: ["TypeScript", "GraphQL", "Redis"],
    note: "E4",
    color: "#444444",
    summary: "Placeholder project. Replace with a real case study.",
    diagram: null,
    placeholder: true,
  },
];

const placeholder = (
  slug: string,
  title: string,
  category: string,
  year: string,
  tags: string[],
  color: string
): Project => ({
  slug,
  title,
  category,
  year,
  tags,
  note: "—",
  color,
  summary: "Placeholder project. Replace with a real case study.",
  diagram: null,
  placeholder: true,
});

export const ALL_PROJECTS: Project[] = [
  ...TOP_PROJECTS,
  placeholder("loop-fi", "Loop Finance", "Fintech · Web App", "2024", ["Node.js", "Postgres", "Stripe"], "#4c4c4c"),
  placeholder("kite-studio", "Kite Studio", "Creative Portfolio", "2023", ["React", "GSAP", "WebGL"], "#545454"),
  placeholder("pulse-health", "Pulse Health", "Mobile · Health Tech", "2023", ["React Native", "ML Kit"], "#5c5c5c"),
  placeholder("drift-analytics", "Drift Analytics", "Internal Tooling", "2022", ["Python", "Airflow", "dbt"], "#646464"),
  placeholder("monogram", "Monogram", "Brand Identity Site", "2022", ["Framer Motion", "Three.js"], "#6c6c6c"),
  placeholder("outpost", "Outpost", "AI Chat Infra", "2022", ["WebSockets", "Redis", "LLM"], "#747474"),
];

export const getProject = (slug: string) => ALL_PROJECTS.find((p) => p.slug === slug);
