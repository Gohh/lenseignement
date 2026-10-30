'use client';

import {
  ESTABLISHMENT_CATEGORY_LABELS,
  type EstablishmentCategory,
  type EstablishmentImportAnomaly,
} from '@lenseignement/types';
import { useActionState } from 'react';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { importEstablishmentsAction, type EstablishmentImportState } from '../actions';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const where = (a: EstablishmentImportAnomaly) =>
  a.line === 0 ? 'En-têtes' : a.line === 1 ? 'Ligne 1 (en-têtes)' : `Ligne ${a.line}`;

/** Liste des anomalies à ouvrir dans un tableur, pour corriger le fichier ligne par ligne. */
function downloadAnomalies(anomalies: EstablishmentImportAnomaly[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    ['Ligne', 'Colonne', 'Valeur trouvée', 'À corriger'],
    ...anomalies.map((a) => [String(a.line), a.column, a.value, a.message]),
  ];
  const csv = `\uFEFF${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'anomalies-import.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Import en deux temps : contrôle complet du fichier (structure, obligatoires, validité, doublons),
 * puis enregistrement sur confirmation, seulement quand il ne reste aucune anomalie.
 */
export function ImportEstablishments({ category }: { category: EstablishmentCategory }) {
  const [state, action, pending] = useActionState<EstablishmentImportState, FormData>(
    importEstablishmentsAction,
    null,
  );
  const result = state && 'anomalies' in state ? state : null;
  const label = ESTABLISHMENT_CATEGORY_LABELS[category].toLowerCase();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="category" value={category} />
      <label className="block font-bold">
        Fichier rempli (CSV)
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required={!result}
          className={inputClass}
        />
      </label>
      {result && !result.confirmed && <input type="hidden" name="csv" value={result.csv} />}
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? 'Contrôle…' : 'Contrôler le fichier'}
      </button>

      {state && 'error' in state && (
        <p role="alert" className="font-bold text-error">
          {state.error}
        </p>
      )}

      {result && (
        <div className="space-y-4" aria-live="polite" data-testid="import-result">
          {result.confirmed ? (
            <p
              role="status"
              className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
              data-testid="import-done"
            >
              {plural(result.created, 'établissement enregistré', 'établissements enregistrés')}.{' '}
              <a href="/mon-espace/configuration">Voir la liste</a>
            </p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-4" data-testid="import-summary">
                {[
                  ['Lignes lues', result.total],
                  ['Prêtes', result.ready],
                  ['Déjà enregistrées', result.duplicates.length],
                  ['Anomalies', result.anomalies.length],
                ].map(([title, n]) => (
                  <li key={title} className="rounded-card border border-line p-3">
                    <span className="block text-sm text-ink-muted">{title}</span>
                    <span className="text-2xl font-extrabold">{n}</span>
                  </li>
                ))}
              </ul>

              {result.anomalies.length > 0 && (
                <div className="space-y-3">
                  <p role="alert" className="font-bold text-error">
                    Rien n’est enregistré : corrigez{' '}
                    {result.anomalies.length > 1 ? 'ces anomalies' : 'cette anomalie'} dans votre
                    fichier, puis contrôlez-le à nouveau.
                  </p>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full min-w-[36rem] text-left"
                      data-testid="import-anomalies"
                    >
                      <caption className="sr-only">Anomalies du fichier</caption>
                      <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th scope="col" className="px-3 py-2">
                            Où
                          </th>
                          <th scope="col" className="px-3 py-2">
                            Colonne
                          </th>
                          <th scope="col" className="px-3 py-2">
                            Valeur trouvée
                          </th>
                          <th scope="col" className="px-3 py-2">
                            À corriger
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {result.anomalies.slice(0, 200).map((a, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap px-3 py-2 font-bold">{where(a)}</td>
                            <td className="px-3 py-2">{a.column || '–'}</td>
                            <td className="px-3 py-2">{a.value || <em>(vide)</em>}</td>
                            <td className="px-3 py-2">{a.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.anomalies.length > 200 && (
                    <p>Les 200 premières sont affichées ; la liste complète est dans le fichier.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadAnomalies(result.anomalies)}
                    className={secondaryButtonClass}
                  >
                    Télécharger la liste des anomalies
                  </button>
                </div>
              )}

              {result.duplicates.length > 0 && (
                <div>
                  <p className="font-bold">Déjà enregistrés, ils seront ignorés :</p>
                  <ul className="list-disc pl-6" data-testid="import-duplicates">
                    {result.duplicates.map((d) => (
                      <li key={d.line}>
                        Ligne {d.line} · <strong>{d.name}</strong> : {d.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.anomalies.length === 0 &&
                (result.ready > 0 ? (
                  <div className="space-y-2">
                    <p className="font-bold">
                      Le fichier est conforme :{' '}
                      {plural(
                        result.ready,
                        'établissement sera enregistré',
                        'établissements seront enregistrés',
                      )}{' '}
                      dans la catégorie « {label} ».
                    </p>
                    <button type="submit" name="confirm" value="1" className={buttonClass}>
                      Enregistrer {plural(result.ready, 'établissement', 'établissements')}
                    </button>
                  </div>
                ) : (
                  <p className="font-bold">Rien de nouveau à enregistrer.</p>
                ))}
            </>
          )}
        </div>
      )}
    </form>
  );
}
