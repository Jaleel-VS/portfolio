import fs from "fs"
import path from "path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeHighlight from "rehype-highlight"

const COURSES_DIR = path.join(process.cwd(), "content/courses")

export type CourseTheme = {
  color: string
  accent: string
  tags: string[]
}

export const COURSE_THEMES: Record<string, CourseTheme> = {
  cronica: { color: "purple", accent: "#a855f7", tags: ["game-engine", "ai", "discord", "async", "serde", "state-machines"] },
  forja: { color: "orange", accent: "#f97316", tags: ["networking", "http", "tcp", "async", "from-scratch", "web"] },
  ironvault: { color: "steel", accent: "#94a3b8", tags: ["cryptography", "security", "cli", "file-io", "encryption", "passwords"] },
  lexicon: { color: "teal", accent: "#2dd4bf", tags: ["data-structures", "trie", "text-processing", "cli", "algorithms", "nlp"] },
  "marauders-map": { color: "gold", accent: "#eab308", tags: ["pathfinding", "algorithms", "bfs", "dijkstra", "a-star", "tui"] },
  runescript: { color: "green", accent: "#22c55e", tags: ["interpreter", "compiler", "parser", "lexer", "ast", "language-design"] },
  shadowkeep: { color: "red", accent: "#dc2626", tags: ["networking", "async", "multiplayer", "tcp", "game-engine", "concurrency"] },
  "the-chalice": { color: "crimson", accent: "#be123c", tags: ["roguelike", "procedural-gen", "tui", "game-engine", "bsp", "combat"] },
  "wizard-duel": { color: "blue", accent: "#3b82f6", tags: ["game-ai", "tui", "turn-based", "game-engine", "strategy", "combat"] },
  chronolock: { color: "amber", accent: "#d97706", tags: ["git", "version-control", "sha1", "data-structures", "from-scratch", "cli"] },
  cartografo: { color: "emerald", accent: "#059669", tags: ["dns", "networking", "binary-protocols", "udp", "bytes", "from-scratch"] },
  runa: { color: "violet", accent: "#7c3aed", tags: ["spaced-repetition", "tui", "algorithms", "fsrs", "serde", "productivity"] },
  piloto: { color: "rose", accent: "#e11d48", tags: ["neural-networks", "genetic-algorithm", "ai", "simulation", "physics", "macroquad"] },
  genesis: { color: "lime", accent: "#65a30d", tags: ["evolution", "physics", "genetic-algorithm", "ai", "simulation", "macroquad"] },
  baraja: { color: "fuchsia", accent: "#c026d3", tags: ["card-game", "deckbuilder", "mcts", "ai", "tui", "roguelike"] },
}

export type Act = {
  slug: string
  title: string
  filename: string
  number: number
}

export type Course = {
  slug: string
  title: string
  description: string
  acts: Act[]
  theme: CourseTheme
  tags: string[]
}

function slugifyAct(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

function extractDescription(content: string): string {
  const lines = content.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    // Look for blockquote description line (> text)
    if (trimmed.startsWith("> ") && !trimmed.startsWith("> [!") && !trimmed.startsWith("> *\"")) {
      return trimmed.replace(/^>\s*\*?/, "").replace(/\*$/, "").trim()
    }
  }
  // Fallback: first non-heading, non-empty line
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("**") && !trimmed.startsWith(">")) {
      return trimmed.slice(0, 200)
    }
  }
  return ""
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ""
}

export function getCourses(): Course[] {
  const slugs = fs.readdirSync(COURSES_DIR).filter((f) =>
    fs.statSync(path.join(COURSES_DIR, f)).isDirectory()
  )

  return slugs.map((slug) => {
    const dir = path.join(COURSES_DIR, slug)
    const indexContent = fs.readFileSync(path.join(dir, "Index.md"), "utf-8")

    const files = fs.readdirSync(dir).filter((f) => f.startsWith("Act ") && f.endsWith(".md"))
    files.sort((a, b) => {
      const numA = parseInt(a.match(/Act (\d+)/)?.[1] || "0")
      const numB = parseInt(b.match(/Act (\d+)/)?.[1] || "0")
      return numA - numB
    })

    const acts: Act[] = files.map((f) => {
      const match = f.match(/^Act (\d+) - (.+)\.md$/)
      return {
        slug: slugifyAct(f),
        title: match ? `Act ${match[1]} — ${match[2]}` : f.replace(".md", ""),
        filename: f,
        number: parseInt(match?.[1] || "0"),
      }
    })

    return {
      slug,
      title: extractTitle(indexContent),
      description: extractDescription(indexContent),
      acts,
      theme: COURSE_THEMES[slug] || { color: "gray", accent: "#6b7280", tags: [] },
      tags: COURSE_THEMES[slug]?.tags || [],
    }
  })
}

export function getCourse(slug: string): Course | undefined {
  return getCourses().find((c) => c.slug === slug)
}

export function getActContent(courseSlug: string, actSlug: string): string | undefined {
  const course = getCourse(courseSlug)
  if (!course) return undefined
  const act = course.acts.find((a) => a.slug === actSlug)
  if (!act) return undefined
  const filePath = path.join(COURSES_DIR, courseSlug, act.filename)
  if (!fs.existsSync(filePath)) return undefined
  return fs.readFileSync(filePath, "utf-8")
}

export function getCourseIndexContent(slug: string): string | undefined {
  const filePath = path.join(COURSES_DIR, slug, "Index.md")
  if (!fs.existsSync(filePath)) return undefined
  return fs.readFileSync(filePath, "utf-8")
}

/** Pre-process Obsidian-flavored markdown before passing to unified */
function preprocessObsidian(content: string): string {
  // Convert wikilinks [[Act 1 - The Forge]] to plain text (no internal linking needed)
  let result = content.replace(/\[\[([^\]]+)\]\]/g, "$1")

  // Convert Obsidian callouts to HTML
  // > [!tip] Title\n> content → <div class="callout callout-tip">...
  result = result.replace(
    /^> \[!(note|tip|warning|check|danger|info|example|quote|abstract|bug|success|question|failure|caution|important)\]([^\n]*)\n((?:^>.*\n?)*)/gm,
    (_match, type: string, title: string, body: string) => {
      const cleanTitle = title.trim() || type.charAt(0).toUpperCase() + type.slice(1)
      const cleanBody = body
        .split("\n")
        .map((l: string) => l.replace(/^>\s?/, ""))
        .join("\n")
        .trim()
      return `<div class="callout callout-${type}">\n<p class="callout-title">${cleanTitle}</p>\n\n${cleanBody}\n</div>\n`
    }
  )

  return result
}

export async function renderMarkdown(content: string): Promise<string> {
  const processed = preprocessObsidian(content)

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeHighlight, { detect: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(processed)

  return String(result)
}

/** Extract stage headings from act content for TOC */
export function extractStages(content: string): { id: string; title: string }[] {
  const stages: { id: string; title: string }[] = []
  const lines = content.split("\n")
  for (const line of lines) {
    // Match ## Stage N or ### Stage N headings
    const match = line.match(/^#{2,3}\s+(Stage\s+\d+\s*[—–-]\s*.+)$/i)
    if (match) {
      const title = match[1].trim()
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
      stages.push({ id, title })
    }
    // Also match ## headings that are section titles (not stages)
    const sectionMatch = line.match(/^##\s+(.+)$/)
    if (sectionMatch && !line.match(/stage/i)) {
      const title = sectionMatch[1].trim()
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
      stages.push({ id, title })
    }
  }
  return stages
}
