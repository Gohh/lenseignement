import {
  levelLabel,
  ORAL_PART_KIND_LABELS,
  ORAL_SUBJECT_LABELS,
  oralItems,
  type OralTestDetail,
} from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { OralEditor } from '@/components/OralEditor';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { copyOralTestAction, deleteOralTestAction, publishOralTestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Épreuve orale' };

/** Une épreuve orale : l'éditeur tant qu'elle est en brouillon, puis la lecture seule. */
export default async function OralTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/oral/${id}`);
  const query = (await searchParams) ?? {};
  const [res, orgs] = await Promise.all([
    apiGet<OralTestDetail>(session.accessToken, `/oral/tests/${id}`),
    apiGet<{ items: Array<{ id: string; name: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
  ]);
  if (!res.ok) notFound();
  const test = res.data;
  const organizations = orgs.ok ? orgs.data.items : [];

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
        ← Évaluations orales
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{test.title}</h1>
          <p className="text-ink-muted">
            {ORAL_SUBJECT_LABELS[test.subject]} · {levelLabel(test.level) ?? test.level} ·{' '}
            {test.organization.name}
            {test.author ? ` · ${test.author}` : ''}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            test.status === 'publiee' ? 'bg-primary-soft text-primary' : 'bg-line text-ink'
          }`}
          data-testid="oral-status"
        >
          {test.status === 'publiee' ? 'Publiée' : 'Brouillon'}
        </span>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <div className="flex flex-wrap gap-2">
        <Link href={`/mon-espace/oral/${test.id}/feuille`} className={secondaryButtonClass}>
          Feuille de l’élève (à imprimer)
        </Link>
        {test.canPublish && (
          <form action={publishOralTestAction}>
            <input type="hidden" name="id" value={test.id} />
            <PendingButton className={buttonClass} pendingLabel="Publication…">
              Publier l’épreuve
            </PendingButton>
          </form>
        )}
        {organizations.length > 0 && test.status === 'publiee' && (
          <form action={copyOralTestAction}>
            <input type="hidden" name="id" value={test.id} />
            <PendingButton className={secondaryButtonClass} pendingLabel="Copie…">
              Faire une copie modifiable
            </PendingButton>
          </form>
        )}
        {test.canEdit && test.resultCount === 0 && (
          <form action={deleteOralTestAction}>
            <input type="hidden" name="id" value={test.id} />
            <PendingButton
              className="inline-flex min-h-[44px] items-center px-3 font-bold text-error underline"
              pendingLabel="Suppression…"
            >
              Supprimer le brouillon
            </PendingButton>
          </form>
        )}
      </div>
      {test.status === 'brouillon' && !test.canPublish && (
        <p className="rounded-card border border-line bg-surface p-4 text-sm">
          Quand le brouillon est prêt, la direction, le référent ou le conseiller pédagogique de la
          structure le publie. Une fois publiée, l’épreuve est figée.
        </p>
      )}

      {test.canEdit ? (
        <OralEditor test={test} organizations={organizations} />
      ) : (
        <ol className="space-y-4">
          {test.parts.map((part, i) => {
            const items = oralItems(part);
            return (
              <li key={i} className="space-y-2 rounded-big border border-line bg-surface p-5">
                <h2 className="font-display text-xl font-bold">
                  {i + 1}. {part.title}
                  {part.reference && (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-sm text-primary">
                      Repère
                    </span>
                  )}
                </h2>
                <p className="text-sm text-ink-muted">
                  {ORAL_PART_KIND_LABELS[part.kind]}
                  {part.kind !== 'questions' && ` · ${part.seconds} s · ${items.length} éléments`}
                  {part.questions.length > 0 && ` · ${part.questions.length} question(s)`}
                </p>
                {part.instruction && <p className="italic">« {part.instruction} »</p>}
                {part.kind === 'grille' && (
                  <p className="font-mono text-sm">
                    {items.slice(0, 30).join(' · ')}
                    {items.length > 30 ? ' …' : ''}
                  </p>
                )}
                {part.kind === 'texte' && <p>{part.text}</p>}
                {part.questions.length > 0 && (
                  <ul className="list-disc pl-6 text-sm">
                    {part.questions.map((q, k) => (
                      <li key={k}>
                        {q.prompt} <span className="text-ink-muted">({q.answer})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
