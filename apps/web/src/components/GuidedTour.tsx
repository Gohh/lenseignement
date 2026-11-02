'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { TourStep } from '@/lib/tour';
import { SpeakButton } from './SpeakButton';

const HIGHLIGHT = 'lse-tour-target';

function findTarget(step: TourStep | undefined): HTMLElement | null {
  if (!step?.target) return null;
  const list = [
    ...document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(step.target)}"]`),
  ];
  // Le premier élément visible (un même repère peut exister dans deux menus).
  return list.find((el) => el.getClientRects().length > 0) ?? null;
}

/**
 * Visite guidée : un bouton « Visite guidée », puis une bulle par étape qui montre une partie de
 * l'écran (entourée), avec un texte court à lire ou à écouter. Proposée une fois à la première
 * visite (bandeau dans la page, qui ne cache rien), puis toujours disponible avec le bouton.
 */
export function GuidedTour({
  steps,
  storageKey,
  invite = true,
}: {
  steps: TourStep[];
  /** Mémorise sur l'appareil que la visite a été vue ou refusée. */
  storageKey: string;
  /** Proposer la visite (bandeau) tant qu'elle n'a jamais été vue. */
  invite?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [offer, setOffer] = useState(false);
  const [placeTop, setPlaceTop] = useState(false);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!invite) return;
    try {
      if (!localStorage.getItem(storageKey)) setOffer(true);
    } catch {
      // Stockage indisponible : on ne propose rien, le bouton reste là.
    }
  }, [invite, storageKey]);

  const remember = useCallback(() => {
    setOffer(false);
    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Rien à garder.
    }
  }, [storageKey]);

  // Étapes dont la cible existe sur cette page (les autres sont sautées).
  const [visible, setVisible] = useState<TourStep[]>([]);
  const start = () => {
    remember();
    setVisible(steps.filter((s) => !s.target || findTarget(s)));
    setIndex(0);
  };
  const stop = useCallback(() => {
    setIndex(null);
    opener.current?.focus();
  }, []);

  const step = index === null ? undefined : visible[index];

  useEffect(() => {
    if (!step) return;
    const target = findTarget(step);
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.classList.add(HIGHLIGHT);
    target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    const rect = target?.getBoundingClientRect();
    setPlaceTop(rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false);
    headingRef.current?.focus();
    return () => target?.classList.remove(HIGHLIGHT);
  }, [step]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, stop]);

  const last = index !== null && index === visible.length - 1;

  return (
    <>
      <button
        ref={opener}
        type="button"
        data-tour="visite"
        onClick={start}
        className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-surface px-4 font-bold text-ink hover:bg-primary-soft"
      >
        <span aria-hidden="true">🧭</span> Visite guidée
      </button>

      {offer && index === null && (
        <div
          role="region"
          aria-label="Proposition de visite guidée"
          data-testid="tour-offer"
          className="flex w-full basis-full flex-wrap items-center gap-3 rounded-big border-2 border-primary bg-primary-soft p-3"
        >
          <p className="min-w-0 flex-1 basis-48 font-bold">
            Première visite ? Découvrez l’écran en une minute.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={start}
              className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-4 font-bold text-surface"
            >
              Commencer la visite
            </button>
            <button
              type="button"
              onClick={remember}
              className="inline-flex min-h-[44px] items-center rounded-card border border-line-strong px-4 font-bold"
            >
              Plus tard
            </button>
          </div>
        </div>
      )}

      {step && index !== null && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          data-testid="tour"
          className={`fixed inset-x-4 z-[60] mx-auto max-w-md space-y-3 rounded-big border-2 border-primary bg-surface p-5 shadow-[var(--shadow-soft)] ${
            placeTop ? 'top-4' : 'bottom-24 lg:bottom-6'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-muted">
                Étape {index + 1} sur {visible.length}
              </p>
              <h2
                id={titleId}
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-xl font-bold outline-none"
              >
                {step.title}
              </h2>
            </div>
            <SpeakButton text={`${step.title}. ${step.text}`} lang="fr-FR" label="Écouter" />
          </div>
          <p>{step.text}</p>
          <div className="flex flex-wrap items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="inline-flex min-h-[44px] items-center rounded-card border border-line-strong px-4 font-bold"
              >
                Précédent
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? stop() : setIndex(index + 1))}
              className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface"
            >
              {last ? 'Terminer' : 'Suivant'}
            </button>
            {!last && (
              <button
                type="button"
                onClick={stop}
                className="ml-auto inline-flex min-h-[44px] items-center px-2 font-bold underline"
              >
                Quitter la visite
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
