export const config = {
  name: "JD van Staden",
  title: "Software Development Engineer",
  location: "Cape Town, South Africa",
  summary:
    "Software engineer with 2+ years across backend systems, cloud infrastructure, and mobile development. Currently at AWS working on EC2 internals. Interested in cloud, AI, and educational technologies.",
  blogUrl: "https://blog.jaleel.co.za",
  links: {
    github: "https://github.com/Jaleel-VS",
    linkedin: "https://linkedin.com/in/jd-van-staden",
    email: "jaleelvanstaden@gmail.com",
  },

  // Original flat arrays kept for backward compat
  experience: [
    {
      company: "Amazon Web Services",
      role: "Software Development Engineer",
      period: "Dec 2025 – Present",
      location: "Cape Town",
      bullets: [
        "Support internal services underpinning EC2 architecture, owning build and deployment pipelines using AWS SDK, Java, and Kotlin",
        "Provide cross-team support and contribute to service reliability across dependent internal teams",
      ],
    },
    {
      company: "Entelect (at First National Bank)",
      role: "Software Engineer",
      period: "Feb 2025 – Dec 2025",
      location: "Cape Town / Remote",
      bullets: [
        "Built backend systems for FNB Ghana using Java, Spring Boot, and microservices",
        "Developed iOS features in Swift alongside backend work",
        "Managed containerised deployments with Docker and Kubernetes on AWS",
      ],
    },
    {
      company: "Old Mutual Investment Group",
      role: "Tech Graduate",
      period: "Feb 2024 – Jan 2025",
      location: "Cape Town",
      bullets: [
        "Built internal tooling with Nuxt.js and .NET 8 Web API",
        "Designed ETL pipelines for data warehouse migration across millions of investment records",
      ],
    },
  ],

  education: [
    { degree: "BCom (Hons) — Information Systems", school: "University of Cape Town", year: "2024" },
    { degree: "BSc — Computer Science & Business Computing", school: "University of Cape Town", year: "2023" },
  ],

  projects: [
    {
      name: "Hablemos",
      description: "Multi-purpose Discord bot serving 80,000+ users on a Spanish-English learning server with games and utility tools",
      tech: ["Python", "Discord.py", "MongoDB"],
      link: "https://github.com/Jaleel-VS/hablemos-discordpy-bot",
    },
    {
      name: "Broly",
      description: "Discord bot in Rust built on Serenity, sqlx, and tokio with Postgres persistence and graceful shutdown",
      tech: ["Rust", "Serenity", "sqlx"],
      link: "https://github.com/Jaleel-VS/broly",
    },
    {
      name: "FairChance",
      description: "Blockchain-based police docket tamper-detection system using Algorand's immutability to audit document integrity",
      tech: ["Algorand", "FastAPI", "Svelte"],
      link: "https://github.com/Jaleel-VS/AlgorandBlockchainApp",
    },
  ],

  skills: {
    languages: ["Java", "Python", "C#", "TypeScript", "Swift", "SQL", "Rust"],
    frameworks: ["Spring Boot", "ASP.NET", "FastAPI", "Django", "Next.js", "Nuxt.js"],
    infrastructure: ["AWS", "Docker", "Kubernetes", "CI/CD", "Microservices"],
  },

  languages: ["English & Afrikaans (Native)", "Spanish (Fluent)", "German (Elementary)"],

  // ─── Swiss design display data ───────────────────────────────────────────

  operatingPrinciples: [
    "01 / Make the boring parts boring.",
    "02 / Read code aloud before writing more.",
    "03 / Distrust any abstraction you cannot draw on a napkin.",
    "04 / Pick the dull tool that scales.",
  ],

  experienceDisplay: [
    {
      yearDisplay: "2025 — ▸",
      role: "Software Development Engineer",
      company: "Amazon Web Services · EC2",
      desc: "EC2 internals — instance lifecycle, host-level orchestration, the unglamorous parts of the cloud that quietly carry the rest of the internet.",
      current: true,
    },
    {
      yearDisplay: "2025",
      role: "Software Engineer",
      company: "Entelect · FNB Ghana",
      desc: "Spring Boot microservices, iOS features in Swift, containerised deployments with Docker and Kubernetes on AWS.",
      current: false,
    },
    {
      yearDisplay: "2024 — 2025",
      role: "Tech Graduate",
      company: "Old Mutual Investment Group",
      desc: "Internal tooling with Nuxt.js & .NET, ETL pipelines for data warehouse migration across millions of investment records.",
      current: false,
    },
  ],

  projectsDisplay: [
    {
      num: "P / 01",
      year: "2022",
      name: "Hablemos",
      tagline:
        "Multi-purpose Discord bot serving 80,000+ users on a Spanish-English learning server — games, utilities, and community tools.",
      stack: ["Python", "Discord.py", "MongoDB"],
      highlightTag: "Python",
      link: "https://github.com/Jaleel-VS/hablemos-discordpy-bot",
    },
    {
      num: "P / 02",
      year: "2026",
      name: "Broly",
      tagline:
        "Discord bot in Rust — async architecture on Serenity, sqlx, and tokio with Postgres persistence and graceful shutdown.",
      stack: ["Rust", "Serenity", "sqlx"],
      highlightTag: "Rust",
      link: "https://github.com/Jaleel-VS/broly",
    },
    {
      num: "P / 03",
      year: "2025",
      name: "FairChance",
      tagline:
        "Blockchain-based police docket tamper-detection system using Algorand's immutability to audit document integrity.",
      stack: ["Algorand", "FastAPI", "Svelte"],
      highlightTag: "Algorand",
      link: "https://github.com/Jaleel-VS/AlgorandBlockchainApp",
    },
  ],

  skillsDisplay: {
    languages: [
      { name: "Java",       level: 95, highlight: true  },
      { name: "Python",     level: 92, highlight: true  },
      { name: "TypeScript", level: 85, highlight: false },
      { name: "C#",         level: 75, highlight: false },
      { name: "Swift",      level: 70, highlight: false },
      { name: "SQL",        level: 82, highlight: false },
      { name: "Rust",       level: 45, highlight: false },
    ],
    frameworks: [
      { name: "Spring Boot", level: 92, highlight: true  },
      { name: "FastAPI",     level: 85, highlight: false },
      { name: "Django",      level: 80, highlight: false },
      { name: "ASP.NET",     level: 70, highlight: false },
      { name: "Next.js",     level: 82, highlight: false },
      { name: "Nuxt.js",     level: 65, highlight: false },
    ],
    infrastructure: [
      { name: "AWS",           level: 97, highlight: true  },
      { name: "Docker",        level: 92, highlight: false },
      { name: "Kubernetes",    level: 82, highlight: false },
      { name: "CI / CD",       level: 86, highlight: false },
      { name: "Microservices", level: 88, highlight: false },
    ],
  },

  languagesDisplay: [
    { lang: "English",   level: "Native"      },
    { lang: "Afrikaans", level: "Native"      },
    { lang: "Spanish",   level: "Fluent"      },
    { lang: "German",    level: "Elementary"  },
  ],
} as const
