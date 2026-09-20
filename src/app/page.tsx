import { ThemeToggle } from "@/components/theme-toggle"
import { config } from "@/lib/config"
import { WorldClock } from "@/components/world-clock"

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="section-heading">
      <a href={`#${id}`} aria-label={`Link to ${String(children)} section`}>
        <span aria-hidden="true">#</span>
      </a>
      {children}
    </h2>
  )
}

export default function Page() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="JD van Staden, home">
          JD
        </a>
        <nav aria-label="Primary navigation">
          <a href="#work">Work</a>
          <a href="#projects">Projects</a>
          <a href={config.blogUrl}>Writing</a>
          <ThemeToggle />
        </nav>
      </header>

      <WorldClock />

      <div className="content" id="top">
        <section className="intro" aria-labelledby="intro-title">
          <h1 id="intro-title">JD van Staden</h1>
          <p>
            I’m JD. I’m a software engineer based in Cape Town, currently working on
            EC2 at AWS.
          </p>
          <p>
            I like learning languages and building small tools that help people learn. I also
            listen to a lot of podcasts, write occasionally, and have recently started
            experimenting with robotics.
          </p>
        </section>


        <section className="section" aria-labelledby="work">
          <SectionHeading id="work">Work</SectionHeading>
          <div className="rows">
            {config.experience.map((job) => (
              <article className="row" key={`${job.company}-${job.period}`}>
                <div>
                  <h3>{job.role}</h3>
                  <p>{job.company}</p>
                </div>
                <span>{job.period}</span>
              </article>
            ))}
          </div>
        </section>

        <hr />

        <section className="section" aria-labelledby="hablemos">
          <SectionHeading id="hablemos">Hablemos</SectionHeading>
          <p>
            I started programming and learning Spanish around the same time in 2020. Through a
            Spanish–English Discord community I was part of, I got the opportunity to build a bot
            for the server.
          </p>
          <p>
            The first version had one basic conversation feature. As the community grew, so did
            the bot. I added games, moderation tools, and other features based on what people
            actually needed. It eventually became something thousands of people used every day.
          </p>
          <p>
            It was the first thing I built that real people depended on, and it taught me more
            than any personal project could have.
          </p>
          <p>
            <a
              className="text-link"
              href="https://github.com/Jaleel-VS/hablemos-discordpy-bot"
              target="_blank"
              rel="noreferrer"
            >
              View Hablemos on GitHub ↗
            </a>
          </p>
        </section>

        <hr />

        <section className="section" aria-labelledby="projects">
          <SectionHeading id="projects">Side projects</SectionHeading>
          <div className="project-list">
            {config.projects.filter((project) => project.name !== "Hablemos").map((project) => (
              <a
                className="project"
                href={project.link}
                key={project.name}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.description}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </section>

        <hr />

        <section className="section" aria-labelledby="elsewhere">
          <SectionHeading id="elsewhere">Elsewhere</SectionHeading>
          <p>
            I sometimes write about software and whatever else has my attention on the {" "}
            <a className="text-link" href={config.blogUrl}>blog</a>. You can also find me on {" "}
            <a className="text-link" href={config.links.github}>GitHub</a> and {" "}
            <a className="text-link" href={config.links.linkedin}>LinkedIn</a>.
          </p>
        </section>

        <hr />

        <section className="section" aria-labelledby="connect">
          <SectionHeading id="connect">Connect</SectionHeading>
          <p>
            The best way to reach me is by {" "}
            <a className="text-link" href={`mailto:${config.links.email}`}>email</a>.
          </p>
        </section>
      </div>

      <footer>
        <span>JD van Staden</span>
        <span>Cape Town · 2026</span>
      </footer>
    </main>
  )
}
