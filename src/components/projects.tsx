import { config } from "@/lib/config"

export function Projects() {
  return (
    <div className="space-y-6">
      {config.projects.map((p) => (
        <div key={p.name} className="py-3 border-b border-border last:border-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-medium">{p.name}</h3>
            {p.link && (
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ↗
              </a>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
          <div className="flex gap-1.5 mt-2">
            {p.tech.map((t) => (
              <span key={t} className="text-xs font-mono px-2 py-0.5 rounded-md bg-surface border border-border">
                {t}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
