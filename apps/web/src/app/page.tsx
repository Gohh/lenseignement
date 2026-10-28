import { BRANCHES } from '@lenseignement/types';
import { AudienceSelector, CourseCard, Logo, type AudienceChoice } from '@lenseignement/ui';

const CHOICES: readonly AudienceChoice[] = [
  {
    href: '/branches/primaire',
    label: 'Je veux apprendre',
    hint: 'Lecture, calcul, cours',
    icon: '📘',
  },
  {
    href: '/branches/formation-enseignants',
    label: 'Je veux enseigner',
    hint: 'Fiches, suivi, remédiation',
    icon: '🧑🏾‍🏫',
  },
  {
    href: '/branches/technique',
    label: 'Je veux me former à un métier',
    hint: 'Filières et ateliers',
    icon: '🛠️',
  },
  {
    href: '/branches/alphabetisation',
    label: 'Je veux apprendre à lire',
    hint: 'Écouter d’abord, puis lire',
    icon: '🔊',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 rounded-card bg-primary p-5 text-surface sm:flex-row sm:items-center sm:p-8">
        <div className="shrink-0">
          <Logo size={72} />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-4xl">
            Apprendre, progresser, se former. Même avec peu de réseau.
          </h1>
          <p className="mt-3 max-w-2xl">
            Version de démonstration : les contenus affichés sont fictifs.
          </p>
        </div>
      </section>

      <AudienceSelector choices={CHOICES} />

      <section aria-labelledby="branches-title">
        <h2 id="branches-title" className="mb-4 text-2xl font-bold">
          Les espaces
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {BRANCHES.map((branch) => (
            <li key={branch.code}>
              <CourseCard
                href={`/branches/${branch.code}`}
                title={branch.title}
                summary={branch.summary}
                meta={branch.audience}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
