import Link from "next/link"
import { getCourses } from "@/lib/courses"
import { BookOpen, ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Rust Courses — JD van Staden",
  description: "Project-based Rust courses. Learn Rust by building real projects.",
}

export default function CoursesPage() {
  const courses = getCourses()

  return (
    <main className="mx-auto max-w-[900px] px-6 py-16">
      <div className="mb-10">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeft size={12} />
          back
        </Link>
        <h1 className="text-xl font-medium tracking-tight">Rust Courses</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Project-based courses. Each one builds a complete Rust project from scratch.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <Link
            key={course.slug}
            href={`/courses/${course.slug}`}
            className="group block rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-hover"
          >
            <div
              className="w-8 h-8 rounded-md mb-3 flex items-center justify-center"
              style={{ backgroundColor: `${course.theme.accent}20` }}
            >
              <BookOpen size={16} style={{ color: course.theme.accent }} />
            </div>
            <h2 className="text-sm font-medium group-hover:text-foreground transition-colors">
              {course.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
              {course.description}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[11px] font-mono text-tertiary">
                {course.acts.length} acts
              </span>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: course.theme.accent }}
              />
            </div>
            {course.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                {course.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-tertiary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </main>
  )
}
