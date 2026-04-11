export const config = {
  name: "JD van Staden",
  title: "Software Development Engineer",
  location: "Cape Town, South Africa",
  summary:
    "Software engineer with 2+ years across backend systems, cloud infrastructure, and mobile development. Currently at AWS working on EC2 internals. Interested in cloud, AI, and educational technologies.",
  links: {
    github: "https://github.com/Jaleel-VS",
    linkedin: "https://linkedin.com/in/jd-van-staden",
    email: "jaleelvanstaden@gmail.com",
  },
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
      name: "Khuluma",
      description: "Conversational banking mobile app using NLP and AWS services to execute transactions via natural language",
      tech: ["AWS", "NLP", "Mobile"],
      link: "https://github.com/Jaleel-VS",
    },
    {
      name: "Hablemos",
      description: "Discord bot serving 80,000+ users on a Spanish-English learning server with games and utility tools",
      tech: ["Python", "Discord.py", "MongoDB"],
      link: "https://github.com/Jaleel-VS/hablemos-discordpy-bot",
    },
  ],
  skills: {
    languages: ["Java", "Python", "C#", "TypeScript", "Swift", "SQL", "Rust"],
    frameworks: ["Spring Boot", "ASP.NET", "FastAPI", "Django", "Next.js", "Nuxt.js"],
    infrastructure: ["AWS", "Docker", "Kubernetes", "CI/CD", "Microservices"],
  },
  languages: ["English & Afrikaans (Native)", "Spanish (Fluent)", "German (Elementary)"],
} as const
