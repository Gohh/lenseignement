'use client';

import type { ResourceItem } from '@lenseignement/types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speak } from '@/lib/speech';
import { BookCover } from './BookCover';
import { EpubView, type EpubApi } from './EpubView';
import { FlipBook, type FlipBookApi } from './FlipBook';
import { formatSize } from './formats';
import {
  fileUrl,
  forgetBook,
  keepBook,
  readingPosition,
  saveReadingPosition,
  useKeptBooks,
  type KeptBook,
} from './offline';
import { openPdf, pdfAspect, pdfPageText, renderPdfPage } from './pdf';

type ReaderBook = ResourceItem | KeptBook;

interface Props {
  book: ReaderBook;
  onClose(): void;
  /** Ouvert depuis la page hors connexion : on ne propose pas de télécharger. */
  offline?: boolean;
}

const ZOOMS = [1, 1.25, 1.5, 2];
const FONT_SIZES = [100, 120, 140, 170];
const toolButton =
  'inline-grid min-h-[44px] min-w-[44px] place-items-center rounded-card bg-primary-soft px-2 font-bold text-primary hover:bg-primary-line disabled:opacity-40';

/** Le livre ouvert en grand au-dessus de la page, qu'on feuillette. */
export function Reader({ book, onClose, offline = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const flip = useRef<FlipBookApi>(null);
  const epub = useRef<EpubApi>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState<{ count: number; aspect: number } | null>(null);
  const [current, setCurrent] = useState<{ page: number; visible: number[] }>({
    page: 0,
    visible: [],
  });
  const [percent, setPercent] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [epubTurn, setEpubTurn] = useState<{ dir: 'next' | 'prev'; key: number } | null>(null);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const objectUrls = useRef<string[]>([]);
  const start = useRef(readingPosition(book.id));
  const kept = useKeptBooks().some((b) => b.id === book.id);
  const [keeping, setKeeping] = useState<string | null>(null);

  const isPages = book.format === 'pdf' || book.format === 'images';
  const canSpeak =
    (book.format === 'pdf' || book.format === 'epub') &&
    typeof window !== 'undefined' &&
    'speechSynthesis' in window;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect;
      setSize({ w: Math.floor(box.width), h: Math.floor(box.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ouverture du fichier selon le format.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (book.format === 'pdf') {
          const res = await fetch(fileUrl(book.files[0]!.id), { credentials: 'same-origin' });
          if (!res.ok) throw new Error('fichier');
          const doc = await openPdf(await res.arrayBuffer());
          if (cancelled) return void doc.loadingTask.destroy();
          pdf.current = doc;
          setPages({ count: doc.numPages, aspect: await pdfAspect(doc) });
        } else if (book.format === 'images') {
          const img = new Image();
          img.src = fileUrl(book.files[0]!.id);
          await img.decode();
          if (!cancelled) {
            setPages({ count: book.files.length, aspect: img.naturalWidth / img.naturalHeight });
          }
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      void pdf.current?.loadingTask.destroy();
      pdf.current = null;
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    };
  }, [book]);

  const wide = size.w >= 900;
  const aspect = pages?.aspect ?? 0.72;
  const spread = wide && aspect < 1.1;
  const availW = Math.max(200, size.w - (wide ? 150 : 8));
  const availH = Math.max(200, size.h - 8);
  const pageHeight = Math.floor(
    Math.min(availH, availW / (aspect * (spread ? 2 : 1))) * ZOOMS[isPages ? zoom : 0]!,
  );

  const renderHeight = useRef(0);
  renderHeight.current = Math.min(2600, Math.round(pageHeight * (window.devicePixelRatio || 1)));
  const getPage = useCallback(
    async (index: number) => {
      if (book.format === 'images') return fileUrl(book.files[index]!.id);
      const doc = pdf.current;
      if (!doc) throw new Error('pas prêt');
      const blob = await renderPdfPage(doc, index, Math.max(600, renderHeight.current * 1.25));
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      return url;
    },
    [book],
  );

  const onPageChange = useCallback(
    (page: number, visible: number[]) => {
      setCurrent({ page, visible });
      if (!pages) return;
      const last = Math.max(page, ...visible);
      saveReadingPosition(book.id, {
        page,
        percent: Math.round(((last + 1) / pages.count) * 100),
      });
    },
    [book.id, pages],
  );

  const onEpubLocation = useCallback(
    (cfi: string, value: number | null) => {
      if (value !== null) setPercent(value);
      saveReadingPosition(book.id, {
        cfi,
        percent: value ?? readingPosition(book.id)?.percent ?? 0,
      });
    },
    [book.id],
  );

  const turnEpub = (dir: 'next' | 'prev') => {
    if (epubTurn) return;
    if (dir === 'next') epub.current?.next();
    else epub.current?.prev();
    setEpubTurn({ dir, key: Date.now() });
  };
  const next = () => (book.format === 'epub' ? turnEpub('next') : flip.current?.next());
  const prev = () => (book.format === 'epub' ? turnEpub('prev') : flip.current?.prev());

  async function listen() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    let text = '';
    if (book.format === 'epub') text = epub.current?.visibleText() ?? '';
    else if (pdf.current) {
      const parts = await Promise.all(current.visible.map((i) => pdfPageText(pdf.current!, i)));
      text = parts.join('\n');
    }
    if (!text.trim()) return;
    setSpeaking(true);
    speak(text, 'fr', () => setSpeaking(false));
  }

  async function toggleKeep() {
    if (kept) {
      await forgetBook(book);
      return;
    }
    setKeeping('Téléchargement…');
    try {
      await keepBook(book, (done, total) => setKeeping(`Téléchargement ${done}/${total}…`));
      setKeeping(null);
    } catch {
      setKeeping('Échec : vérifiez la connexion');
      setTimeout(() => setKeeping(null), 4000);
    }
  }

  const total = pages?.count ?? 0;
  const shownPages = current.visible.map((i) => i + 1);
  const pageLabel =
    shownPages.length > 1 ? `Pages ${shownPages.join('-')}` : `Page ${shownPages[0] ?? 1}`;
  const media = book.format === 'audio' || book.format === 'video';

  return (
    <dialog
      ref={dialog}
      aria-label={book.title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (media || (e.target as HTMLElement).tagName === 'INPUT') return;
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-[rgba(16,48,31,.94)]"
      data-testid="reader"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 px-2 pt-2 sm:px-4 sm:pt-3">
          <div className="mx-auto flex min-w-0 flex-wrap items-center gap-1.5 rounded-big bg-surface p-1.5 shadow-soft sm:gap-2">
            <p className="max-w-[28vw] truncate px-2 sm:max-w-[40vw] font-display text-lg font-bold text-ink-strong">
              {book.title}
            </p>
            {!media && (
              <>
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => setZoom((z) => Math.max(0, z - 1))}
                  disabled={zoom === 0}
                  aria-label={isPages ? 'Rapetisser' : 'Texte plus petit'}
                >
                  A−
                </button>
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
                  disabled={zoom === ZOOMS.length - 1}
                  aria-label={isPages ? 'Agrandir' : 'Texte plus grand'}
                >
                  A+
                </button>
              </>
            )}
            {canSpeak && (
              <button
                type="button"
                className={toolButton}
                onClick={() => void listen()}
                aria-pressed={speaking}
                aria-label={speaking ? 'Arrêter la lecture' : 'Écouter la page'}
              >
                {speaking ? '⏹' : '🔊'}
              </button>
            )}
            {!offline && book.offlineAllowed && (
              <button
                type="button"
                onClick={() => void toggleKeep()}
                disabled={keeping !== null && keeping.startsWith('Télé')}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-card px-3 font-bold ${
                  kept
                    ? 'border-2 border-primary bg-surface text-primary'
                    : 'bg-primary text-surface hover:bg-primary-dark'
                }`}
                aria-label={kept ? 'Retirer de cet appareil' : 'Garder ce livre hors ligne'}
                data-testid="keep-book"
              >
                {keeping ?? (kept ? '✓ Hors ligne' : '⬇ Garder hors ligne')}
              </button>
            )}
            {offline && <span className="px-2 font-bold text-primary">✓ Sur cet appareil</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-2xl font-bold text-ink-strong shadow-soft"
            aria-label="Fermer le livre"
          >
            ✕
          </button>
        </div>

        <div ref={stage} className="relative min-h-0 flex-1 overflow-auto px-1 py-3 sm:py-4">
          {error ? (
            <div className="mx-auto mt-10 max-w-md rounded-big bg-surface p-6 text-center">
              <p className="text-lg font-bold">Ce livre ne s’ouvre pas.</p>
              <p className="mt-2 text-ink-muted">
                Vérifiez la connexion. Sans connexion, seuls les livres gardés sur l’appareil
                s’ouvrent.
              </p>
            </div>
          ) : size.w === 0 ? null : media ? (
            <MediaView book={book} width={availW} height={availH} wide={wide} />
          ) : book.format === 'epub' ? (
            <div className="lse-book-open relative mx-auto w-fit">
              <EpubView
                ref={epub}
                url={fileUrl(book.files[0]!.id)}
                width={Math.min(availW, wide ? 1180 : 680)}
                height={availH}
                spread={wide}
                fontSize={FONT_SIZES[zoom]!}
                initialCfi={start.current?.cfi}
                onLocation={onEpubLocation}
                onError={() => setError(true)}
              />
              {epubTurn && (
                <div
                  key={epubTurn.key}
                  className="lse-sheet pointer-events-none absolute inset-y-0 rounded-[10px] bg-[#fbf5e8]"
                  style={{
                    width: wide ? '50%' : '100%',
                    left: wide && epubTurn.dir === 'next' ? '50%' : 0,
                    transformOrigin:
                      wide && epubTurn.dir === 'prev' ? 'right center' : 'left center',
                    animation: `${
                      epubTurn.dir === 'next'
                        ? 'lse-turn-next'
                        : wide
                          ? 'lse-turn-prev'
                          : 'lse-turn-back'
                    } 600ms cubic-bezier(.45,.05,.35,1) forwards`,
                    perspective: 2600,
                    zIndex: 20,
                  }}
                  onAnimationEnd={() => setEpubTurn(null)}
                >
                  <div className="lse-sheet-shade absolute inset-0 rounded-[10px]" />
                </div>
              )}
            </div>
          ) : pages ? (
            <div className="lse-book-open">
              <FlipBook
                ref={flip}
                count={pages.count}
                aspect={pages.aspect}
                spread={spread}
                pageHeight={pageHeight}
                initialPage={start.current?.page ?? 0}
                onPageChange={onPageChange}
                getPage={getPage}
              />
            </div>
          ) : (
            <p className="mt-16 text-center text-lg font-bold text-surface">Ouverture du livre…</p>
          )}
        </div>

        {!media && !error && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute top-1/2 left-2 z-30 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-surface text-3xl font-extrabold text-primary shadow-soft sm:left-5"
              aria-label="Page précédente"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute top-1/2 right-2 z-30 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-surface text-3xl font-extrabold text-primary shadow-soft sm:right-5"
              aria-label="Page suivante"
            >
              ›
            </button>
            <div className="mx-auto flex w-[min(640px,92vw)] items-center gap-3 pb-4 font-bold text-surface">
              {isPages && total > 0 ? (
                <>
                  <span className="shrink-0" aria-live="polite">
                    {pageLabel} / {total}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={total}
                    value={current.page + 1}
                    onChange={(e) => flip.current?.goTo(Number(e.target.value) - 1)}
                    className="flex-1 accent-[#e97824]"
                    aria-label="Aller à la page"
                  />
                  <span className="shrink-0">
                    {Math.round(((Math.max(0, ...current.visible) + 1) / total) * 100)} %
                  </span>
                </>
              ) : book.format === 'epub' ? (
                <>
                  <span className="shrink-0">Avancement</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={percent ?? 0}
                    disabled={percent === null}
                    onChange={(e) => epub.current?.goToPercent(Number(e.target.value))}
                    className="flex-1 accent-[#e97824]"
                    aria-label="Aller à un endroit du livre"
                  />
                  <span className="shrink-0">{percent === null ? '…' : `${percent} %`}</span>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

/** Audio ou vidéo : la couverture et le lecteur, sans feuilletage. */
function MediaView({
  book,
  width,
  height,
  wide,
}: {
  book: ReaderBook;
  width: number;
  height: number;
  wide: boolean;
}) {
  const file = book.files[0]!;
  const src = fileUrl(file.id);
  if (book.format === 'video') {
    return (
      <div className="lse-book-open mx-auto flex h-full max-w-[1200px] items-center justify-center">
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          className="max-h-full max-w-full rounded-big bg-black shadow-soft"
          style={{ maxHeight: height }}
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }
  const coverH = Math.min(height - 40, wide ? 460 : 300);
  return (
    <div
      className="lse-book-open mx-auto flex flex-wrap items-center justify-center gap-8 rounded-big bg-[#fffdf7] p-6 shadow-soft sm:p-10"
      style={{ maxWidth: Math.min(width, 1000) }}
    >
      <BookCover book={book} className="shrink-0" style={{ height: coverH, width: coverH * 0.7 }} />
      <div className="min-w-[240px] flex-1 space-y-4">
        <h2 className="text-3xl font-extrabold">{book.title}</h2>
        {book.author && <p className="text-lg text-ink-muted">{book.author}</p>}
        {'description' in book && book.description && (
          <p className="whitespace-pre-line">{book.description}</p>
        )}
        <audio src={src} controls preload="metadata" className="w-full" />
        <p className="text-sm text-ink-muted">Audio · {formatSize(file.sizeBytes)}</p>
      </div>
    </div>
  );
}
