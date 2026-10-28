'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { splitForSpeech, utteranceFor } from '@/lib/speech';
import { buttonClass, inputClass, secondaryButtonClass } from './Notice';

type State = 'idle' | 'playing' | 'paused' | 'done';

const STATUS: Record<State, string> = {
  idle: '',
  playing: 'Lecture en cours…',
  paused: 'Lecture en pause.',
  done: 'Lecture terminée.',
};

const noop = () => () => {};

/**
 * Écoute d'une leçon par la voix de synthèse de l'appareil (ADR-008, cahier §4 « écouter
 * d'abord »). Rien n'est téléchargé : fonctionne hors ligne si l'appareil a une voix française.
 */
export function AudioLessonPlayer({ text, lang }: { text: string; lang: string }) {
  const supported = useSyncExternalStore(
    noop,
    () => 'speechSynthesis' in window,
    () => false,
  );
  const [state, setState] = useState<State>('idle');
  const [rate, setRate] = useState(1);
  const queue = useRef<string[]>([]);

  // Quitter la page arrête la lecture.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!supported) {
    return (
      <p className="rounded-card border border-line bg-surface p-4">
        La lecture à voix haute n’est pas disponible sur cet appareil.
      </p>
    );
  }

  const speakNext = () => {
    const sentence = queue.current.shift();
    if (sentence === undefined) {
      setState('done');
      return;
    }
    const utterance = utteranceFor(sentence, lang, rate);
    utterance.onend = speakNext;
    utterance.onerror = (event) => {
      // « interrupted » et « canceled » viennent de nos boutons Arrêter ou Écouter.
      if (event.error !== 'interrupted' && event.error !== 'canceled') setState('idle');
    };
    window.speechSynthesis.speak(utterance);
  };

  const play = () => {
    window.speechSynthesis.cancel();
    queue.current = splitForSpeech(text);
    setState('playing');
    speakNext();
  };
  const pause = () => {
    window.speechSynthesis.pause();
    setState('paused');
  };
  const resume = () => {
    window.speechSynthesis.resume();
    setState('playing');
  };
  const stop = () => {
    queue.current = [];
    window.speechSynthesis.cancel();
    setState('idle');
  };

  return (
    <section
      aria-labelledby="ecoute"
      className="space-y-3 rounded-card border border-line bg-surface p-4"
    >
      <h2 id="ecoute" className="text-lg font-bold">
        Écouter la leçon
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        {state === 'playing' ? (
          <button type="button" onClick={pause} className={buttonClass}>
            Pause
          </button>
        ) : state === 'paused' ? (
          <button type="button" onClick={resume} className={buttonClass}>
            Reprendre
          </button>
        ) : (
          <button type="button" onClick={play} className={buttonClass}>
            {state === 'done' ? 'Réécouter' : 'Écouter'}
          </button>
        )}
        {(state === 'playing' || state === 'paused') && (
          <button type="button" onClick={stop} className={secondaryButtonClass}>
            Arrêter
          </button>
        )}
        <label className="block font-bold">
          Vitesse
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className={inputClass}
          >
            <option value={0.75}>Lente</option>
            <option value={1}>Normale</option>
          </select>
        </label>
      </div>
      <p role="status" aria-live="polite" data-testid="audio-status" className="font-bold">
        {STATUS[state]}
      </p>
      <p className="text-sm text-ink-muted">
        Voix de synthèse de votre appareil : la prononciation peut varier d’un téléphone à l’autre.
      </p>
    </section>
  );
}
