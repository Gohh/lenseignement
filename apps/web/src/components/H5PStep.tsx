'use client';

import { useEffect, useRef, useState } from 'react';
import { keptPlayer } from '@/lib/offline-workshops';

type Player = Awaited<ReturnType<typeof keptPlayer>>;

/**
 * Exercice H5P dans un cadre isolé (sandbox sans allow-same-origin : le code de l'exercice ne voit
 * pas la session). Le cadre envoie le meilleur score ; il part avec le formulaire (champ `h:<étape>`).
 * `local` : atelier gardé sur l'appareil ; le cadre reçoit ses fichiers de cette page.
 */
export function H5PStep({
  stepId,
  packageKey,
  passPercent,
  title,
  local = false,
}: {
  stepId: string;
  packageKey: string;
  passPercent: number;
  title: string;
  local?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [score, setScore] = useState<number | null>(null);
  const [height, setHeight] = useState(480);
  const [player, setPlayer] = useState<Player | 'loading' | 'missing'>(local ? 'loading' : null);

  useEffect(() => {
    if (!local) return;
    let alive = true;
    keptPlayer(packageKey)
      .then((found) => alive && setPlayer(found ?? 'missing'))
      .catch(() => alive && setPlayer('missing'));
    return () => {
      alive = false;
    };
  }, [local, packageKey]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; percent?: unknown; height?: unknown };
      if (data?.type === 'h5p-need-files' && player && typeof player === 'object') {
        frame.current?.contentWindow?.postMessage({ type: 'h5p-files', files: player.files }, '*');
      }
      if (data?.type === 'h5p-score' && typeof data.percent === 'number') {
        setScore(Math.max(0, Math.min(100, Math.round(data.percent))));
      }
      if (data?.type === 'h5p-height' && typeof data.height === 'number') {
        setHeight(Math.max(240, Math.min(2000, Math.round(data.height) + 16)));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [player]);

  if (player === 'loading') return <p>Ouverture de l’exercice…</p>;
  if (player === 'missing') {
    return (
      <p role="alert" className="font-bold">
        Cet exercice n’est pas sur cet appareil. Ouvre l’atelier avec internet et garde-le de
        nouveau.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <iframe
        ref={frame}
        {...(player ? { srcDoc: player.html } : { src: `/h5p/lecteur/${packageKey}` })}
        title={`Exercice : ${title}`}
        sandbox="allow-scripts allow-popups"
        allow="fullscreen"
        className="w-full rounded-card border border-line bg-surface"
        style={{ height }}
      />
      <input type="hidden" name={`h:${stepId}`} value={score ?? ''} />
      <p aria-live="polite" className="font-bold" data-testid={`h5p-score-${stepId}`}>
        {score === null
          ? `Fais l’exercice jusqu’au bout. Il faut au moins ${passPercent} %.`
          : `Ton score : ${score} % (il faut au moins ${passPercent} %).`}
      </p>
    </div>
  );
}
