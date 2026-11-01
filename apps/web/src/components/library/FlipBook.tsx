'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

/** Commandes du livre, pour les flèches, le clavier et la barre de pages. */
export interface FlipBookApi {
  next(): void;
  prev(): void;
  goTo(page: number): void;
}

interface Props {
  ref?: Ref<FlipBookApi>;
  count: number;
  /** Largeur / hauteur d'une page. */
  aspect: number;
  /** Deux pages côte à côte (grand écran) ou une seule (téléphone). */
  spread: boolean;
  pageHeight: number;
  initialPage: number;
  onPageChange(page: number, visible: number[]): void;
  /** Image d'une page (adresse), chargée à la demande. */
  getPage(index: number): Promise<string>;
}

type Turn = { dir: 'next' | 'prev'; target: number };

/** Pages visibles : en double page, la couverture est seule à droite, comme un vrai livre. */
function visiblePages(page: number, spread: boolean, count: number): [number, number] | [number] {
  if (!spread) return [page];
  const s = Math.floor((page + 1) / 2);
  return [2 * s - 1, 2 * s].map((p) => (p >= 0 && p < count ? p : -1)) as [number, number];
}

function anchor(page: number, spread: boolean): number {
  if (!spread) return page;
  const s = Math.floor((page + 1) / 2);
  return Math.max(0, 2 * s - 1);
}

/**
 * Livre qu'on feuillette : la page tourne autour de la reliure (animation 3D), puis la double
 * page suivante apparaît. Sans animation si la personne a demandé de réduire les mouvements.
 */
export function FlipBook({
  ref,
  count,
  aspect,
  spread,
  pageHeight,
  initialPage,
  onPageChange,
  getPage,
}: Props) {
  const [page, setPage] = useState(() => anchor(Math.min(initialPage, count - 1), spread));
  const [turn, setTurn] = useState<Turn | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const loading = useRef(new Set<number>());
  const pointer = useRef<number | null>(null);

  const ensure = useCallback(
    (index: number) => {
      if (index < 0 || index >= count || loading.current.has(index)) return;
      loading.current.add(index);
      getPage(index)
        .then((url) => setUrls((u) => ({ ...u, [index]: url })))
        .catch(() => loading.current.delete(index));
    },
    [count, getPage],
  );

  // Le passage téléphone ↔ grand écran garde la page lue.
  useEffect(() => setPage((p) => anchor(p, spread)), [spread]);

  const shown = visiblePages(page, spread, count);
  useEffect(() => {
    onPageChange(
      page,
      shown.filter((p) => p >= 0),
    );
    for (let i = page - 2; i <= page + 4; i++) ensure(i);
  }, [page, spread, ensure]);

  const step = spread ? 2 : 1;
  const nextOf = (p: number) => (spread ? (p === 0 ? 1 : p + 2) : p + 1);
  const prevOf = (p: number) => (spread ? Math.max(0, p - 2) : p - 1);
  const canNext = nextOf(page) < count;
  const canPrev = page > 0;

  const go = useCallback(
    (dir: 'next' | 'prev') => {
      if (turn) return;
      if (dir === 'next' && !canNext) return;
      if (dir === 'prev' && !canPrev) return;
      const target = dir === 'next' ? nextOf(page) : prevOf(page);
      const visible = visiblePages(target, spread, count);
      for (const p of visible) ensure(p);
      // La page atteinte est notée tout de suite, même si on ferme le livre pendant qu'elle tourne.
      onPageChange(
        target,
        visible.filter((p) => p >= 0),
      );
      setTurn({ dir, target });
    },
    [turn, canNext, canPrev, page, spread, count, ensure, onPageChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      next: () => go('next'),
      prev: () => go('prev'),
      goTo: (p: number) => {
        const target = anchor(Math.max(0, Math.min(count - 1, p)), spread);
        if (target === page || turn) return;
        if (target === nextOf(page)) return go('next');
        if (target === prevOf(page)) return go('prev');
        setPage(target);
      },
    }),
    [go, count, spread, page, turn],
  );

  const pageWidth = pageHeight * aspect;
  const finish = () => {
    if (turn) setPage(turn.target);
    setTurn(null);
  };

  const face = (index: number, side: 'left' | 'right' | 'single') => (
    <Page index={index} url={index >= 0 ? urls[index] : undefined} side={side} count={count} />
  );

  let base: [number, number] | [number] = shown;
  let sheet: {
    front: number;
    back: number;
    side: 'left' | 'right' | 'single';
    anim: string;
  } | null = null;
  if (turn) {
    const target = visiblePages(turn.target, spread, count);
    if (spread) {
      const [l, r] = shown as [number, number];
      const [tl, tr] = target as [number, number];
      if (turn.dir === 'next') {
        base = [l, tr];
        sheet = { front: r, back: tl, side: 'right', anim: 'lse-turn-next' };
      } else {
        base = [tl, r];
        sheet = { front: l, back: tr, side: 'left', anim: 'lse-turn-prev' };
      }
    } else if (turn.dir === 'next') {
      base = target;
      sheet = { front: shown[0], back: -2, side: 'single', anim: 'lse-turn-next' };
    } else {
      base = shown;
      sheet = { front: target[0], back: -2, side: 'single', anim: 'lse-turn-back' };
    }
  }

  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: pageWidth * (spread ? 2 : 1), height: pageHeight, perspective: 2600 }}
      onPointerDown={(e) => {
        pointer.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (pointer.current === null) return;
        const dx = e.clientX - pointer.current;
        pointer.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 'next' : 'prev');
      }}
      data-testid="flipbook"
      data-step={step}
    >
      {spread ? (
        <>
          <div className="absolute inset-y-0 left-0" style={{ width: pageWidth }}>
            {face(base[0], 'left')}
          </div>
          <div className="absolute inset-y-0 right-0" style={{ width: pageWidth }}>
            {face(base[1] ?? -1, 'right')}
          </div>
        </>
      ) : (
        <div className="absolute inset-0">{face(base[0], 'single')}</div>
      )}
      {sheet && (
        <div
          className="lse-sheet absolute inset-y-0"
          style={{
            width: pageWidth,
            left: sheet.side === 'left' ? 0 : spread ? pageWidth : 0,
            transformOrigin: sheet.side === 'left' ? 'right center' : 'left center',
            transformStyle: 'preserve-3d',
            animation: `${sheet.anim} 650ms cubic-bezier(.45,.05,.35,1) forwards`,
            zIndex: 5,
          }}
          onAnimationEnd={finish}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            {face(sheet.front, sheet.side === 'single' ? 'single' : sheet.side)}
            <div className="lse-sheet-shade pointer-events-none absolute inset-0" />
          </div>
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {sheet.back === -2 ? (
              <div className="h-full w-full rounded-[4px] bg-[#f6efe0]" />
            ) : (
              face(sheet.back, sheet.side === 'right' ? 'left' : 'right')
            )}
            <div className="lse-sheet-shade pointer-events-none absolute inset-0" />
          </div>
        </div>
      )}
    </div>
  );
}

function Page({
  index,
  url,
  side,
  count,
}: {
  index: number;
  url: string | undefined;
  side: 'left' | 'right' | 'single';
  count: number;
}) {
  if (index < 0) return null;
  const radius =
    side === 'left' ? 'rounded-l-[10px]' : side === 'right' ? 'rounded-r-[10px]' : 'rounded-[10px]';
  const spine =
    side === 'left'
      ? 'linear-gradient(90deg, transparent 88%, rgba(60,40,10,.18))'
      : side === 'right'
        ? 'linear-gradient(90deg, rgba(60,40,10,.22), transparent 12%)'
        : 'linear-gradient(90deg, rgba(60,40,10,.12), transparent 6%)';
  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[#fffdf7] shadow-[0_18px_40px_rgba(0,0,0,.35)] ${radius}`}
    >
      {url ? (
        <img
          src={url}
          alt={`Page ${index + 1} sur ${count}`}
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-ink-muted" aria-hidden>
          …
        </div>
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: spine }} />
    </div>
  );
}
