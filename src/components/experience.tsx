import { config } from "@/lib/config"

export function Experience() {
  return (
    <div className="space-y-8">
      {config.experience.map((job) => (
        <div key={job.company}>
          <div className="flex justify-between items-baseline">
            <h3 className="text-sm font-medium">{job.company}</h3>
            <span className="text-xs font-mono text-tertiary">{job.period}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.role} · {job.location}
          </p>
          <ul className="mt-3 space-y-1.5">
            {job.bullets.map((b, i) => (
              <li key={i} className="text-sm text-muted-foreground leading-relaxed pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-tertiary">
                {b}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
