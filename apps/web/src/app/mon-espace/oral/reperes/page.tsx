import {
  LEVEL_GROUPS,
  ORAL_SUBJECT_LABELS,
  ORAL_SUBJECTS,
  type OralBenchmark,
  type OralOverview,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveBenchmarksAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Repères des évaluations orales' };

const cell =
  'w-20 min-h-[44px] rounded-card border border-line-strong bg-surface px-2 py-1 text-ink tabular-nums';

/** Repères réglés par le superadministrateur, niveau par niveau. */
export default async function OralBenchmarksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/oral/reperes');
  const query = (await searchParams) ?? {};
  const [overview, list] = await Promise.all([
    apiGet<OralOverview>(session.accessToken, '/oral'),
    apiGet<{ items: OralBenchmark[] }>(session.accessToken, '/oral/benchmarks'),
  ]);
  const superadmin = overview.ok && overview.data.superadmin;
  const items = list.ok ? list.data.items : [];
  const find = (level: string, subject: string) =>
    items.find((b) => b.level === level && b.subject === subject);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
        ← Évaluations orales
      </Link>
      <h1 className="text-3xl font-extrabold">Repères des évaluations orales</h1>
      <p className="max-w-2xl text-ink-muted">
        Pour chaque niveau, le nombre de justes par minute à atteindre sur la partie suivie (lecture
        : souvent le petit texte ; mathématiques : souvent les nombres), et, si vous le voulez, le
        nombre de questions justes. Laissez vide : pas de repère pour ce niveau.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {!superadmin ? (
        <p>Seul le superadministrateur règle les repères.</p>
      ) : (
        <form action={saveBenchmarksAction} className="space-y-4" data-testid="oral-benchmarks">
          <div
            tabIndex={0}
            role="region"
            aria-label="Repères par niveau"
            className="overflow-x-auto rounded-big border border-line bg-surface"
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-3">Niveau</th>
                  {ORAL_SUBJECTS.map((s) => (
                    <th key={s} className="p-3" colSpan={2}>
                      {ORAL_SUBJECT_LABELS[s]}
                      <span className="block text-xs font-normal text-ink-muted">
                        par minute · questions
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEVEL_GROUPS.flatMap((group) =>
                  group.levels.map((level) => (
                    <tr key={level.code} className="border-b border-line last:border-0">
                      <th className="p-3 font-bold">
                        {group.title} {level.title}
                      </th>
                      {ORAL_SUBJECTS.map((s) => {
                        const b = find(level.code, s);
                        return [
                          <td key={`${s}-pm`} className="p-2">
                            <input
                              type="number"
                              min={1}
                              max={300}
                              name={`pm-${level.code}-${s}`}
                              defaultValue={b?.perMinute ?? ''}
                              aria-label={`${group.title} ${level.title}, ${ORAL_SUBJECT_LABELS[s]} : justes par minute`}
                              className={cell}
                            />
                          </td>,
                          <td key={`${s}-q`} className="p-2">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              name={`q-${level.code}-${s}`}
                              defaultValue={b?.questions ?? ''}
                              aria-label={`${group.title} ${level.title}, ${ORAL_SUBJECT_LABELS[s]} : questions justes`}
                              className={cell}
                            />
                          </td>,
                        ];
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <PendingButton className={buttonClass} pendingLabel="Enregistrement…">
            Enregistrer les repères
          </PendingButton>
        </form>
      )}
    </section>
  );
}
