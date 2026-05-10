import { ThemeToggle } from "@/components/theme-toggle"
import { config } from "@/lib/config"

export default function Page() {
  const { experienceDisplay, projectsDisplay, skillsDisplay, languagesDisplay, operatingPrinciples } = config

  return (
    <div className="sw-wrap">

      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="sw-topbar">
        <div className="sw-topbar-l">
          <span className="sw-mono" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>
            Jaleel <span className="sw-red">/</span> JD van Staden
          </span>
        </div>
        <div className="sw-topbar-c">— Portfolio · Vol. 26.1 —</div>
        <nav className="sw-topbar-r">
          <a href="#about">01 About</a>
          <a href="#work">02 Work</a>
          <a href="#projects">03 Projects</a>
          <a href="#contact">04 Contact</a>
          <a href={config.blogUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mute)" }}>Writing ↗</a>
          <ThemeToggle />
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="sw-hero">
        <div className="sw-hero-grid">
          <h1>
            JD van<br />
            Staden<span className="sw-red">.</span>
          </h1>
          <div className="sw-meta-block">
            <div className="sw-meta-row">
              <span className="num">01</span>
              <span className="v">Software Development Engineer</span>
            </div>
            <div className="sw-meta-row">
              <span className="num">02</span>
              <span className="v">Amazon Web Services / EC2</span>
            </div>
            <div className="sw-meta-row">
              <span className="num">03</span>
              <span className="v">Cape Town · 33.9°S 18.4°E</span>
            </div>
            <div className="sw-meta-row">
              <span className="num">04</span>
              <span className="v">Backend · Cloud · Mobile</span>
            </div>
            <div className="sw-meta-row">
              <span className="num">05</span>
              <span className="v">Available for conversation</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Subhead bar ────────────────────────────────────────────────── */}
      <div className="sw-subhead">
        <div className="sw-subhead-item"><span className="lbl">Edition</span>26.1 / Spring</div>
        <div className="sw-subhead-item"><span className="lbl">Updated</span>08 May 2026</div>
        <div className="sw-subhead-item">
          <span className="lbl">Status</span>
          <span className="sw-red">● </span>Currently — AWS
        </div>
        <div className="sw-subhead-item"><span className="lbl">Languages</span>EN · AF · ES · DE</div>
      </div>

      {/* ── About ──────────────────────────────────────────────────────── */}
      <section className="sw-section" id="about">
        <div className="sw-section-num">
          § <span className="sw-red">01</span> — About
        </div>
        <h2>A short statement<span className="sw-red">.</span></h2>
        <div className="sw-about-body">
          <p>
            Software engineer with two years across backend systems, cloud infrastructure, and
            mobile development. Currently at AWS, working on the parts of EC2 the rest of the
            cloud rests on. Interested in cloud, AI, and educational technologies — built
            carefully, in plain language<span className="sw-red">.</span>
          </p>
          <div className="sw-about-side">
            <div style={{ marginBottom: 14, color: "var(--foreground)", fontWeight: 500 }}>
              — operating principles
            </div>
            {operatingPrinciples.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Experience ─────────────────────────────────────────────────── */}
      <section className="sw-section" id="work">
        <div className="sw-section-num">
          § <span className="sw-red">02</span> — Experience
        </div>
        <h2>Where the time has gone<span className="sw-red">.</span></h2>
        <div className="sw-xp-table">
          {experienceDisplay.map((job) => (
            <div className="sw-xp-row" key={job.company}>
              <div className="yr">
                {job.current
                  ? <>{job.yearDisplay.replace(" — ▸", "")} — <span className="sw-red">▸</span></>
                  : job.yearDisplay
                }
              </div>
              <div>
                <div className="role">
                  {job.role}
                  {job.current && <span className="sw-red">.</span>}
                </div>
                <div className="where">{job.company}</div>
              </div>
              <div className="desc">{job.desc}</div>
              <div className="arrow">→</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Projects ───────────────────────────────────────────────────── */}
      <section className="sw-section" id="projects">
        <div className="sw-section-num">
          § <span className="sw-red">03</span> — Projects
        </div>
        <h2>Selected work<span className="sw-red">.</span></h2>
        <div className="sw-proj-grid">
          {projectsDisplay.map((proj) => (
            <a
              key={proj.num}
              href={proj.link}
              target="_blank"
              rel="noopener noreferrer"
              className="sw-proj"
            >
              <div className="sw-proj-head">
                <span className="sw-proj-num">{proj.num}</span>
                <span className="sw-proj-yr">{proj.year}</span>
              </div>
              <h3>
                {proj.name}<span className="sw-red">.</span>
              </h3>
              <p>{proj.tagline}</p>
              <div className="sw-proj-stack">
                {proj.stack.map((tag) => (
                  <span
                    key={tag}
                    className={tag === proj.highlightTag ? "sw-tag sw-tag-red" : "sw-tag"}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Skills ─────────────────────────────────────────────────────── */}
      <section className="sw-section">
        <div className="sw-section-num">
          § <span className="sw-red">04</span> — Skills
        </div>
        <h2>Tooling, briefly<span className="sw-red">.</span></h2>
        <div className="sw-skills">
          {(["languages", "frameworks", "infrastructure"] as const).map((cat) => (
            <div key={cat} className="sw-skill-col">
              <div className="lbl" style={{ textTransform: "capitalize" }}>{cat}</div>
              <div className="sw-skill-list">
                {skillsDisplay[cat].map((skill, i) => (
                  <div
                    key={skill.name}
                    className={`sw-skill${skill.highlight ? " sw-skill-hi" : ""}`}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    <span>{skill.name}</span>
                    <span
                      className="lvl"
                      style={{ "--gap": `${100 - skill.level}%` } as React.CSSProperties}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Education & Languages ──────────────────────────────────────── */}
      <section className="sw-section">
        <div className="sw-section-num">
          § <span className="sw-red">05</span> — Education &amp; Languages
        </div>
        <h2>Schooled<span className="sw-red">.</span></h2>
        <div className="sw-edu-lang">
          {/* Education */}
          <div>
            {config.education.map((edu) => (
              <div key={edu.degree} className="sw-edu-item">
                <div className="yr">{edu.year}</div>
                <div>
                  <div className="deg">{edu.degree}</div>
                  <div className="school">{edu.school}</div>
                </div>
                <div className="badge">
                  {edu.degree.startsWith("BCom (Hons)") ? "Honours" : "Bachelor"}
                </div>
              </div>
            ))}
          </div>

          {/* Languages */}
          <div>
            {languagesDisplay.map((l) => (
              <div key={l.lang} className="sw-lang-item">
                <span className="l">{l.lang}</span>
                <span className="level">{l.level}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <section className="sw-contact" id="contact">
        <h2>
          Say<br />hello<span className="sw-red">.</span>
        </h2>
        <div className="sw-contact-links">
          <a href={`mailto:${config.links.email}`}>
            <span className="k">01 / Email</span>
            <span>{config.links.email}</span>
            <span className="arr">→</span>
          </a>
          <a href={config.links.github} target="_blank" rel="noopener noreferrer">
            <span className="k">02 / GitHub</span>
            <span>Jaleel-VS</span>
            <span className="arr">→</span>
          </a>
          <a href={config.links.linkedin} target="_blank" rel="noopener noreferrer">
            <span className="k">03 / LinkedIn</span>
            <span>jd-van-staden</span>
            <span className="arr">→</span>
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="sw-footer">
        <span>© JD van Staden, 2026</span>
        <span style={{ textAlign: "center" }}>Set in Space Grotesk &amp; JetBrains Mono</span>
        <span style={{ textAlign: "right" }}>Cape Town &nbsp;·&nbsp; built quietly</span>
      </footer>

    </div>
  )
}
