"use client"

import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const isDark = stored ? stored === "dark" : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "var(--mute)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        transition: "color .15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mute)")}
    >
      {dark ? "light" : "dark"}
    </button>
  )
}
