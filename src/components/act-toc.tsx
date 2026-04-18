"use client"

import { useEffect, useState } from "react"

export function ActToc({
  stages,
  accent,
}: {
  stages: { id: string; title: string }[]
  accent: string
}) {
  const [activeId, setActiveId] = useState("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    )

    for (const stage of stages) {
      const el = document.getElementById(stage.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [stages])

  return (
    <nav className="sticky top-16">
      <p className="text-[11px] font-mono text-tertiary uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-1">
        {stages.map((stage) => (
          <li key={stage.id}>
            <a
              href={`#${stage.id}`}
              className="block text-xs py-1 transition-colors leading-relaxed"
              style={{
                color: activeId === stage.id ? accent : undefined,
              }}
            >
              <span
                className={
                  activeId === stage.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {stage.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
