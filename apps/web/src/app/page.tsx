import { LEVEL_GROUPS, levelLabel, type CatalogPage } from '@lenseignement/types';
import { Logo, CourseCard } from '@lenseignement/ui';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { publicApiGet } from '@/lib/api';
import { BRANCH_ICONS } from '@/lib/branch-icons';

export const dynamic = 'force-dynamic';

type GroupCode = (typeof LEVEL_GROUPS)[number]['code'];

/** Les quatre grandes entrées de l'accueil ; chaque niveau mène au catalogue déjà filtré. */
const SPACES: ReadonlyArray<{
  title: string;
  hint: string;
  href: string;
  groups: readonly GroupCode[];
  icon: string;
  links?: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    title: 'École',
    hint: 'Maternelle et primaire',
    href: '/branches/primaire',
    groups: ['maternelle', 'primaire'],
    icon: '📘',
  },
  {
    title: 'Secondaire',
    hint: 'Collège et lycée',
    href: '/branches/secondaire',
    groups: ['college', 'lycee'],
    icon: '🎓',
  },
  {
    title: 'Alphabétisation',
    hint: 'Jeunes et adultes, à l’écoute',
    href: '/branches/alphabetisation',
    groups: ['alphabetisation'],
    icon: '🔊',
  },
  {
    title: 'Se former',
    hint: 'Un métier ou le métier d’enseignant',
    href: '/branches/technique',
    groups: [],
    icon: '🛠️',
    links: [
      { href: '/branches/technique', label: 'Métiers et ateliers' },
      { href: '/branches/formation-enseignants', label: 'Enseignants' },
    ],
  },
];

const chipClass =
  'inline-flex min-h-[44px] items-center rounded-full border-2 border-primary-line bg-surface px-4 font-bold text-ink-strong no-underline hover:border-primary hover:bg-primary-soft';

const STEPS = [
  { title: 'J’écoute', text: 'Une leçon courte, lue à voix haute.' },
  { title: 'Je m’entraîne', text: 'Un petit quiz, et la correction expliquée tout de suite.' },
  { title: 'Je progresse', text: 'Ma progression est gardée, même sans réseau.' },
];

export default async function HomePage() {
  const catalog = await publicApiGet<CatalogPage>('/catalog/courses');
  const popular = catalog.ok ? catalog.data.items.slice(0, 4) : [];

  return (
    <div className="space-y-12">
      <section className="flex flex-col gap-8 py-4 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex-1">
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
            Apprendre à son rythme, même avec peu de réseau.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">
            Des leçons courtes à écouter, des quiz pour s’entraîner et une progression qui se garde.
            Pour l’école, le métier et la lecture.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/catalogue"
              className={`${buttonClass} min-h-[56px] px-7 text-xl font-display`}
            >
              Commencer à apprendre
            </a>
            <a
              href="/branches/formation-enseignants"
              className={`${secondaryButtonClass} min-h-[56px] px-6 text-xl font-display`}
            >
              Je suis enseignant
            </a>
          </div>
          <p className="mt-4">
            <a
              href="/auth/login?inscription=1"
              className="inline-flex min-h-[44px] items-center font-bold"
            >
              Créer mon compte
            </a>
            <span className="text-ink-muted"> · gratuit, pour garder ta progression</span>
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-ink-muted" role="list">
            <li>✓ Marche sans internet</li>
            <li>✓ Leçons lues à voix haute</li>
            <li>✓ Gratuit</li>
          </ul>
        </div>
        <div className="flex flex-1 justify-center" aria-hidden="true">
          <div className="relative w-full max-w-sm rounded-[28px] bg-primary p-8 text-surface shadow-soft">
            <Logo size={88} />
            <p className="mt-6 font-display text-3xl font-extrabold leading-tight">
              Écouter. S’entraîner. Progresser.
            </p>
            <p className="mt-2">Une leçon à la fois, à ton rythme.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="niveaux-title">
        <h2 id="niveaux-title" className="text-3xl font-extrabold">
          Choisis ton niveau
        </h2>
        <p className="mb-5 mt-1 text-lg text-ink-muted">
          Les cours sont rangés par niveau : choisis le tien.
        </p>
        <ul className="grid gap-4 md:grid-cols-2" role="list">
          {SPACES.map((space) => (
            <li
              key={space.title}
              className="flex flex-col gap-4 rounded-big border border-line bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-card bg-primary-soft text-2xl"
                >
                  {space.icon}
                </span>
                <div>
                  <h3 className="text-2xl font-extrabold">
                    <a href={space.href} className="text-ink-strong no-underline hover:underline">
                      {space.title}
                    </a>
                  </h3>
                  <p className="text-ink-muted">{space.hint}</p>
                </div>
              </div>
              {LEVEL_GROUPS.filter((g) => space.groups.includes(g.code)).map((group) => (
                <div key={group.code}>
                  {space.groups.length > 1 || group.code !== 'alphabetisation' ? (
                    <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
                      {group.title}
                    </p>
                  ) : null}
                  <ul className="flex flex-wrap gap-2" role="list">
                    {group.levels.map((level) => (
                      <li key={level.code}>
                        <a
                          href={`/catalogue?level=${level.code}`}
                          className={chipClass}
                          aria-label={levelLabel(level.code) ?? level.title}
                        >
                          {level.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {space.links ? (
                <ul className="flex flex-wrap gap-2" role="list">
                  {space.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className={chipClass}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {popular.length > 0 ? (
        <section aria-labelledby="populaires-title">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="populaires-title" className="text-3xl font-extrabold">
              Cours à découvrir
            </h2>
            <a href="/catalogue" className="inline-flex min-h-[44px] items-center font-bold">
              Voir tout le catalogue
            </a>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
            {popular.map((course) => (
              <li key={course.id}>
                <CourseCard
                  href={`/catalogue/${course.id}`}
                  title={course.title}
                  summary={course.summary}
                  tag={(course.level && levelLabel(course.level)) || undefined}
                  illustration={BRANCH_ICONS[course.branch] ?? '📘'}
                  meta={[
                    `${course.lessonCount} leçon${course.lessonCount > 1 ? 's' : ''}`,
                    course.estimatedMinutes ? `${course.estimatedMinutes} min` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-labelledby="marche-title"
        className="rounded-[32px] bg-primary p-6 text-surface sm:p-10"
      >
        <h2 id="marche-title" className="mb-6 !text-surface text-3xl font-extrabold">
          Comment ça marche ?
        </h2>
        <ol className="grid gap-6 md:grid-cols-3" role="list">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent font-display text-2xl font-extrabold text-ink"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-2xl font-bold">{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
