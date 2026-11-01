import type { ResourceItem } from '@lenseignement/types';
import type { CSSProperties } from 'react';
import { FORMAT_ICONS, FORMAT_LABELS, coverInk } from './formats';
import { fileUrl } from './offline';

type CoverBook = Pick<ResourceItem, 'title' | 'author' | 'format' | 'coverColor' | 'coverFileId'>;

/** Couverture d'un livre : l'image envoyée, sinon la couleur choisie avec le titre. */
export function BookCover({
  book,
  progress,
  className = '',
  style,
}: {
  book: CoverBook;
  /** Avancement de lecture (0 à 100) sur cet appareil. */
  progress?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ink = coverInk(book.coverColor);
  return (
    <div
      className={`relative overflow-hidden rounded-l-[4px] rounded-r-[10px] shadow-[6px_8px_14px_rgba(0,0,0,.25)] ${className}`}
      style={{ background: book.coverColor, color: ink, ...style }}
    >
      {book.coverFileId ? (
        <img
          src={fileUrl(book.coverFileId)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="flex h-full flex-col p-4 pl-5">
          <p className="font-display text-lg leading-tight font-extrabold" style={{ color: ink }}>
            {book.title}
          </p>
          {book.author && <p className="mt-1 text-xs opacity-90">{book.author}</p>}
          <p className="mt-auto text-center text-5xl" aria-hidden>
            {FORMAT_ICONS[book.format]}
          </p>
        </div>
      )}
      {/* Reliure : ombre et reflet à gauche, comme un livre relié. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-3"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,.22), rgba(0,0,0,.1) 50%, rgba(255,255,255,.18) 60%, transparent)',
        }}
      />
      <span className="absolute bottom-2.5 left-4 rounded-lg bg-surface px-1.5 py-0.5 text-[11px] font-bold text-ink-strong shadow">
        {FORMAT_LABELS[book.format]}
      </span>
      {progress !== undefined && progress > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/35" aria-hidden>
          <div className="h-full bg-white" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  );
}
