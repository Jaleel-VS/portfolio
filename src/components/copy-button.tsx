"use client"

import { useEffect } from "react"

export function CopyButton() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.classList.contains("copy-btn")) return
      const pre = target.closest("pre")
      if (!pre) return
      const code = pre.querySelector("code")
      if (!code) return
      navigator.clipboard.writeText(code.textContent || "").then(() => {
        target.textContent = "copied"
        setTimeout(() => {
          target.textContent = "copy"
        }, 2000)
      })
    }

    // Add copy buttons to all pre > code blocks
    document.querySelectorAll<HTMLPreElement>(".prose-custom pre").forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return
      const btn = document.createElement("button")
      btn.className = "copy-btn"
      btn.textContent = "copy"
      pre.style.position = "relative"
      pre.appendChild(btn)
    })

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  return null
}
