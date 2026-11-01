'use client';

import type { Book, Rendition } from 'epubjs';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

export interface EpubApi {
  next(): void;
  prev(): void;
  /** Aller à un avancement (0 à 100), une fois les emplacements calculés. */
  goToPercent(percent: number): void;
  /** Texte des pages visibles, pour la lecture à voix haute. */
  visibleText(): string;
}

interface Props {
  ref?: Ref<EpubApi>;
  url: string;
  width: number;
  height: number;
  spread: boolean;
  /** Taille du texte en %. */
  fontSize: number;
  initialCfi?: string;
  onLocation(cfi: string, percent: number | null): void;
  onError(): void;
}

/** Livre EPUB (texte qui s'adapte à l'écran), mis en pages par epub.js. */
export function EpubView({
  ref,
  url,
  width,
  height,
  spread,
  fontSize,
  initialCfi,
  onLocation,
  onError,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const book = useRef<Book | null>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onLocation, onError });
  callbacks.current = { onLocation, onError };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: ePub }, data] = await Promise.all([
          import('epubjs'),
          fetch(url, { credentials: 'same-origin' }).then((r) => {
            if (!r.ok) throw new Error('fichier');
            return r.arrayBuffer();
          }),
        ]);
        if (cancelled || !host.current) return;
        const b = ePub(data as unknown as string);
        book.current = b;
        const r = b.renderTo(host.current, {
          width,
          height,
          spread: spread ? 'always' : 'none',
          flow: 'paginated',
          allowScriptedContent: false,
        } as Parameters<Book['renderTo']>[1]);
        rendition.current = r;
        r.themes.default({
          body: { 'font-family': "'Atkinson Hyperlegible', system-ui, sans-serif" },
          p: { 'line-height': '1.6' },
        });
        r.themes.fontSize(`${fontSize}%`);
        r.on('relocated', (location: { start: { cfi: string; percentage?: number } }) => {
          const hasLocations = b.locations.length() > 0;
          callbacks.current.onLocation(
            location.start.cfi,
            hasLocations
              ? Math.round(b.locations.percentageFromCfi(location.start.cfi) * 100)
              : null,
          );
        });
        await r.display(initialCfi || undefined);
        if (cancelled) return;
        setReady(true);
        // Emplacements pour l'avancement (%) : calculés en arrière-plan.
        await b.ready;
        await b.locations.generate(1200);
        const current = r.currentLocation() as unknown as { start?: { cfi: string } };
        if (!cancelled && current?.start) {
          callbacks.current.onLocation(
            current.start.cfi,
            Math.round(b.locations.percentageFromCfi(current.start.cfi) * 100),
          );
        }
      } catch {
        if (!cancelled) callbacks.current.onError();
      }
    })();
    return () => {
      cancelled = true;
      rendition.current?.destroy();
      book.current?.destroy();
      rendition.current = null;
      book.current = null;
    };
    // Le livre n'est ouvert qu'une fois ; taille et police sont suivies plus bas.
  }, [url]);

  useEffect(() => {
    if (!ready || !rendition.current) return;
    rendition.current.spread(spread ? 'always' : 'none');
    rendition.current.resize(width, height);
  }, [ready, width, height, spread]);

  useEffect(() => {
    if (ready) rendition.current?.themes.fontSize(`${fontSize}%`);
  }, [ready, fontSize]);

  useImperativeHandle(ref, () => ({
    next: () => void rendition.current?.next(),
    prev: () => void rendition.current?.prev(),
    goToPercent: (percent: number) => {
      const b = book.current;
      if (!b || b.locations.length() === 0) return;
      void rendition.current?.display(b.locations.cfiFromPercentage(percent / 100));
    },
    visibleText: () => {
      const r = rendition.current;
      if (!r) return '';
      try {
        const location = r.currentLocation() as unknown as {
          start: { cfi: string };
          end: { cfi: string };
        };
        const start = r.getRange(location.start.cfi);
        const end = r.getRange(location.end.cfi);
        if (start && end && start.startContainer.ownerDocument === end.endContainer.ownerDocument) {
          const range = start.startContainer.ownerDocument!.createRange();
          range.setStart(start.startContainer, start.startOffset);
          range.setEnd(end.endContainer, end.endOffset);
          return range.toString();
        }
      } catch {
        // Repli : tout le chapitre affiché.
      }
      const contents = r.getContents() as unknown as { document: Document }[];
      return contents[0]?.document.body.innerText ?? '';
    },
  }));

  return (
    <div
      className="relative overflow-hidden rounded-[10px] bg-[#fffdf7] shadow-[0_18px_40px_rgba(0,0,0,.35)]"
      style={{ width, height }}
    >
      {spread && (
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-16 -translate-x-1/2"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(60,40,10,.16) 48%, rgba(60,40,10,.22) 50%, rgba(60,40,10,.16) 52%, transparent)',
          }}
        />
      )}
      <div ref={host} className="h-full w-full" />
      {!ready && (
        <p className="absolute inset-0 grid place-items-center text-lg text-ink-muted">
          Ouverture du livre…
        </p>
      )}
    </div>
  );
}
