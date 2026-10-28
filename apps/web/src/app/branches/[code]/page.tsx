import { BRANCHES, LEVEL_GROUPS, levelLabel } from '@lenseignement/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { BRANCH_ICONS } from '@/lib/branch-icons';

interface Props {
  params: Promise<{ code: string }>;
}

export function generateStaticParams() {
  return BRANCHES.map((branch) => ({ code: branch.code }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  return { title: branch?.title ?? 'Espace' };
}

export default async function BranchPage({ params }: Props) {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  if (!branch) notFound();

  const groups = LEVEL_GROUPS.filter((g) => g.branch === branch.code);

  return (
    <article className="space-y-6">
      <p>
        <a href="/" className="inline-flex min-h-[44px] items-center font-bold">
          ← Retour à l’accueil
        </a>
      </p>
      <header className="flex items-center gap-4 rounded-[28px] bg-primary p-6 text-surface sm:p-8">
        <span
          aria-hidden="true"
          className="inline-flex h-16 w-16 flex-none items-center justify-center rounded-card bg-surface text-4xl"
        >
          {BRANCH_ICONS[branch.code]}
        </span>
        <div>
          <h1 className="text-3xl font-extrabold !text-surface sm:text-4xl">{branch.title}</h1>
          <p className="mt-1 text-lg">{branch.summary}</p>
        </div>
      </header>
      <p className="text-ink-muted">Public : {branch.audience}</p>
      {groups.length > 0 && (
        <section aria-labelledby="niveaux">
          <h2 id="niveaux" className="mb-3 text-2xl font-extrabold">
            Choisis ton niveau
          </h2>
          <ul className="flex flex-wrap gap-2" role="list">
            {groups.flatMap((g) =>
              g.levels.map((level) => (
                <li key={level.code}>
                  <a
                    href={`/catalogue?level=${level.code}`}
                    aria-label={levelLabel(level.code) ?? level.title}
                    className="inline-flex min-h-[44px] items-center rounded-full border-2 border-primary-line bg-surface px-4 font-bold text-ink-strong no-underline hover:border-primary hover:bg-primary-soft"
                  >
                    {level.title}
                  </a>
                </li>
              )),
            )}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <a href={`/catalogue?branch=${branch.code}`} className={buttonClass}>
          Voir les cours publiés de cet espace
        </a>
        <a href={`/branches/${branch.code}/programme`} className={secondaryButtonClass}>
          Voir le programme et les compétences
        </a>
      </div>
    </article>
  );
}
