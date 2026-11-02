import type { ExamPaperSheet } from '@lenseignement/types';
import { buttonClass } from './Notice';
import { PendingButton } from './PendingButton';

/** Grille de saisie des copies papier : une ligne par élève, une case par question (cochée = juste). */
export function PaperGrid({
  sheet,
  action,
  hidden,
}: {
  sheet: ExamPaperSheet;
  action: (form: FormData) => Promise<void>;
  hidden: Record<string, string>;
}) {
  const n = sheet.items.length;
  return sheet.rows.length === 0 ? (
    <p>Aucun élève dans cette classe.</p>
  ) : (
    <form action={action} className="space-y-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
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
  );
}
