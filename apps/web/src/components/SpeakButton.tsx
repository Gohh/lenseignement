'use client';

import { useSyncExternalStore } from 'react';
import { speak } from '@/lib/speech';

const noop = () => () => {};

/**
 * Petit bouton « 🔊 » qui lit un texte à voix haute (ADR-015, « écouter d'abord ») : une
 * question, une réponse, un résultat. Absent si l'appareil n'a pas de voix : le texte reste.
 */
export function SpeakButton({ text, lang, label }: { text: string; lang: string; label: string }) {
  const supported = useSyncExternalStore(
    noop,
    () => 'speechSynthesis' in window,
    () => false,
  );
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text, lang)}
      title={label}
      className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-card border border-line-strong bg-surface px-3 text-xl"
    >
      <span aria-hidden="true">🔊</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
