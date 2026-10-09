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
  /** "shipped" objects are glossy in the workshop, "experiment" ones are wireframe */
  status: "shipped" | "experiment";
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
      "Civic technology: software that makes public systems easier for people to reach. Full write-up coming soon.",
    status: "shipped",
  },
  {
    slug: "crash-capsule",
    title: "Crash Capsule",
    category: "Accident Reconstruction",
    year: "2026",
    tags: ["Reconstruction", "Simulation"],
    note: "A2",
    color: "#242424",
    summary:
      "Reconstructing accidents from the evidence: scene, trajectories and timeline, replayable. Full write-up coming soon.",
    status: "shipped",
  },
  {
    slug: "aria-copilot",
    title: "Aria Copilot",
    category: "AI Product · SaaS",
    year: "2025",
    tags: ["LLM", "Next.js", "Vector Search"],
    note: "D3",
    color: "#2c2c2c",
    summary: "Placeholder project. Replace with a real case study.",
    status: "shipped",
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
    status: "experiment",
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
    status: "experiment",
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
    status: "shipped",
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
  status: "shipped",
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
