/**
 * Project content: the single source for the desk journey, /work and every
 * case study. Nothing here is invented. Every line is traced to a project's
 * own repository or documentation (see docs/PROJECT_SOURCES.md for exactly
 * where). A section only renders when it has content, so missing detail is
 * left out rather than filled in.
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
  /** what is not done, or not tested */
  limits?: string[];
  /** repository, live site, write-up… */
  links?: { label: string; href: string }[];
};

/** The flow drawn on the project page, from the project's own docs. */
export type Flow = {
  steps: string[];
  /** the last step feeds back into the first */
  loop?: boolean;
  caption: string;
};

export type EnvironmentKey = "city" | "crash" | "harvo" | "learnscape" | "mul";

export type Project = {
  slug: string;
  title: string;
  /** one line under the title */
  category: string;
  year?: string;
  tags: string[];
  /** which guitar string / playground pad this project sits on */
  note: string;
  color: string;
  /** one or two sentences for the project page */
  summary: string;
  flow?: Flow;
  /** which 3D environment represents it */
  environment?: EnvironmentKey;
  caseStudy?: CaseStudy;
  /** an entry with no project behind it (the archive pad on the guitar) */
  archive?: boolean;
};

// Order matters: it is the order of the journey, of the guitar strings and
// of the playground pads.
export const TOP_PROJECTS: Project[] = [
  {
    slug: "sunuwa",
    title: "Sunūwā",
    category: "Civic technology · citizen–government complaints",
    year: "2025",
    tags: ["Civic Tech", "Nepali + English", "AI-assisted"],
    note: "E2",
    color: "#1c1c1c",
    environment: "city",
    summary:
      "A platform where citizens submit complaints, in Nepali or English, and have them routed to the responsible authority, with a visible status trail.",
    flow: {
      steps: ["Citizen files a complaint", "Categorised (AI-assisted)", "Routed to the authority", "Status trail"],
      caption: "The path of a complaint, as described in the project's own materials.",
    },
    caseStudy: {
      problem:
        "Everyday civic issues rarely reach the right desk, and citizens cannot see whether anything is being done about them.",
      role: ["Full-stack developer"],
      architecture: {
        summary:
          "A web application with an Express/MongoDB API. Authentication and role-based access separate citizen, staff and admin views.",
      },
      stack: ["React", "Node.js", "Express", "MongoDB", "JWT auth"],
      results: ["Runner-up at the Civic Code Hackathon organised by Think Big."],
    },
  },
  {
    slug: "crash-capsule",
    title: "Crash Capsule",
    category: "Road safety · tamper-evident crash evidence",
    year: "2026",
    tags: ["Android", "Supabase", "Offline-first", "Hackathon"],
    note: "A2",
    color: "#242424",
    environment: "crash",
    summary:
      "A witness network for road crashes in Nepal: phones seal a signed capsule of what they recorded, and a dashboard verifies it, corroborates it across devices and replays it. It does not decide who is at fault.",
    flow: {
      steps: ["Phone records a rolling buffer", "Impact seals a signed capsule", "Uploads when the network returns", "Server verifies and corroborates", "Dashboard replays"],
      caption: "From the project's README: capture, seal, upload, verify, replay.",
    },
    caseStudy: {
      problem:
        "After a crash, the objective facts (time, place, speed, impact signature, video) can be disputed or quietly altered. Crash Capsule locks them in so they cannot be.",
      architecture: {
        summary:
          "A native Android app captures and seals evidence, a hosted Supabase backend verifies it, and a Next.js dashboard presents the case.",
        parts: [
          "Android (Kotlin + Jetpack Compose): foreground capture service, impact detector, capsule sealer, BLE witness swarm, upload worker.",
          "Each capsule hashes every file with SHA-256 and signs its manifest with a hardware-backed ECDSA P-256 key (Android Keystore).",
          "Supabase: Postgres, storage and Edge Functions that verify signatures and file hashes and score corroboration across independent devices.",
          "Dashboard: events map, case file, synchronised evidence replay, a Verify page and a printable report.",
          "An optional SMS carries only the fingerprint hash when there is no data signal.",
        ],
      },
      stack: ["Kotlin", "Jetpack Compose", "Supabase (Postgres, Edge Functions)", "Next.js", "TypeScript", "Leaflet", "uPlot"],
      decisions: [
        { title: "Honest positioning", detail: "It never claims fault. It records objective facts and corroborates them; the replay draws only what sensors recorded." },
        { title: "Privacy by construction", detail: "Video only, never audio; opt-in with a persistent notification; unclaimed data is deleted after 72 hours." },
        { title: "Verifiable offline", detail: "Capsules are signed on the phone, so they can be uploaded hours later and still prove they were not altered." },
      ],
      results: [
        "Capture, sealing, signing, upload (including offline then reconnect), server verification, the dashboard, replay, Verify, report, SMS fingerprint and retention are built and tested (78 Android unit tests; a 49-check backend smoke test).",
      ],
      limits: ["The BLE witness swarm is code-complete but has not been tested on real phones."],
    },
  },
  {
    slug: "harvo",
    title: "Harvo",
    category: "Agri-tech · farm-to-buyer supply chain",
    year: "2025",
    tags: ["Agri-tech", "MERN", "REST API"],
    note: "D3",
    color: "#2c2c2c",
    environment: "harvo",
    summary:
      "A digital supply chain for the people who grow food: farmers list produce and track orders, and buyers connect to them directly.",
    flow: {
      steps: ["Farmer lists produce", "Buyer places an order", "Order status tracked", "Sale confirmed"],
      caption: "The listing-to-sale path described in the project's materials.",
    },
    caseStudy: {
      problem:
        "Smallholder farmers lose income to opaque, multi-layered supply chains where pricing, quality and trust break down.",
      role: ["Full-stack developer"],
      architecture: {
        summary: "A REST API backed by MongoDB handles listings, order management and status tracking, with a React front end.",
      },
      stack: ["React", "Node.js", "Express", "MongoDB", "REST API"],
    },
  },
  {
    slug: "learnscape-ai",
    title: "LearnScape AI",
    category: "Education · physics through the camera, in AR",
    year: "2026",
    tags: ["Next.js", "Computer vision", "WebXR", "Supabase"],
    note: "G3",
    color: "#343434",
    environment: "learnscape",
    summary:
      "Point a phone at an everyday object and LearnScape identifies it, shows the physics behind it as vectors over the image, and explains the concept.",
    flow: {
      steps: ["Camera scan", "Vision model: object + concept", "Physics engine computes", "Vectors + explanation overlay"],
      caption: "From the repository: the vision model names the object; the physics numbers come from a deterministic engine.",
    },
    caseStudy: {
      problem: "Physics is easier to understand when it is attached to objects you can actually see and handle.",
      architecture: {
        summary:
          "A Next.js app. A vision model returns only the object, concept and coordinates; all physics values come from a deterministic engine, never from the model.",
        parts: [
          "Eight supported objects: water bottle (buoyancy), ball (projectile motion), electric fan (angular velocity), door (torque), staircase, ramp with object, toy car (acceleration) and chair (stability).",
          "Results are drawn as an SVG vector overlay; an AR path built on WebXR hit-testing and anchors is in the repository.",
          "Supabase handles authentication, a leaderboard, XP and badges.",
        ],
      },
      stack: ["Next.js", "React", "Tailwind CSS", "Supabase", "three.js", "React Three Fiber", "WebXR", "Zustand"],
      limits: [
        "WebXR AR works on Android Chrome only; iOS Safari and desktop use the photo-and-overlay flow.",
        "The fully on-device detection redesign in docs/AR_REDESIGN.md is a proposal, not shipped.",
      ],
    },
  },
  {
    slug: "mul",
    title: "Mul",
    category: "Water · investigating why a spring is declining",
    tags: ["Agentic AI", "Environmental data", "Concept + design"],
    note: "B3",
    color: "#3c3c3c",
    environment: "mul",
    summary:
      "An agent that monitors springs and, when discharge drops, investigates why: it forms competing hypotheses, gathers evidence, and stops at a human approval gate.",
    flow: {
      steps: ["Monitor discharge", "Hypotheses", "Gather evidence", "Eliminate what does not fit", "Human approval gate"],
      loop: true,
      caption: "The investigation loop from the design document. Hypotheses are ranked and uncertainty-aware; interventions are recommendations for human review.",
    },
    caseStudy: {
      problem:
        "A spring can lose discharge for months or years before anyone understands why. Knowing it is declining is not the same as knowing the cause or what could help.",
      architecture: {
        summary:
          "A design for an evidence-based investigation agent: it separates observed facts, calculated indicators and hypotheses, and reports uncertainty instead of a single verdict.",
      },
      limits: [
        "This is a design and prototype plan, documented in a project brief. Simulated components are meant to be disclosed as such.",
      ],
    },
  },
];

/** The sixth guitar string / playground pad is the way to the archive. */
export const ARCHIVE_PAD: Project = {
  slug: "work",
  title: "All projects",
  category: "The full list",
  year: "Archive",
  tags: ["Work"],
  note: "E4",
  color: "#444444",
  summary: "Every project in one place.",
  archive: true,
};

export const STRING_PROJECTS: Project[] = [...TOP_PROJECTS, ARCHIVE_PAD];

export const ALL_PROJECTS: Project[] = TOP_PROJECTS;

export const getProject = (slug: string) => ALL_PROJECTS.find((p) => p.slug === slug);
