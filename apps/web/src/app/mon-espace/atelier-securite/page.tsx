import { randomUUID } from 'node:crypto';
import type { SimulationOverview } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { AttemptResult, PracticeCard, SimulationForm } from '@/components/Simulation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { SAFETY_SIMULATION as CODE } from '@/lib/simulation';
import { requestPracticeAction, submitSimulationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atelier virtuel : sécurité' };

const cardClass = 'space-y-3 rounded-card border border-line bg-surface p-4';

/**
 * Atelier virtuel de l'apprenant (ADR-014) : simulation de sécurité, ce qu'il faut revoir, puis
 * demande de séance pratique, bloquée tant que la simulation n'est pas réussie (E2E-05).
 */
export default async function SafetyWorkshopPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/atelier-securite');
  const query = (await searchParams) ?? {};

  const state = await apiGet<SimulationOverview>(session.accessToken, `/me/simulations/${CODE}`);
  if (!state.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Atelier virtuel</h1>
        <p>L’atelier est momentanément indisponible. Réessaie plus tard.</p>
      </section>
    );
  }
  const { simulation, steps, lastAttempt, practice } = state.data;

  return (
    <section className="mx-auto max-w-prose space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      <h1 className="text-3xl font-bold">Atelier virtuel : sécurité</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <p className="text-ink-muted">
        {simulation.title} · référentiel {simulation.curriculum.code}, version{' '}
        {simulation.curriculum.label}. Compétence : {simulation.competency.title}. Exercice fictif
        de démonstration.
      </p>
      <p className="rounded-card border-2 border-line-strong bg-surface p-4 font-bold">
        Ici, tu t’entraînes sans danger. Dans un vrai atelier, ne touche jamais une installation
        électrique sans ton formateur.
      </p>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Ta séance pratique</h2>
        <PracticeCard
          status={practice.status}
          title={simulation.practice.title}
          action={requestPracticeAction}
        />
      </div>

      {lastAttempt && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Ton dernier essai</h2>
          <AttemptResult attempt={lastAttempt} />
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-bold">
          {lastAttempt ? 'Refaire la simulation' : 'Faire la simulation'}
        </h2>
        <SimulationForm steps={steps} attemptId={randomUUID()} action={submitSimulationAction} />
      </div>
    </section>
  );
}
