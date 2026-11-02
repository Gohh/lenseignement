'use client';

import { WORKSHOP_TRADE_ICONS, WORKSHOP_TRADE_LABELS } from '@lenseignement/types';
import { useEffect, useState } from 'react';
import { queueAction, stamp } from '@/lib/offline-queue';
import { useKeptWorkshops, type KeptWorkshop } from '@/lib/offline-workshops';
import { simulationSubmission } from '@/lib/simulation-form';
import { buttonClass, secondaryButtonClass } from './Notice';
import { SimulationForm } from './Simulation';

/** Un atelier gardé, fait sans connexion : l'essai part dans la file d'attente. */
function OfflineWorkshop({ workshop, onClose }: { workshop: KeptWorkshop; onClose: () => void }) {
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState<string | null>(null);

  async function save(form: FormData) {
    const submission = simulationSubmission(form);
    const h5p = workshop.steps.flatMap((step) => {
      if (step.kind !== 'h5p') return [];
      const score = submission.steps.find((s) => s.stepId === step.id)?.choices[0];
      return [
        score === undefined
          ? `${step.title} : exercice pas fini.`
          : `${step.title} : ${score} % (il faut au moins ${step.passPercent} %).`,
      ];
    });
    await queueAction({
      owner: workshop.owner,
      event: {
        type: 'workshop_attempt',
        operationId: attemptId,
        occurredAt: stamp().occurredAt,
        code: workshop.code,
        steps: submission.steps,
      },
    });
    setSaved(h5p.join(' '));
    setAttemptId(crypto.randomUUID());
    window.scrollTo({ top: 0 });
  }

  return (
    <article className="space-y-4 rounded-card border border-line bg-surface p-4">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          <span aria-hidden="true">{WORKSHOP_TRADE_ICONS[workshop.trade]}</span>{' '}
          {WORKSHOP_TRADE_LABELS[workshop.trade]} · sans connexion
        </p>
        <h3 className="text-2xl font-bold">{workshop.title}</h3>
      </div>
      {saved !== null && (
        <div
          role="status"
          className="space-y-1 rounded-card border-2 border-primary bg-primary-soft p-3 text-ink-strong"
          data-testid="offline-workshop-saved"
        >
          <p className="font-bold">
            ✓ Ton essai est gardé sur cet appareil. Il sera corrigé et compté au retour d’internet.
          </p>
          {saved && <p>{saved}</p>}
        </div>
      )}
      {workshop.summary && <p>{workshop.summary}</p>}
      <SimulationForm
        key={attemptId}
        steps={workshop.steps}
        attemptId={attemptId}
        action={save}
        local
      />
      <button type="button" onClick={onClose} className={secondaryButtonClass}>
        Fermer l’atelier
      </button>
    </article>
  );
}

const CODE_IN_PATH = /^\/mon-espace\/atelier\/([A-Z0-9-]{1,60})\/?$/;

/** Page « Hors connexion » : les ateliers gardés sur l'appareil se font même sans réseau. */
export function OfflineWorkshops() {
  const kept = useKeptWorkshops();
  const [open, setOpen] = useState<string | null>(null);

  // Atelier demandé sans connexion (adresse de sa page) : il s'ouvre directement.
  useEffect(() => {
    const match = CODE_IN_PATH.exec(decodeURIComponent(window.location.pathname));
    if (match) setOpen(match[1]!);
  }, []);

  if (kept.length === 0) return null;
  const current = kept.find((w) => w.code === open);
  return (
    <section className="space-y-3 pt-4" data-testid="offline-workshops">
      <h2 className="text-2xl font-bold">Mes ateliers sur cet appareil</h2>
      {current ? (
        <OfflineWorkshop workshop={current} onClose={() => setOpen(null)} />
      ) : (
        <>
          <p>Ils se font même sans connexion.</p>
          <ul className="space-y-2">
            {kept.map((w) => (
              <li key={w.code}>
                <button type="button" onClick={() => setOpen(w.code)} className={buttonClass}>
                  <span aria-hidden="true">{WORKSHOP_TRADE_ICONS[w.trade]}</span>&nbsp;Faire «{' '}
                  {w.title} »
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
