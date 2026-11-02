import {
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILL_LABELS,
  EXERCISE_STATUS_LABELS,
  GAP,
  type ExerciseCompetencyOption,
  type ExerciseContent,
  type ExerciseDetail,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExerciseEditor } from '@/components/ExerciseEditor';
import { ExerciseMediaView, ExercisePlayer } from '@/components/ExercisePlayer';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  checkExerciseAction,
  copyExerciseAction,
  deleteExerciseAction,
  exerciseStepAction,
  returnExerciseAction,
  saveExerciseAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exercice' };

const card = 'space-y-3 rounded-big border border-line bg-surface p-5';
const HOME = '/mon-espace/fabrique';

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
    <form action={exerciseStepAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="step" value={step} />
      <button type="submit" className={primary ? buttonClass : secondaryButtonClass}>
        {label}
      </button>
    </form>
  );
}

const Good = () => <strong className="text-primary"> ✓ bonne réponse</strong>;

function ChoiceKey({ choices, correct }: { choices: string[]; correct: number }) {
  return (
    <ul className="list-disc pl-6">
      {choices.map((c, i) => (
        <li key={i}>
          {c}
          {i === correct && <Good />}
        </li>
      ))}
    </ul>
  );
}

/** L'exercice avec son corrigé, pour la relecture. */
function AnswerKey({ content }: { content: ExerciseContent }) {
  return (
    <div className="space-y-3" data-testid="exercise-key">
      <p className="text-lg font-bold">{content.prompt}</p>
      {content.media && <ExerciseMediaView media={content.media} />}
      {content.media?.alt && (
        <p className="text-sm text-ink-muted">Description : {content.media.alt}</p>
      )}
      {(content.kind === 'choice' || content.kind === 'media') && (
        <ChoiceKey choices={content.choices} correct={content.correct} />
      )}
      {content.kind === 'truefalse' && (
        <p>
          Réponse attendue : <strong>{content.correct ? 'Vrai' : 'Faux'}</strong>
        </p>
      )}
      {content.kind === 'gaps' && (
        <p className="text-lg">
          {content.text.split(GAP).map((part, i) =>
            i % 2 === 0 ? (
              <span key={i}>{part}</span>
            ) : (
              <mark key={i} className="rounded bg-primary-soft px-1 font-bold text-primary">
                {part.split('|').join(' ou ')}
              </mark>
            ),
          )}
        </p>
      )}
      {content.kind === 'match' && (
        <ul className="list-disc pl-6">
          {content.pairs.map((p, i) => (
            <li key={i}>
              {p.left} ↔ <strong>{p.right}</strong>
            </li>
          ))}
        </ul>
      )}
      {content.kind === 'order' && (
        <ol className="list-decimal pl-6">
          {content.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}
      {content.kind === 'number' && (
        <p>
          Réponse attendue :{' '}
          <strong>
            {String(content.answer).replace('.', ',')}
            {content.unit ? ` ${content.unit}` : ''}
          </strong>
          {content.tolerance > 0 && ` (à ${String(content.tolerance).replace('.', ',')} près)`}
        </p>
      )}
      {content.kind === 'table' && (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse text-left">
              <thead>
                <tr>
                  {content.table.header.map((h, i) => (
                    <th key={i} className="border border-line-strong bg-primary-soft px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className="border border-line-strong px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChoiceKey choices={content.choices} correct={content.correct} />
        </>
      )}
      {content.kind === 'reading' && (
        <>
          <div className="whitespace-pre-line rounded-card border border-line bg-background p-4">
            {content.passage}
          </div>
          {content.questions.map((q, i) => (
            <div key={i}>
              <p className="font-bold">
                {i + 1}. {q.prompt}
              </p>
              <ChoiceKey choices={q.choices} correct={q.correct} />
            </div>
          ))}
        </>
      )}
      {content.explanation && (
        <p className="text-ink-muted">Explication pour l’élève : {content.explanation}</p>
      )}
    </div>
  );
}

export default async function ExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const here = `${HOME}/${id}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  const query = (await searchParams) ?? {};

  const [result, comps, orgs] = await Promise.all([
    apiGet<ExerciseDetail>(session.accessToken, `/authoring/exercises/${encodeURIComponent(id)}`),
    apiGet<{ items: ExerciseCompetencyOption[] }>(
      session.accessToken,
      '/authoring/exercises/competencies',
    ),
    apiGet<{ items: Array<{ id: string; name: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
  ]);
  const backLink = (
    <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
      ← Fabrique d’exercices
    </Link>
  );
  if (!result.ok) {
    return (
      <section className="space-y-4">
        {backLink}
        <h1 className="text-3xl font-extrabold">Exercice</h1>
        <p>Exercice introuvable.</p>
      </section>
    );
  }
  const e = result.data;
  const editing = e.canEdit && e.status === 'draft';
  const myOrgs = orgs.ok ? orgs.data.items : [];
  const competencies = comps.ok ? comps.data.items : [];
  // La compétence actuelle reste choisissable même si son programme a changé depuis.
  if (!competencies.some((c) => c.id === e.competency.id)) {
    competencies.unshift({
      id: e.competency.id,
      code: e.competency.code,
      title: e.competency.title,
      subject: e.competency.subject,
      level: null,
      curriculum: e.competency.curriculum,
      curriculumId: '',
    });
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      {backLink}
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          {EXERCISE_DOMAIN_LABELS[e.domain]} · {EXERCISE_KIND_LABELS[e.kind]} ·{' '}
          {EXERCISE_DIFFICULTY_LABELS[e.difficulty]} · {EXERCISE_SKILL_LABELS[e.skill]}
        </p>
        <h1 className="text-3xl font-extrabold">{e.title}</h1>
        <p className="text-ink-muted">
          Compétence : {e.competency.code} {e.competency.title} ({e.competency.curriculum}) ·{' '}
          {e.organization.name}
          {e.author ? ` · ${e.author}` : ''}
          {e.reviewer && e.status === 'published' ? ` · relu par ${e.reviewer}` : ''}
        </p>
        <p data-testid="exercise-status">
          <strong>{EXERCISE_STATUS_LABELS[e.status]}</strong>
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {e.reviewNote && e.status === 'draft' && (
        <div className="rounded-card border-2 border-accent bg-accent-soft p-4">
          <p className="font-bold text-accent-ink">Remarque de la relecture</p>
          <p>{e.reviewNote}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {editing && <StepButton id={e.id} step="submit" label="Envoyer en relecture" primary />}
        {e.canPublish && e.status === 'review' && (
          <StepButton id={e.id} step="publish" label="Publier dans la banque" primary />
        )}
        {e.canEdit && e.status === 'published' && e.draftId && (
          <Link href={`${HOME}/${e.draftId}`} className={secondaryButtonClass}>
            Ouvrir la nouvelle version en cours
          </Link>
        )}
        {e.canEdit && e.status === 'published' && !e.draftId && (
          <form action={copyExerciseAction}>
            <input type="hidden" name="id" value={e.id} />
            <button type="submit" className={secondaryButtonClass}>
              Modifier (nouvelle version)
            </button>
          </form>
        )}
        {e.canPublish && e.status === 'published' && (
          <StepButton id={e.id} step="archive" label="Retirer de la banque" />
        )}
        {e.canPublish && e.status === 'archived' && (
          <StepButton id={e.id} step="restore" label="Remettre dans la banque" />
        )}
      </div>

      {!e.mine && e.status === 'published' && myOrgs.length > 0 && (
        <form action={copyExerciseAction} className={card}>
          <input type="hidden" name="id" value={e.id} />
          <h2 className="text-xl font-extrabold">Reprendre cet exercice</h2>
          <p className="text-ink-muted">
            Une copie en brouillon est créée dans votre structure (sans l’image ni le son). Vous
            l’adaptez, puis elle passe en relecture chez vous.
          </p>
          <label className="block font-bold">
            Structure
            <select name="organizationId" className={inputClass}>
              {myOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Copier dans ma structure
          </button>
        </form>
      )}

      {e.canPublish && e.status === 'review' && (
        <form action={returnExerciseAction} className={card}>
          <input type="hidden" name="id" value={e.id} />
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
        <ExerciseEditor
          id={e.id}
          action={saveExerciseAction}
          competencies={competencies}
          initial={{
            title: e.title,
            competencyId: e.competency.id,
            domain: e.domain,
            difficulty: e.difficulty,
            skill: e.skill,
            content: e.content,
          }}
        />
      ) : (
        <div className={card}>
          <h2 className="text-xl font-extrabold">Énoncé et corrigé</h2>
          <AnswerKey content={e.content} />
        </div>
      )}

      <div className={card} data-testid="exercise-preview">
        <h2 className="text-xl font-extrabold">Aperçu élève</h2>
        <p className="text-sm text-ink-muted">
          Ce que verra l’élève{editing ? ' (version enregistrée)' : ''}. Répondez pour vérifier le
          corrigé : la correction est faite par la plateforme, comme pour l’élève.
        </p>
        <ExercisePlayer play={e.play} check={checkExerciseAction.bind(null, e.id)} />
      </div>

      {editing && (
        <form action={deleteExerciseAction}>
          <input type="hidden" name="id" value={e.id} />
          <button type="submit" className="min-h-[44px] font-bold text-error underline">
            Supprimer ce brouillon
          </button>
        </form>
      )}
    </section>
  );
}
