import Link from "next/link"
import { notFound } from "next/navigation"
import { getCourses, getCourse, getActContent, renderMarkdown, extractStages } from "@/lib/courses"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { ActToc } from "@/components/act-toc"
import { CopyButton } from "@/components/copy-button"

export async function generateStaticParams() {
  const courses = getCourses()
  const params: { slug: string; act: string }[] = []
  for (const course of courses) {
    for (const act of course.acts) {
      params.push({ slug: course.slug, act: act.slug })
    }
  }
  return params
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; act: string }>
}) {
  const { slug, act: actSlug } = await params
  const course = getCourse(slug)
  if (!course) return {}
  const act = course.acts.find((a) => a.slug === actSlug)
  if (!act) return {}
  return {
    title: `${act.title} — ${course.title}`,
    description: `${act.title} from the ${course.title} Rust course.`,
  }
}

export default async function ActPage({
  params,
}: {
  params: Promise<{ slug: string; act: string }>
}) {
  const { slug, act: actSlug } = await params
  const course = getCourse(slug)
  if (!course) notFound()

  const actIndex = course.acts.findIndex((a) => a.slug === actSlug)
  if (actIndex === -1) notFound()

  const act = course.acts[actIndex]
  const rawContent = getActContent(slug, actSlug)
  if (!rawContent) notFound()

  const html = await renderMarkdown(rawContent)
  const stages = extractStages(rawContent)

  const prev = actIndex > 0 ? course.acts[actIndex - 1] : null
  const next = actIndex < course.acts.length - 1 ? course.acts[actIndex + 1] : null

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-16">
      {/* Header */}
      <div className="max-w-[720px]">
        <Link
          href={`/courses/${slug}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-6"
        >
          <ArrowLeft size={12} />
          {course.title}
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: course.theme.accent }}
          />
          <span className="text-[11px] font-mono text-tertiary">
            Act {act.number} of {course.acts.length}
          </span>
        </div>
        <h1 className="text-xl font-medium tracking-tight mb-8">{act.title}</h1>
      </div>

      {/* Content + TOC */}
      <div className="flex gap-12">
        <article className="min-w-0 max-w-[720px] flex-1">
          <div
            className="prose-custom"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <CopyButton />

          {/* Prev/Next navigation */}
          <nav className="flex justify-between items-center mt-16 pt-8 border-t border-border">
            {prev ? (
              <Link
                href={`/courses/${slug}/${prev.slug}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft size={14} />
                <span>{prev.title}</span>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                href={`/courses/${slug}/${next.slug}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{next.title}</span>
                <ChevronRight size={14} />
              </Link>
            ) : (
              <Link
                href={`/courses/${slug}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Back to course</span>
                <ChevronRight size={14} />
              </Link>
            )}
          </nav>
        </article>

        {/* Sidebar TOC — desktop only */}
        {stages.length > 0 && (
          <aside className="hidden lg:block w-56 shrink-0">
            <ActToc stages={stages} accent={course.theme.accent} />
          </aside>
        )}
      </div>
    </div>
  )
}
