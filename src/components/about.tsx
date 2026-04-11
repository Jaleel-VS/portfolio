import { config } from "@/lib/config"

export function About() {
  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-muted-foreground">{config.summary}</p>

      {/* Skills */}
      <div>
        <h2 className="text-sm font-medium mb-3">Skills</h2>
        {Object.entries(config.skills).map(([category, items]) => (
          <div key={category} className="mb-3">
            <span className="text-xs text-tertiary font-mono capitalize">{category}</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {items.map((s) => (
                <span key={s} className="text-xs font-mono px-2 py-0.5 rounded-md bg-surface border border-border">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Education */}
      <div>
        <h2 className="text-sm font-medium mb-3">Education</h2>
        {config.education.map((e) => (
          <div key={e.degree} className="flex justify-between items-baseline py-2 border-b border-border last:border-0">
            <div>
              <p className="text-sm">{e.degree}</p>
              <p className="text-xs text-muted-foreground">{e.school}</p>
            </div>
            <span className="text-xs font-mono text-tertiary">{e.year}</span>
          </div>
        ))}
      </div>

      {/* Languages */}
      <div>
        <h2 className="text-sm font-medium mb-3">Languages</h2>
        <div className="space-y-1">
          {config.languages.map((l) => (
            <p key={l} className="text-sm text-muted-foreground">{l}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
