import Link from "next/link"
import { notFound } from "next/navigation"
import { getCourses, getCourse, getCourseIndexContent, renderMarkdown } from "@/lib/courses"
import { ArrowLeft } from "lucide-react"

export async function generateStaticParams() {
  return getCourses().map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = getCourse(slug)
  if (!course) return {}
  return {
    title: `${course.title} — Rust Courses`,
    description: course.description,
  }
}

export default async function CourseSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = getCourse(slug)
  if (!course) notFound()

  const indexContent = getCourseIndexContent(slug)
  const html = indexContent ? await renderMarkdown(indexContent) : ""

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16">
      <Link
        href="/courses"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-6"
      >
        <ArrowLeft size={12} />
        all courses
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: course.theme.accent }}
          />
          <h1 className="text-xl font-medium tracking-tight">{course.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{course.description}</p>
      </div>

      {/* Act list */}
      <div className="mb-10">
        <h2 className="text-sm font-medium mb-3">Acts</h2>
        <div className="space-y-1">
          {course.acts.map((act, i) => (
            <Link
              key={act.slug}
              href={`/courses/${slug}/${act.slug}`}
              className="flex items-baseline justify-between py-2.5 px-3 -mx-3 rounded-md text-sm hover:bg-surface transition-colors group"
            >
              <span className="group-hover:text-foreground text-muted-foreground transition-colors">
                {act.title}
              </span>
              <span className="text-[11px] font-mono text-tertiary">
                {i + 1} of {course.acts.length}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Rendered Index.md */}
      <div
        className="prose-custom"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  )
}
