import {
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_STEP_KIND_LABELS,
  WORKSHOP_TRADE_ICONS,
  WORKSHOP_TRADE_LABELS,
  type WorkshopCompetencyOption,
  type WorkshopDetail,
  type WorkshopStepInput,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { WorkshopEditor } from '@/components/WorkshopEditor';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  deleteWorkshopAction,
  returnWorkshopAction,
  saveWorkshopAction,
  workshopStepAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atelier' };

const card = 'space-y-3 rounded-big border border-line bg-surface p-5';

/** Bouton d'une étape du circuit (envoyer, publier, rouvrir, retirer, remettre en ligne). */
function StepButton({
  id,
  step,
  label,
  primary,
}: {
  id: string;
  step: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={workshopStepAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="step" value={step} />
      <button type="submit" className={primary ? buttonClass : secondaryButtonClass}>
        {label}
      </button>
    </form>
  );
}

/** Étapes avec leur corrigé, pour la relecture. */
function StepsPreview({ steps }: { steps: WorkshopStepInput[] }) {
  return (
    <ol className="space-y-4" data-testid="workshop-preview">
      {steps.map((step, i) => (
        <li key={i} className="rounded-card border border-line p-4">
          <p className="text-sm font-bold text-ink-muted">
            Étape {i + 1} · {WORKSHOP_STEP_KIND_LABELS[step.kind]}
          </p>
          <h3 className="font-display text-lg font-bold">{step.title}</h3>
          {step.instructions && <p>{step.instructions}</p>}
          {step.kind === 'identify' &&
            step.questions.map((q, k) => (
              <div key={k} className="mt-2">
                <p className="font-bold">{q.prompt}</p>
                <ul className="list-disc pl-6">
                  {q.choices.map((c, n) => (
                    <li key={n}>
                      {c}
                      {n === q.correct && <strong> ✓ bonne réponse</strong>}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="text-ink-muted">{q.explanation}</p>}
              </div>
            ))}
          {step.kind === 'equipment' && (
            <ul className="mt-2 list-disc pl-6">
              {step.options.map((o, k) => (
                <li key={k}>
                  <strong>{o.needed ? 'À prendre' : 'À laisser'}</strong> : {o.label}
                  {o.explanation && <span className="text-ink-muted"> ({o.explanation})</span>}
                </li>
              ))}
            </ul>
          )}
          {step.kind === 'h5p' && (
            <div className="mt-2 space-y-2">
              <p>
                Fichier : <strong>{step.packageTitle || 'Exercice H5P'}</strong> · score à atteindre
                : {step.passPercent} %
              </p>
              <iframe
                src={`/h5p/lecteur/${step.packageKey}`}
                title={`Aperçu : ${step.packageTitle || 'exercice H5P'}`}
                sandbox="allow-scripts"
                className="h-[480px] w-full rounded-card border border-line"
              />
            </div>
          )}
          {step.kind === 'order' && (
            <ol className="mt-2 list-decimal pl-6">
              {step.gestures.map((g, k) => (
                <li key={k}>
                  {g.label}
                  {g.explanation && <span className="text-ink-muted"> ({g.explanation})</span>}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}

export default async function WorkshopAuthoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const here = `/mon-espace/ateliers/${id}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  const query = (await searchParams) ?? {};

  const [result, competencies] = await Promise.all([
    apiGet<WorkshopDetail>(session.accessToken, `/authoring/workshops/${encodeURIComponent(id)}`),
    apiGet<{ items: WorkshopCompetencyOption[] }>(
      session.accessToken,
      '/authoring/workshops/competencies',
    ),
  ]);
  const backLink = (
    <Link href="/mon-espace/ateliers" className="inline-flex min-h-[44px] items-center underline">
      ← Ateliers
    </Link>
  );
  if (!result.ok) {
    return (
      <section className="space-y-4">
        {backLink}
        <h1 className="text-3xl font-extrabold">Atelier</h1>
        <p>Atelier introuvable.</p>
      </section>
    );
  }
  const w = result.data;
  const editing = w.canEdit && w.status === 'draft';

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      {backLink}
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          <span aria-hidden="true">{WORKSHOP_TRADE_ICONS[w.trade]}</span>{' '}
          {WORKSHOP_TRADE_LABELS[w.trade]} · {w.organization.name}
          {w.author ? ` · ${w.author}` : ''}
        </p>
        <h1 className="text-3xl font-extrabold">{w.title}</h1>
        <p data-testid="workshop-status">
          <strong>{WORKSHOP_STATUS_LABELS[w.status]}</strong>
          {w.live && w.status === 'draft' && ' · une version publiée reste en ligne'}
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {w.reviewNote && w.status === 'draft' && (
        <div className="rounded-card border-2 border-accent bg-accent-soft p-4">
          <p className="font-bold text-accent-ink">Remarque de la relecture</p>
          <p>{w.reviewNote}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {editing && w.stepCount > 0 && (
          <StepButton id={w.id} step="submit" label="Envoyer en relecture" primary />
        )}
        {w.canEdit && (w.status === 'published' || w.status === 'archived') && (
          <StepButton id={w.id} step="reopen" label="Modifier" />
        )}
        {w.canPublish && w.status === 'review' && (
          <StepButton id={w.id} step="publish" label="Publier" primary />
        )}
        {w.canPublish && w.status === 'published' && (
          <StepButton id={w.id} step="archive" label="Retirer du catalogue" />
        )}
        {w.canPublish && w.status === 'archived' && (
          <StepButton id={w.id} step="restore" label="Remettre en ligne" />
        )}
        {w.liveCode && (
          <Link
            href={`/mon-espace/atelier/${encodeURIComponent(w.liveCode)}`}
            className={secondaryButtonClass}
          >
            Voir comme un élève
          </Link>
        )}
      </div>

      {w.canPublish && w.status === 'review' && (
        <form action={returnWorkshopAction} className={card}>
          <input type="hidden" name="id" value={w.id} />
          <label className="block font-bold">
            Renvoyer à l’auteur avec une remarque
            <textarea name="note" required maxLength={600} rows={3} className={inputClass} />
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Renvoyer
          </button>
        </form>
      )}

      {editing ? (
        <WorkshopEditor
          id={w.id}
          action={saveWorkshopAction}
          competencies={competencies.ok ? competencies.data.items : []}
          initial={{
            trade: w.trade,
            title: w.title,
            summary: w.summary,
            competencyId: w.competency?.id ?? null,
            practice: w.practice,
            steps: w.steps,
          }}
        />
      ) : (
        <div className={card}>
          <h2 className="text-xl font-extrabold">Contenu et corrigé</h2>
          {w.summary && <p>{w.summary}</p>}
          <p className="text-ink-muted">
            {w.competency
              ? `Compétence : ${w.competency.code} ${w.competency.title} (${w.competency.curriculum}).`
              : 'Aucune compétence de programme.'}{' '}
            {w.practice
              ? 'Séance pratique avec le formateur après réussite.'
              : 'Pas de séance pratique.'}
          </p>
          <StepsPreview steps={w.steps} />
        </div>
      )}

      {editing && !w.live && (
        <form action={deleteWorkshopAction}>
          <input type="hidden" name="id" value={w.id} />
          <button type="submit" className="min-h-[44px] font-bold text-error underline">
            Supprimer ce brouillon
          </button>
        </form>
      )}
    </section>
  );
}
