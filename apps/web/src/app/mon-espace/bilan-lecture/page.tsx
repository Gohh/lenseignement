import { randomUUID } from 'node:crypto';
import type { DiagnosticForm, RemediationOverview } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { PlanCard, QuestionSeries, SkillResults } from '@/components/Remediation';
import { apiGet } from '@/lib/api';
import { READING_DIAGNOSTIC as CODE } from '@/lib/remediation';
import { getSession } from '@/lib/session';
import { submitDiagnosticAction, submitPostTestAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon bilan de lecture' };

const cardClass = 'space-y-3 rounded-card border border-line bg-surface p-4';

/**
 * Bilan de lecture et rattrapage de l'apprenant (ADR-013) : bilan, compétence à travailler et
 * pourquoi, cours conseillé, puis petit test de vérification.
 */
export default async function ReadingCheckPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/bilan-lecture');
  const query = (await searchParams) ?? {};
  const retake = query.refaire === '1';

  const state = await apiGet<RemediationOverview>(session.accessToken, `/me/remediation/${CODE}`);
  if (!state.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Mon bilan de lecture</h1>
        <p>Le bilan est momentanément indisponible. Réessaie plus tard.</p>
      </section>
    );
  }
  const { latest, plan, postTest, diagnostic } = state.data;
  const active = plan?.status === 'active';
  const showDiagnostic = !latest || retake || !active;
  const [form, postForm] = await Promise.all([
    showDiagnostic
      ? apiGet<DiagnosticForm>(session.accessToken, `/diagnostics/${CODE}`)
      : Promise.resolve(null),
    active
      ? apiGet<DiagnosticForm>(session.accessToken, `/me/remediation/${CODE}/post-test`)
      : Promise.resolve(null),
  ]);

  return (
    <section className="mx-auto max-w-prose space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      <h1 className="text-3xl font-bold">Mon bilan de lecture</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <p className="text-ink-muted">
        {diagnostic.title} · programme {diagnostic.curriculum.code}, version{' '}
        {diagnostic.curriculum.label}. Exercices fictifs de démonstration.
      </p>

      {latest && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Ton dernier bilan</h2>
          <SkillResults results={latest.results} />
        </div>
      )}

      {plan && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Ton rattrapage</h2>
          <PlanCard plan={plan} />
        </div>
      )}
      {latest && !plan && (
        <p className="rounded-card border border-line-strong bg-surface p-4 font-bold">
          Bravo, tout est acquis dans ce bilan !
        </p>
      )}

      {active && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Petit test de vérification</h2>
          {postTest && !postTest.mastered && (
            <p data-testid="post-test-last">
              Dernier essai : {postTest.score} sur {postTest.total}. Ce n’est pas grave : relis le
              cours, puis réessaie.
            </p>
          )}
          {postForm?.ok ? (
            <QuestionSeries
              items={postForm.data.items}
              sessionId={randomUUID()}
              action={submitPostTestAction}
              submitLabel="Vérifier mes réponses"
            />
          ) : (
            <p>Pas encore de petit test pour cette compétence : ton enseignant te guidera.</p>
          )}
        </div>
      )}

      {showDiagnostic && form?.ok ? (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">{latest ? 'Refaire le bilan' : 'Passer le bilan'}</h2>
          <p>
            Quelques questions courtes pour voir ce que tu sais déjà lire. Réponds sans te presser :
            ce n’est pas une note.
          </p>
          <QuestionSeries
            items={form.data.items}
            sessionId={randomUUID()}
            action={submitDiagnosticAction}
            submitLabel="Envoyer mon bilan"
          />
        </div>
      ) : (
        latest && (
          <Link
            href="/mon-espace/bilan-lecture?refaire=1"
            className="inline-flex min-h-[44px] items-center underline"
          >
            Refaire le bilan
          </Link>
        )
      )}
    </section>
  );
}
