import { randomUUID } from 'node:crypto';
import {
  WORKSHOP_TRADE_ICONS,
  WORKSHOP_TRADE_LABELS,
  type SimulationOverview,
  type WorkshopTrade,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { AttemptResult, PracticeCard, SimulationForm } from '@/components/Simulation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { requestPracticeAction, submitSimulationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atelier' };

const cardClass = 'space-y-3 rounded-card border border-line bg-surface p-4';

/**
 * Un atelier de l'élève (ADR-014) : les étapes, ce qu'il faut revoir, puis la demande de séance
 * pratique, bloquée tant que l'atelier n'est pas réussi (E2E-05).
 */
export default async function WorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const here = `/mon-espace/atelier/${encodeURIComponent(code)}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  const query = (await searchParams) ?? {};

  const state = await apiGet<SimulationOverview>(
    session.accessToken,
    `/me/simulations/${encodeURIComponent(code)}`,
  );
  const back = (
    <Link href="/mon-espace/atelier" className="inline-flex min-h-[44px] items-center underline">
      ← Tous les ateliers
    </Link>
  );
  if (!state.ok) {
    return (
      <section className="space-y-4">
        {back}
        <h1 className="text-3xl font-bold">Atelier</h1>
        <p>Cet atelier est introuvable ou momentanément indisponible.</p>
      </section>
    );
  }
  const { simulation, steps, lastAttempt, practice } = state.data;
  const trade = (simulation.trade ?? 'electricite') as WorkshopTrade;
  const codeField = <input type="hidden" name="code" value={code} />;

  return (
    <section className="mx-auto max-w-prose space-y-6">
      {back}
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          <span aria-hidden="true">{WORKSHOP_TRADE_ICONS[trade]}</span>{' '}
          {WORKSHOP_TRADE_LABELS[trade]}
        </p>
        <h1 className="text-3xl font-bold">{simulation.title}</h1>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {simulation.summary && <p>{simulation.summary}</p>}
      {simulation.competency && (
        <p className="text-ink-muted">
          Compétence : {simulation.competency.title}
          {simulation.curriculum &&
            ` · programme ${simulation.curriculum.code}, version ${simulation.curriculum.label}`}
          .
        </p>
      )}
      <p className="rounded-card border-2 border-line-strong bg-surface p-4 font-bold">
        Ici, tu t’entraînes sans danger. Dans un vrai atelier, ne touche jamais une installation ou
        une machine sans ton formateur.
      </p>

      {practice.status !== 'none' && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Ta séance pratique</h2>
          <PracticeCard
            status={practice.status}
            title={simulation.practice?.title ?? simulation.title}
            action={requestPracticeAction}
            hidden={codeField}
          />
        </div>
      )}

      {lastAttempt && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Ton dernier essai</h2>
          <AttemptResult attempt={lastAttempt} />
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-bold">
          {lastAttempt ? 'Refaire l’atelier' : 'Faire l’atelier'}
        </h2>
        <SimulationForm
          steps={steps}
          attemptId={randomUUID()}
          action={submitSimulationAction}
          hidden={codeField}
        />
      </div>
    </section>
  );
}
