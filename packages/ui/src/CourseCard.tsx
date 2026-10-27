export interface CourseCardProps {
  href: string;
  title: string;
  summary: string;
  meta?: string;
}

export function CourseCard({ href, title, summary, meta }: CourseCardProps) {
  return (
    <article className="flex h-full flex-col rounded-card border border-line bg-surface p-4">
      <h3 className="text-lg font-bold">
        <a href={href} className="text-primary underline-offset-4 hover:underline">
          {title}
        </a>
      </h3>
      <p className="mt-2 flex-1">{summary}</p>
      {meta ? <p className="mt-3 text-sm text-ink-muted">{meta}</p> : null}
    </article>
  );
}
