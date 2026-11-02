import type { ExamPaperSheet } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveExamPaperAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saisir les copies' };

const HOME = '/mon-espace/epreuves';
const UUID = /^[0-9a-f-]{36}$/i;

/** Grille de saisie : une ligne par élève, une case par question (cochée = juste). */
export default async function ExamPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const cohort = param(query.classe) ?? '';
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}`);
  if (!UUID.test(id) || !UUID.test(cohort)) redirect(`${HOME}/${UUID.test(id) ? id : ''}`);
  const res = await apiGet<ExamPaperSheet>(
    session.accessToken,
    `/authoring/exams/${id}/paper?cohort=${cohort}`,
  );
  if (!res.ok) {
    redirect(`${HOME}/${id}?erreur=${encodeURIComponent('Cette classe n’a pas reçu l’épreuve.')}`);
  }
  const sheet = res.data;
  const n = sheet.items.length;

  return (
    <section className="space-y-6">
      <Link href={`${HOME}/${id}`} className="inline-flex min-h-[44px] items-center underline">
        ← {sheet.exam.title}
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">Saisir les copies · {sheet.cohort.name}</h1>
        <p className="max-w-3xl text-ink-muted">
          Cochez « Copie » pour chaque élève qui a rendu sa feuille, puis cochez les réponses justes
          ; une case vide compte faux. Le corrigé est sur la page « Voir le corrigé ». Décocher «
          Copie » efface la copie saisie.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {sheet.rows.length === 0 ? (
        <p>Aucun élève dans cette classe.</p>
      ) : (
        <form action={saveExamPaperAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="cohortId" value={sheet.cohort.id} />
          <input type="hidden" name="count" value={n} />
          <div className="overflow-x-auto rounded-big border border-line bg-surface">
            <table className="w-full border-collapse text-left" data-testid="paper-grid">
              <thead className="text-sm">
                <tr className="border-b border-line">
                  <th scope="col" className="sticky left-0 bg-surface px-3 py-2">
                    Élève
                  </th>
                  <th scope="col" className="px-2 py-2 text-center">
                    Copie
                  </th>
                  {sheet.items.map((i) => (
                    <th
                      key={i.exerciseId}
                      scope="col"
                      className="px-2 py-2 text-center"
                      title={i.title}
                    >
                      Q{i.position}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sheet.rows.map((r) => {
                  const good = r.marks?.filter((m) => m === 1).length ?? 0;
                  return (
                    <tr key={r.learnerId}>
                      <th scope="row" className="sticky left-0 bg-surface px-3 py-2 font-bold">
                        {r.name}
                      </th>
                      {r.online ? (
                        <td colSpan={n + 1} className="px-2 py-2 text-sm text-ink-muted">
                          Faite en ligne : corrigée par la plateforme.
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1 text-center">
                            <input type="hidden" name="learners" value={r.learnerId} />
                            <input
                              type="checkbox"
                              name={`copie:${r.learnerId}`}
                              defaultChecked={r.marks !== null}
                              aria-label={`Copie rendue : ${r.name}`}
                              className="h-6 w-6"
                            />
                          </td>
                          {sheet.items.map((item, i) => (
                            <td key={item.exerciseId} className="px-2 py-1 text-center">
                              <input
                                type="checkbox"
                                name={`m:${r.learnerId}:${i}`}
                                defaultChecked={r.marks?.[i] === 1}
                                aria-label={`${r.name}, question ${item.position} juste`}
                                className="h-6 w-6"
                              />
                            </td>
                          ))}
                        </>
                      )}
                      <td className="px-3 py-2 text-sm">
                        {r.marks ? `${Math.round((good / n) * 100)} / 100` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PendingButton className={buttonClass} pendingLabel="Enregistrement…">
            Enregistrer les copies
          </PendingButton>
        </form>
      )}
    </section>
  );
}
