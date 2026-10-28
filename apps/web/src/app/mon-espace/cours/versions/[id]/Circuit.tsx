import { circuitSteps, type CircuitInput } from '@lenseignement/types';

const MARK = { done: '✓', current: '●', todo: '○' } as const;
const STATE_LABEL = { done: 'faite', current: 'en cours', todo: 'à venir' } as const;

/**
 * Le circuit de création : où en est le cours, et quoi faire ensuite. Les étapes se suivent dans
 * l'ordre ; l'envoi en relecture et la publication restent contrôlés par l'API.
 */
export function Circuit({ version }: { version: CircuitInput }) {
  const steps = circuitSteps(version);
  const index = steps.findIndex((s) => s.state === 'current');
  const current = steps[index];

  return (
    <nav
      aria-label="Circuit de création du cours"
      className="rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]"
    >
      <p className="font-bold" data-testid="circuit-current">
        {current ? `Étape ${index + 1} sur ${steps.length} : ${current.title}` : 'Circuit terminé'}
      </p>
      {current?.todo && <p className="mt-1">{current.todo}</p>}
      <ol className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="list">
        {steps.map((step, i) => (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={
              'rounded-card border p-3 ' +
              (step.state === 'done'
                ? 'border-primary-line bg-primary-soft'
                : step.state === 'current'
                  ? 'border-2 border-primary bg-surface'
                  : 'border-line bg-surface text-ink-muted')
            }
          >
            <a href={step.anchor} className="block font-bold no-underline">
              <span aria-hidden="true">{MARK[step.state]} </span>
              {i + 1}. {step.title}
              <span className="sr-only"> ({STATE_LABEL[step.state]})</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
