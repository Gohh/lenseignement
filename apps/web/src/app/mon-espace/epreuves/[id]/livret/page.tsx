import {
  EXERCISE_DOMAIN_LABELS,
  type ExamBooklet,
  type ExamBookletItem,
  type ExercisePlay,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { PrintPageButton } from '@/components/PrintPageButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Livret de l’épreuve' };

const HOME = '/mon-espace/epreuves';
const LETTERS = 'ABCDEFGHIJKLMNOP';
const box = <span aria-hidden className="inline-block h-4 w-4 flex-none border-2 border-ink" />;
const line = (
  <span className="inline-block w-28 border-b-2 border-dotted border-ink">
    <span className="sr-only">à compléter</span>
  </span>
);

function ChoiceList({ choices }: { choices: string[] }) {
  return (
    <ul className="space-y-1">
      {choices.map((c, i) => (
        <li key={i} className="flex items-center gap-2">
          {box}
          <span>
            <strong>{LETTERS[i]}.</strong> {c}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** L'énoncé tel que l'élève le lit sur papier : cases à cocher et lignes à remplir. */
function PaperQuestion({ play }: { play: ExercisePlay }) {
  const media =
    play.media?.type === 'image' ? (
      <img
        src={`/exercices/fichiers/${play.media.key}`}
        alt={play.media.alt}
        className="max-h-60 rounded-card border border-line"
      />
    ) : play.media?.type === 'audio' ? (
      <p className="text-sm italic">Écoute le son que ton enseignant fait entendre.</p>
    ) : null;
  return (
    <div className="space-y-2">
      {play.kind !== 'gaps' && <p className="whitespace-pre-line">{play.prompt}</p>}
      {media}
      {(() => {
        switch (play.kind) {
          case 'choice':
          case 'media':
            return <ChoiceList choices={play.choices} />;
          case 'truefalse':
            return (
              <p className="flex items-center gap-6">
                <span className="flex items-center gap-2">{box} Vrai</span>
                <span className="flex items-center gap-2">{box} Faux</span>
              </p>
            );
          case 'gaps':
            return (
              <>
                <p className="text-sm italic">{play.prompt}</p>
                <p className="leading-loose">
                  {play.parts.map((p, i) => (
                    <span key={i}>
                      {p}
                      {i < play.parts.length - 1 && line}
                    </span>
                  ))}
                </p>
              </>
            );
          case 'match':
            return (
              <div className="grid grid-cols-2 gap-6">
                <ul className="space-y-1">
                  {play.lefts.map((l, i) => (
                    <li key={i}>
                      {i + 1}. {l} ●
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1">
                  {play.rights.map((r, i) => (
                    <li key={i}>
                      ● {LETTERS[i]}. {r}
                    </li>
                  ))}
                </ul>
              </div>
            );
          case 'order':
            return (
              <ul className="space-y-1">
                {play.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-6 w-8 border-2 border-ink" />
                    {it}
                  </li>
                ))}
              </ul>
            );
          case 'number':
            return (
              <p>
                Réponse : {line} {play.unit}
              </p>
            );
          case 'table':
            return (
              <>
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      {play.table.header.map((h, i) => (
                        <th key={i} className="border border-ink px-2 py-1">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {play.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((c, j) => (
                          <td key={j} className="border border-ink px-2 py-1">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ChoiceList choices={play.choices} />
              </>
            );
          case 'reading':
            return (
              <>
                <blockquote className="whitespace-pre-line border-l-4 border-line-strong pl-3">
                  {play.passage}
                </blockquote>
                <ol className="space-y-3">
                  {play.questions.map((q, i) => (
                    <li key={i} className="space-y-1">
                      <p>
                        {i + 1}) {q.prompt}
                      </p>
                      <ChoiceList choices={q.choices} />
                    </li>
                  ))}
                </ol>
              </>
            );
        }
      })()}
    </div>
  );
}

function AnswerKey({ items }: { items: ExamBookletItem[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm" data-testid="exam-answer-key">
      <thead>
        <tr>
          <th className="border border-ink px-2 py-1">N°</th>
          <th className="border border-ink px-2 py-1">Question</th>
          <th className="border border-ink px-2 py-1">Domaine</th>
          <th className="border border-ink px-2 py-1">Réponse attendue</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.exerciseId} className="lse-print-keep">
            <td className="border border-ink px-2 py-1">{i.position}</td>
            <td className="border border-ink px-2 py-1">{i.title}</td>
            <td className="border border-ink px-2 py-1">{EXERCISE_DOMAIN_LABELS[i.domain]}</td>
            <td className="border border-ink px-2 py-1 font-bold">{i.answer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Livret à imprimer pour les élèves, ou corrigé de l'enseignant (`?version=corrige`). */
export default async function ExamBookletPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}/livret`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const key = ((await searchParams) ?? {}).version === 'corrige';
  const res = await apiGet<ExamBooklet>(session.accessToken, `/authoring/exams/${id}/booklet`);
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Épreuve introuvable.')}`);
  const { exam, items } = res.data;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`${HOME}/${id}`} className="inline-flex min-h-[44px] items-center underline">
          ← {exam.title}
        </Link>
        <span className="flex-1" />
        <Link
          href={key ? `${HOME}/${id}/livret` : `${HOME}/${id}/livret?version=corrige`}
          className={secondaryButtonClass}
        >
          {key ? 'Voir le livret élève' : 'Voir le corrigé'}
        </Link>
        <PrintPageButton
          className={buttonClass}
          label={key ? 'Imprimer le corrigé' : 'Imprimer le livret'}
        />
      </div>
      <p className="text-sm text-ink-muted print:hidden">
        Le bouton ouvre la fenêtre d’impression : choisissez l’imprimante, ou « Enregistrer au
        format PDF ». Les menus ne sont pas imprimés.
      </p>

      <article className="space-y-6 rounded-big border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="space-y-2 border-b-2 border-ink pb-4">
          <p className="text-sm">{exam.organization}</p>
          <h1 className="text-2xl font-extrabold">
            {exam.title}
            {key ? ' · Corrigé' : ''}
          </h1>
          {key ? (
            <p className="text-sm">Pour l’enseignant seulement. Ne pas distribuer aux élèves.</p>
          ) : (
            <>
              <p>
                {items.length} questions · environ {exam.durationMinutes} minutes · Réponds seul,
                sans aide.
              </p>
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <p>Nom et prénom : {line}</p>
                <p>Classe : {line}</p>
              </div>
            </>
          )}
        </header>
        {key ? (
          <AnswerKey items={items} />
        ) : (
          <ol className="space-y-6">
            {items.map((item) => (
              <li
                key={item.exerciseId}
                className="lse-print-keep space-y-2"
                data-testid="booklet-item"
              >
                <h2 className="font-display text-lg font-bold">Question {item.position}</h2>
                <PaperQuestion play={item.play} />
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}
