import type { ReactNode } from 'react';

export interface CourseCardProps {
  href: string;
  title: string;
  summary: string;
  meta?: string;
  /** Étiquette en haut de la carte (niveau, espace…). */
  tag?: string;
  /** Texte court ou pictogramme décoratif affiché dans le bandeau vert clair. */
  illustration?: ReactNode;
}

export function CourseCard({ href, title, summary, meta, tag, illustration }: CourseCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-big border border-line bg-surface transition-shadow focus-within:shadow-soft hover:shadow-soft">
      {illustration ? (
        <div
          aria-hidden="true"
          className="flex h-24 items-center justify-center bg-primary-soft px-3 text-center font-display text-3xl font-extrabold text-primary"
        >
          {illustration}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-4">
        {tag ? (
          <p className="mb-2 self-start rounded-full bg-primary-soft px-3 py-0.5 text-sm font-bold text-primary">
            {tag}
          </p>
        ) : null}
        <h3 className="text-xl font-bold">
          <a href={href} className="text-ink-strong underline-offset-4 hover:underline">
            {title}
          </a>
        </h3>
        <p className="mt-2 flex-1 text-ink-muted">{summary}</p>
        {meta ? <p className="mt-3 text-sm font-bold text-ink-muted">{meta}</p> : null}
      </div>
    </article>
  );
}
