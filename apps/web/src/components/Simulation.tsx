import type { PracticeStatus, SimulationAttemptResult, SimulationStep } from '@lenseignement/types';
import { buttonClass, inputClass } from './Notice';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

/** Résultat du dernier essai : étape réussie, ou ce qu'il faut revoir (jamais « échec »). */
export function AttemptResult({ attempt }: { attempt: SimulationAttemptResult }) {
  return (
    <ul className="space-y-3" data-testid="simulation-result">
      {attempt.steps.map((step) => (
        <li key={step.stepId}>
          <p>
            <span className="font-bold">{step.passed ? '✓ Réussi' : 'À revoir'}</span> :{' '}
            {step.title}
          </p>
          {step.feedback.length > 0 && (
            <ul className="list-disc pl-6">
              {step.feedback.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Séance pratique : bloquée, ouverte (à demander) ou demandée. Toujours avec le formateur. */
export function PracticeCard({
  status,
  title,
  action,
}: {
  status: PracticeStatus;
  title: string;
  action: () => Promise<void>;
}) {
  return (
    <div className="space-y-3" data-testid="practice-status">
      {status === 'locked' && (
        <p>
          <span className="font-bold">🔒 Bloquée</span> : séance pratique « {title} ». Réussis
          d’abord la simulation de sécurité.
        </p>
      )}
      {status === 'unlocked' && (
        <>
          <p>
            <span className="font-bold">Ouverte</span> : séance pratique « {title} », avec ton
            formateur.
          </p>
          <form action={action}>
            <button type="submit" className={buttonClass}>
              Demander ma séance pratique encadrée
            </button>
          </form>
        </>
      )}
      {status === 'requested' && (
        <p>
          <span className="font-bold">✓ Demande envoyée</span> : séance pratique « {title} ». Ton
          formateur te dira quand elle aura lieu.
        </p>
      )}
    </div>
  );
}

/**
 * Formulaire de la simulation. Champs : `s:<étape>` (étape présente), `i:<étape>:<question>`,
 * `e:<étape>` (équipements cochés), `o:<étape>:<place>` (geste à cette place).
 */
export function SimulationForm({
  steps,
  attemptId,
  action,
}: {
  steps: SimulationStep[];
  attemptId: string;
  action: (form: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="attemptId" value={attemptId} />
      {steps.map((step, s) => (
        <fieldset key={step.id} className="space-y-3">
          <input type="hidden" name={`s:${step.id}`} value="" />
          <legend className="text-lg font-bold">
            Étape {s + 1} : {step.title}
          </legend>
          <p>{step.instructions}</p>
          {step.kind === 'identify' &&
            step.questions.map((question, q) => (
              <fieldset key={q} className="space-y-1">
                <legend className="font-bold">{question.prompt}</legend>
                {question.choices.map((choice, c) => (
                  <label key={c} className="flex min-h-[44px] items-center gap-3 text-lg">
                    <input
                      type="radio"
                      name={`i:${step.id}:${q}`}
                      value={c}
                      required
                      className="h-5 w-5"
                    />
                    {choice}
                  </label>
                ))}
              </fieldset>
            ))}
          {step.kind === 'equipment' &&
            step.options.map((option, o) => (
              <label key={o} className="flex min-h-[44px] items-center gap-3 text-lg">
                <input type="checkbox" name={`e:${step.id}`} value={o} className="h-5 w-5" />
                {option}
              </label>
            ))}
          {step.kind === 'order' &&
            step.gestures.map((_, position) => (
              <label key={position} className="block font-bold">
                {ordinal(position + 1)} geste
                <select name={`o:${step.id}:${position}`} required className={inputClass}>
                  <option value="">Choisir un geste…</option>
                  {step.gestures.map((gesture, g) => (
                    <option key={g} value={g}>
                      {gesture}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </fieldset>
      ))}
      <button type="submit" className={buttonClass}>
        Vérifier ma simulation
      </button>
    </form>
  );
}
