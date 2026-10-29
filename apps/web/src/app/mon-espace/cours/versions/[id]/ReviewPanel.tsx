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

/**
 * Remarque du validateur, en haut de la page, tant que le cours est un brouillon renvoyé pour
 * correction (le dernier événement est « modifications demandées »).
 */
export function ReturnedRemark({ history }: { history: CourseWorkflow['history'] }) {
  const last = history.at(-1);
  if (last?.action !== 'changes_requested') return null;
  return (
    <aside
      aria-labelledby="remarque-title"
      data-testid="returned-remark"
      className="rounded-big border-l-4 border-accent bg-accent-soft p-5 text-accent-ink"
    >
      <h2 id="remarque-title" className="text-lg font-bold">
        Ce cours vous a été renvoyé par {last.actorName}
      </h2>
      <p className="text-sm">{dateFormat.format(new Date(last.createdAt))}</p>
      {last.comment && <p className="mt-2 whitespace-pre-line text-lg">« {last.comment} »</p>}
      <p className="mt-2">
        Corrigez le cours, puis renvoyez-le en relecture depuis le panneau « Validation ».
      </p>
    </aside>
  );
}

const DOT: Record<ReviewAction, string> = {
  submitted: 'bg-ink-muted',
  changes_requested: 'bg-accent',
  approved: 'bg-primary',
  published: 'bg-primary',
  replaced: 'bg-line-strong',
  withdrawn: 'bg-line-strong',
};

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
            {workflow.reviewers.length > 0 && (
              <label className="block font-bold">
                Relecteur
                <select name="reviewerId" defaultValue="" className={inputClass}>
                  <option value="">N’importe quel référent pédagogique</option>
                  {workflow.reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className={buttonClass}>
              Envoyer en relecture
            </button>
          </form>
        ))}

      {version.status === 'in_review' && workflow.reviewer && (
        <p data-testid="designated-reviewer">
          Relecteur désigné : <span className="font-bold">{workflow.reviewer.name}</span>
        </p>
      )}

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
          <ol className="space-y-4 border-l-2 border-line pl-5" data-testid="review-history">
            {workflow.history.map((h, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${DOT[h.action]}`}
                />
                <p>
                  <span className="font-bold">{ACTION_LABELS[h.action]}</span> par {h.actorName}
                </p>
                <p className="text-sm text-ink-muted">{dateFormat.format(new Date(h.createdAt))}</p>
                {h.comment && (
                  <p className="mt-1 rounded-card bg-primary-soft p-3">« {h.comment} »</p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
