import { levelLabel, type OralClassResults } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Tile } from '@/components/ExamCharts';
import { OralBands, OralPartBars } from '@/components/OralCharts';
import { Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PrintButton } from '@/app/mon-espace/statistiques/PrintButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats oraux de la classe' };

const ID = /^[0-9a-f-]{36}$/i;

/** Résultats d'une classe : médiane par minute, élèves à zéro, repère atteint, élève par élève. */
export default async function OralResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const test = param(query.epreuve) ?? '';
  const cohort = param(query.classe) ?? '';
  const session = await getSession();
  if (!session) {
    redirect(
      `/auth/login?returnTo=${encodeURIComponent(`/mon-espace/oral/resultats?epreuve=${test}&classe=${cohort}`)}`,
    );
  }
  if (!ID.test(test) || !ID.test(cohort)) redirect('/mon-espace/oral');
  const res = await apiGet<OralClassResults>(
    session.accessToken,
    `/oral/results?test=${test}&cohort=${cohort}`,
  );
  if (!res.ok) {
    return (
      <section className="mx-auto max-w-5xl space-y-6">
        <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
          ← Évaluations orales
        </Link>
        <Notice error="Ces résultats ne sont pas disponibles pour vous." />
      </section>
    );
  }
  const r = res.data;
  const ref = r.test.parts[r.referencePart]!;
  const refUnit = ref.kind === 'questions' ? `sur ${ref.questions.length}` : 'par minute';
  const total = r.bands.reduce((a, b) => a + b.count, 0);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
          ← Évaluations orales
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/mon-espace/oral/passer?epreuve=${r.test.id}&classe=${r.cohort.id}`}
            className={secondaryButtonClass}
          >
            Faire passer
          </Link>
          <PrintButton className={secondaryButtonClass} />
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-extrabold">{r.test.title}</h1>
        <p className="text-ink-muted">
          {r.cohort.name} · {r.cohort.school} · {levelLabel(r.test.level) ?? r.test.level}
        </p>
      </div>
      <p className="rounded-card border border-line bg-surface p-4 text-sm">
        Partie suivie pour le repère : <strong>{ref.title}</strong>.{' '}
        {r.benchmark
          ? `Repère de ce niveau : ${r.benchmark.perMinute} ${refUnit}${r.benchmark.questions !== null ? ` et ${r.benchmark.questions} question(s) juste(s)` : ''}.`
          : 'Aucun repère n’est encore réglé pour ce niveau : le superadministrateur le fixe.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="oral-tiles">
        <Tile
          label="Élèves évalués"
          value={`${r.evaluated} / ${r.cohort.learners}`}
          hint="dans la classe"
        />
        <Tile
          label="Score du milieu"
          value={r.median === null ? '–' : String(r.median)}
          hint={`${refUnit} (médiane)`}
        />
        <Tile
          label="Élèves à zéro"
          value={r.zeroRate === null ? '–' : `${r.zeroRate} %`}
          hint="aucun juste sur la partie suivie"
        />
        <Tile
          label="Repère atteint"
          value={r.benchmarkRate === null ? '–' : `${r.benchmarkRate} %`}
          hint={r.benchmark ? 'des élèves évalués' : 'pas encore de repère'}
        />
      </div>

      {total > 0 && (
        <div
          className="space-y-3 rounded-big border border-line bg-surface p-5"
          data-testid="oral-bands"
        >
          <h2 className="font-display text-xl font-bold">Où en sont les élèves</h2>
          <OralBands bands={r.bands} />
        </div>
      )}

      {r.evaluated > 0 && (
        <div className="space-y-3 rounded-big border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Moyenne par partie</h2>
          <OralPartBars parts={r.byPart} />
        </div>
      )}

      <div
        tabIndex={0}
        role="region"
        aria-label="Résultats élève par élève"
        className="overflow-x-auto rounded-big border border-line bg-surface"
      >
        <table className="w-full text-left text-sm" data-testid="oral-learners-table">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3">Élève</th>
              {r.test.parts.map((p, i) => (
                <th key={i} className="p-3">
                  {p.title}
                </th>
              ))}
              <th className="p-3">Repère</th>
            </tr>
          </thead>
          <tbody>
            {r.learners.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="p-3 font-bold">
                  {l.name}
                  {l.takenAt && (
                    <span className="block text-xs font-normal text-ink-muted">
                      {new Date(l.takenAt).toLocaleDateString('fr-FR')}
                      {l.assessor ? ` · ${l.assessor}` : ''}
                    </span>
                  )}
                </td>
                {r.test.parts.map((p, i) => {
                  const s = l.scores?.[i];
                  return (
                    <td key={i} className="p-3 tabular-nums">
                      {!s
                        ? '–'
                        : s.perMinute !== null
                          ? `${s.perMinute}/min`
                          : `${s.correct}/${s.total}`}
                      {s?.questionsCorrect != null && (
                        <span className="block text-xs text-ink-muted">
                          questions {s.questionsCorrect}/{p.questions.length}
                        </span>
                      )}
                      {s?.stopped && <span className="block text-xs text-ink-muted">arrêtée</span>}
                    </td>
                  );
                })}
                <td className="p-3">
                  {l.scores === null
                    ? 'Pas encore passé'
                    : l.reached === null
                      ? '–'
                      : l.reached
                        ? 'Atteint'
                        : 'Pas encore'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
