import type { MaskedCount, MaskedPercent, StatsOverview } from '@lenseignement/types';
import { BRANCHES } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Statistiques anonymes' };

const cardClass = 'space-y-3 rounded-card border border-line bg-surface p-4';

const count = (n: MaskedCount) => (n === null ? 'moins de 5' : String(n));
const rate = (p: MaskedPercent) => (p === null ? 'pas assez de personnes' : `${p} %`);

function Figures({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Tableau de chiffres anonymes (ADR-016) : direction et référents, pour leurs structures.
 * Aucun nom ; un groupe de 1 à 4 personnes est affiché « moins de 5 ».
 */
export default async function StatsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/statistiques');
  const stats = await apiGet<StatsOverview>(session.accessToken, '/stats/overview');

  return (
    <section className="mx-auto max-w-prose space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      <h1 className="text-3xl font-bold">Statistiques anonymes</h1>
      {!stats.ok ? (
        <p>Ce tableau est réservé à la direction des établissements et aux référents.</p>
      ) : (
        <>
          <p className="rounded-card border-2 border-line-strong bg-surface p-4">
            Aucun nom ici : seulement des nombres. Un groupe de moins de {stats.data.threshold}{' '}
            personnes s’affiche « moins de {stats.data.threshold} », pour que personne ne soit
            reconnu. Données fictives de démonstration.
          </p>
          <p className="text-ink-muted" data-testid="stats-scope">
            Structures : {stats.data.organizations.join(', ')}.
          </p>

          <h2 className="text-2xl font-bold">Cours</h2>
          {stats.data.courses.length === 0 && <p>Aucun cours publié dans vos structures.</p>}
          {stats.data.courses.map((c) => (
            <div key={c.courseId} className={cardClass} data-testid="stats-course">
              <h3 className="text-lg font-bold">{c.title}</h3>
              <p className="text-ink-muted">
                {BRANCHES.find((b) => b.code === c.branch)?.title ?? c.branch}
              </p>
              <Figures
                rows={[
                  ['Inscrits', count(c.enrolled)],
                  ['Ont commencé', count(c.started)],
                  ['Ont terminé le cours', count(c.completed)],
                  ['Actifs ces 7 derniers jours', count(c.active7)],
                  ['Actifs ces 30 derniers jours', count(c.active30)],
                  ['Bonnes réponses aux quiz', rate(c.quizSuccess)],
                ]}
              />
            </div>
          ))}

          <div className={cardClass} data-testid="stats-remediation">
            <h2 className="text-xl font-bold">Rattrapage en lecture</h2>
            <Figures
              rows={[
                ['Élèves qui ont passé le bilan', count(stats.data.remediation.diagnosed)],
                ['Rattrapages en cours', count(stats.data.remediation.inProgress)],
                ['Rattrapages réussis', count(stats.data.remediation.completed)],
                ['Part des rattrapages réussis', rate(stats.data.remediation.effectiveRate)],
              ]}
            />
          </div>

          <div className={cardClass} data-testid="stats-workshop">
            <h2 className="text-xl font-bold">Atelier virtuel de sécurité</h2>
            <Figures
              rows={[
                ['Apprenants qui ont essayé', count(stats.data.workshop.tried)],
                ['Ont réussi la simulation', count(stats.data.workshop.passed)],
                ['Ont demandé leur séance encadrée', count(stats.data.workshop.requested)],
              ]}
            />
          </div>
          <p className="text-sm text-ink-muted">
            Calculé le {new Date(stats.data.generatedAt).toLocaleString('fr-FR')}.
          </p>
        </>
      )}
    </section>
  );
}
