import type { DiagnosticItem, RemediationPlan, SkillResult } from '@lenseignement/types';
import Link from 'next/link';
import { buttonClass } from './Notice';

/** Résultats par compétence : « acquise » ou « à consolider », jamais « échec » (cahier §3). */
export function SkillResults({ results }: { results: SkillResult[] }) {
  return (
    <ul className="space-y-1" data-testid="skill-results">
      {results.map((r) => (
        <li key={r.code}>
          <span className="font-bold">{r.mastered ? '✓ Acquise' : 'À consolider'}</span> : {r.title}{' '}
          <span className="text-ink-muted">
            ({r.correct} sur {r.total})
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Orientation proposée, avec son explication et le cours conseillé. */
export function PlanCard({ plan }: { plan: RemediationPlan }) {
  return (
    <div className="space-y-3" data-testid="remediation-plan">
      <p className="text-lg font-bold">
        {plan.status === 'completed' ? '✓ Acquise : ' : 'À travailler : '}
        {plan.competency.title}
      </p>
      {plan.source === 'teacher' && (
        <p>
          Choisi par {plan.decidedBy ?? 'l’enseignant'} : « {plan.reason} »
        </p>
      )}
      <div>
        <h3 className="font-bold">Pourquoi ?</h3>
        <ul className="list-disc pl-6" data-testid="remediation-rationale">
          {plan.rationale.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      {plan.course && plan.status === 'active' && (
        <Link href={`/catalogue/${plan.course.id}`} className={buttonClass}>
          Ouvrir le cours : {plan.course.title}
        </Link>
      )}
    </div>
  );
}

/** Série de questions (bilan ou petit test) ; l'identifiant de série évite tout doublon. */
export function QuestionSeries({
  items,
  sessionId,
  action,
  submitLabel,
}: {
  items: DiagnosticItem[];
  sessionId: string;
  action: (form: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      {items.map((item, i) => (
        <fieldset key={item.id} className="space-y-1">
          <legend className="font-bold">
            Question {i + 1} : {item.prompt}
          </legend>
          {item.choices.map((choice, c) => (
            <label key={c} className="flex min-h-[44px] items-center gap-3 text-lg">
              <input type="radio" name={`q-${item.id}`} value={c} required className="h-5 w-5" />
              {choice}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit" className={buttonClass}>
        {submitLabel}
      </button>
    </form>
  );
}
