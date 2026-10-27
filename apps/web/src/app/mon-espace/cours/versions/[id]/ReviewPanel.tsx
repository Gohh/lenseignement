import {
  REVIEW_CHECKS,
  type CourseVersionDetail,
  type CourseWorkflow,
  type ReviewAction,
} from '@lenseignement/types';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import {
  approveAction,
  publishAction,
  requestChangesAction,
  submitForReviewAction,
  withdrawAction,
} from '../../actions';

const ACTION_LABELS: Record<ReviewAction, string> = {
  submitted: 'Envoyée en relecture',
  changes_requested: 'Modifications demandées',
  approved: 'Approuvée',
  published: 'Publiée',
  replaced: 'Remplacée par une version plus récente',
  withdrawn: 'Retirée',
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Africa/Abidjan',
});

/** Circuit de validation d'une version : historique et actions permises à la personne connectée. */
export function ReviewPanel({
  version,
  workflow,
}: {
  version: CourseVersionDetail;
  workflow: CourseWorkflow;
}) {
  const { can } = workflow;
  const hidden = <input type="hidden" name="versionId" value={version.id} />;

  return (
    <section aria-labelledby="validation" className="space-y-4">
      <h2 id="validation" className="text-xl font-bold">
        Validation
      </h2>

      {can.submit &&
        (workflow.missing.length > 0 ? (
          <div className="rounded-card border border-line-strong bg-surface p-4">
            <p className="font-bold">Avant l’envoi en relecture :</p>
            <ul className="mt-2 list-disc pl-6" data-testid="missing">
              {workflow.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : (
          <form action={submitForReviewAction} className="space-y-2">
            {hidden}
            <input type="hidden" name="revision" value={version.revision} />
            <p>
              Une fois envoyée, la version ne sera plus modifiable. Un référent pédagogique la
              relira, puis une deuxième personne la publiera.
            </p>
            <button type="submit" className={buttonClass}>
              Envoyer en relecture
            </button>
          </form>
        ))}

      {can.approve && (
        <form action={approveAction} className="space-y-3">
          {hidden}
          <fieldset className="rounded-card border border-line bg-surface p-4">
            <legend className="px-1 font-bold">Contrôles avant approbation</legend>
            {Object.entries(REVIEW_CHECKS).map(([name, label]) => (
              <label key={name} className="flex min-h-[44px] items-center gap-3">
                <input type="checkbox" name={name} required className="h-5 w-5" />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block font-bold">
            Commentaire pour l’auteur (facultatif)
            <textarea name="comment" rows={2} maxLength={2000} className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Approuver
          </button>
        </form>
      )}

      {can.publish && (
        <form action={publishAction}>
          {hidden}
          <button type="submit" className={buttonClass}>
            Publier cette version
          </button>
        </form>
      )}

      {can.requestChanges && (
        <form action={requestChangesAction} className="space-y-2">
          {hidden}
          <label className="block font-bold">
            Modifications demandées
            <textarea
              name="comment"
              rows={3}
              required
              minLength={10}
              maxLength={2000}
              className={inputClass}
            />
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Demander des modifications
          </button>
        </form>
      )}

      {can.withdraw && (
        <form action={withdrawAction} className="space-y-2">
          {hidden}
          <label className="block font-bold">
            Motif du retrait
            <textarea
              name="comment"
              rows={2}
              required
              minLength={10}
              maxLength={2000}
              className={inputClass}
            />
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Retirer cette version
          </button>
        </form>
      )}

      {!Object.values(can).some(Boolean) && version.status !== 'draft' && (
        <p className="text-ink-muted">
          Aucune action de validation ne vous revient sur cette version.
        </p>
      )}

      {workflow.history.length > 0 && (
        <>
          <h3 className="font-bold">Historique</h3>
          <ol className="space-y-2" data-testid="review-history">
            {workflow.history.map((h, i) => (
              <li key={i} className="rounded-card border border-line bg-surface p-3">
                <span className="font-bold">{ACTION_LABELS[h.action]}</span> par {h.actorName}, le{' '}
                {dateFormat.format(new Date(h.createdAt))}
                {h.comment && <p className="mt-1">« {h.comment} »</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
