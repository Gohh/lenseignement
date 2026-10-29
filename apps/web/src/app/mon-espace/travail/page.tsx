import type { MyWorkItem, MyWorkKind } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon travail' };

const SECTIONS: Array<{ kind: MyWorkKind; title: string; empty: string; action: string }> = [
  {
    kind: 'to_fix',
    title: 'Renvoyés pour correction',
    empty: 'Aucun cours ne vous a été renvoyé.',
    action: 'Corriger',
  },
  {
    kind: 'to_review',
    title: 'À relire',
    empty: 'Aucun cours n’attend votre relecture.',
    action: 'Relire',
  },
  {
    kind: 'to_publish',
    title: 'À publier',
    empty: 'Aucun cours approuvé n’attend votre publication.',
    action: 'Publier',
  },
  {
    kind: 'to_write',
    title: 'Mes brouillons',
    empty: 'Aucun brouillon en cours.',
    action: 'Continuer',
  },
];

const cardClass = 'rounded-big border border-line bg-surface p-5';

export default async function MyWorkPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/travail');

  const work = await apiGet<{ items: MyWorkItem[] }>(session.accessToken, '/authoring/my-work');
  const items = work.ok ? work.data.items : [];

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Section / Mon travail</p>
        <h1 className="text-4xl font-extrabold">Mon travail</h1>
        <p className="text-ink-muted">
          Ce qui vous attend : rédiger, corriger, relire ou publier. Vous ne voyez jamais à relire
          ou à publier un cours sur lequel vous avez déjà travaillé.
        </p>
      </div>

      {SECTIONS.map((section) => {
        const list = items.filter((i) => i.kind === section.kind);
        return (
          <div
            key={section.kind}
            className={cardClass}
            data-testid={`work-${section.kind}`}
            aria-labelledby={`work-${section.kind}-title`}
            role="region"
          >
            <h2 id={`work-${section.kind}-title`} className="text-xl font-extrabold">
              {section.title} <span className="text-ink-muted">({list.length})</span>
            </h2>
            {list.length > 0 ? (
              <ul className="mt-2 divide-y divide-line" role="list">
                {list.map((item) => (
                  <li key={item.versionId} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="font-bold">{item.title}</p>
                        <p className="text-sm text-ink-muted">
                          {item.organization.name} · version {item.number}
                        </p>
                      </div>
                      <Link
                        href={`/mon-espace/cours/versions/${item.versionId}`}
                        className="inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark"
                      >
                        {section.action}
                        <span className="sr-only"> « {item.title} »</span>
                      </Link>
                    </div>
                    {item.remark && (
                      <blockquote className="rounded-card border-l-4 border-accent bg-accent-soft p-3 text-accent-ink">
                        <p className="text-sm font-bold">
                          Remarque{item.remarkBy ? ` de ${item.remarkBy}` : ''}
                        </p>
                        <p className="whitespace-pre-line">{item.remark}</p>
                      </blockquote>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-ink-muted">{section.empty}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
