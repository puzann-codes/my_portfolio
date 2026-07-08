export type Project = {
  slug: string;
  title: string;
  category: string;
  year: string;
  tags: string[];
  note: string;
  color: string;
};

export const TOP_PROJECTS: Project[] = [
  {
    slug: "aria-copilot",
    title: "Aria Copilot",
    category: "AI Product · SaaS",
    year: "2025",
    tags: ["LLM", "Next.js", "Vector Search"],
    note: "E2",
    color: "#1c1c1c",
  },
  {
    slug: "signal-atlas",
    title: "Signal Atlas",
    category: "Data Visualization",
    year: "2025",
    tags: ["Realtime", "D3", "WebGL"],
    note: "A2",
    color: "#242424",
  },
  {
    slug: "loop-fi",
    title: "Loop Finance",
    category: "Fintech · Web App",
    year: "2024",
    tags: ["Node.js", "Postgres", "Stripe"],
    note: "D3",
    color: "#2c2c2c",
  },
  {
    slug: "nova-render",
    title: "Nova Render",
    category: "AI Research Tool",
    year: "2024",
    tags: ["PyTorch", "Diffusion", "FastAPI"],
    note: "G3",
    color: "#343434",
  },
  {
    slug: "harbor-cms",
    title: "Harbor CMS",
    category: "Developer Tooling",
    year: "2023",
    tags: ["TypeScript", "GraphQL", "Redis"],
    note: "B3",
    color: "#3c3c3c",
  },
  {
    slug: "kite-studio",
    title: "Kite Studio",
    category: "Creative Portfolio",
    year: "2023",
    tags: ["React", "GSAP", "WebGL"],
    note: "E4",
    color: "#444444",
  },
];

export const ALL_PROJECTS: Project[] = [
  ...TOP_PROJECTS,
  {
    slug: "pulse-health",
    title: "Pulse Health",
    category: "Mobile · Health Tech",
    year: "2023",
    tags: ["React Native", "ML Kit"],
    note: "—",
    color: "#4c4c4c",
  },
  {
    slug: "drift-analytics",
    title: "Drift Analytics",
    category: "Internal Tooling",
    year: "2022",
    tags: ["Python", "Airflow", "dbt"],
    note: "—",
    color: "#545454",
  },
  {
    slug: "monogram",
    title: "Monogram",
    category: "Brand Identity Site",
    year: "2022",
    tags: ["Framer Motion", "Three.js"],
    note: "—",
    color: "#5c5c5c",
  },
  {
    slug: "outpost",
    title: "Outpost",
    category: "AI Chat Infra",
    year: "2022",
    tags: ["WebSockets", "Redis", "LLM"],
    note: "—",
    color: "#646464",
  },
];
