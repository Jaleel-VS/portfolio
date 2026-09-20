"use client"

import { useEffect, useState } from "react"

const locations = [
  { label: "Cape Town", timeZone: "Africa/Johannesburg" },
  { label: "Seattle", timeZone: "America/Los_Angeles" },
  { label: "Japan", timeZone: "Asia/Tokyo" },
] as const

const formatters = locations.map(({ timeZone }) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  }),
)

export function WorldClock() {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()

    const timeout = window.setTimeout(() => {
      tick()
      const interval = window.setInterval(tick, 1000)
      cleanup = () => window.clearInterval(interval)
    }, 1000 - (Date.now() % 1000))

    let cleanup = () => {}
    return () => {
      window.clearTimeout(timeout)
      cleanup()
    }
  }, [])

  return (
    <div className="world-clock" aria-label="Current time around the world">
      {locations.map(({ label }, index) => (
        <div className="world-clock-item" key={label}>
          <time>{now === null ? "—:—:—" : formatters[index].format(now)}</time>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
