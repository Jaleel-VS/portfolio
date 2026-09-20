import { ThemeToggle } from "@/components/theme-toggle"
import { config } from "@/lib/config"

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

      <div className="content" id="top">
        <section className="intro" aria-labelledby="intro-title">
          <h1 id="intro-title">JD van Staden</h1>
          <p>
            Software engineer in Cape Town. I build backend systems, cloud infrastructure,
            and the occasional product for the internet.
          </p>
          <p>
            By day, I work on <strong>Amazon EC2</strong>. Away from work, I write software,
            learn languages, and make small things that interest me.
          </p>
        </section>

        <hr />

        <section className="section" aria-labelledby="highlights">
          <SectionHeading id="highlights">Highlights</SectionHeading>
          <ul className="arrow-list">
            <li>Building the systems that underpin compute at AWS</li>
            <li>Worked across banking, investments, mobile, and cloud infrastructure</li>
            <li>Built community software used by more than 80,000 people</li>
            <li>Currently learning Rust and German, at very different speeds</li>
          </ul>
        </section>

        <hr />

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

        <section className="section" aria-labelledby="projects">
          <SectionHeading id="projects">Side projects</SectionHeading>
          <div className="project-list">
            {config.projects.map((project) => (
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
