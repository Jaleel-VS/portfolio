"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { config } from "@/lib/config"
import { About } from "@/components/about"
import { Experience } from "@/components/experience"
import { Projects } from "@/components/projects"
import { ThemeToggle } from "@/components/theme-toggle"

const tabs = ["about", "experience", "projects"] as const
type Tab = (typeof tabs)[number]

const content = { about: About, experience: Experience, projects: Projects } as const

export default function Page() {
  const [active, setActive] = useState<Tab>("about")
  const ActiveTab = content[active]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < tabs.length) setActive(tabs[i])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-medium tracking-tight">{config.name}</h1>
          <ThemeToggle />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {config.title} · {config.location}
        </p>
        <div className="flex gap-4 mt-3">
          {Object.entries(config.links).map(([label, href]) => (
            <a
              key={label}
              href={label === "email" ? `mailto:${href}` : href}
              target={label === "email" ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-6 border-b border-border mb-8 relative">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`relative pb-2 text-sm transition-colors cursor-pointer ${
              active === tab
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab}</span>
            <span className="ml-1.5 text-[10px] font-mono text-tertiary">{i + 1}</span>
            {active === tab && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={active}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ActiveTab />
        </motion.div>
      </AnimatePresence>
    </main>
  )
}
