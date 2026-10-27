export interface AudienceChoice {
  href: string;
  label: string;
  hint: string;
  /** Pictogramme décoratif (masqué aux lecteurs d'écran). */
  icon: string;
}

export interface AudienceSelectorProps {
  choices: readonly AudienceChoice[];
  title?: string;
}

/** Premier geste utile en moins de 3 interactions (cahier directeur §4.1). */
export function AudienceSelector({
  choices,
  title = 'Que voulez-vous faire ?',
}: AudienceSelectorProps) {
  return (
    <section aria-labelledby="audience-title">
      <h2 id="audience-title" className="mb-4 text-2xl font-bold">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2" role="list">
        {choices.map((choice) => (
          <li key={choice.href}>
            <a
              href={choice.href}
              className="flex min-h-[44px] items-center gap-4 rounded-card border border-line bg-surface p-4 text-ink no-underline transition-colors hover:border-primary"
            >
              <span aria-hidden="true" className="text-3xl">
                {choice.icon}
              </span>
              <span>
                <span className="block text-lg font-bold">{choice.label}</span>
                <span className="block text-ink-muted">{choice.hint}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
