'use client';

import type { LibraryFormat, ResourceItem } from '@lenseignement/types';
import { useEffect, useId, useMemo, useState } from 'react';
import { removeResourceAction } from '@/app/mon-espace/bibliotheque/actions';
import { AddBookDialog, type TeachingCohort } from './AddBookDialog';
import { BookCover } from './BookCover';
import { FORMAT_LABELS } from './formats';
import { forgetRemovedBooks, useKeptBooks, useReadingPositions, type KeptBook } from './offline';
import { Reader } from './Reader';

type ShelfBook = ResourceItem | KeptBook;

const FILTERS: { code: 'tout' | 'livres' | LibraryFormat; label: string }[] = [
  { code: 'tout', label: 'Tout' },
  { code: 'livres', label: 'Livres' },
  { code: 'images', label: 'Images' },
  { code: 'audio', label: 'Audio' },
  { code: 'video', label: 'Vidéo' },
  { code: 'lien', label: 'Liens' },
];

const chip = (on: boolean) =>
  `min-h-[40px] rounded-pill border-2 px-4 text-sm font-bold ${
    on
      ? 'border-primary bg-primary text-surface'
      : 'border-line bg-surface text-ink-muted hover:border-primary-line'
  }`;

/** Étagères de la bibliothèque : recherche, filtres, livres en cartes, lecteur en grand. */
export function Library({
  items,
  cohorts,
}: {
  items: ResourceItem[];
  /** Classes où la personne peut ajouter des livres (vide : élève, parent). */
  cohorts: TeachingCohort[];
}) {
  const kept = useKeptBooks();
  const keptIds = useMemo(() => new Set(kept.map((b) => b.id)), [kept]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['code']>('tout');
  const [cohort, setCohort] = useState('toutes');
  const [onlyKept, setOnlyKept] = useState(false);
  const [open, setOpen] = useState<ResourceItem | null>(null);

  // Un livre retiré par l'enseignant disparaît aussi de l'appareil.
  useEffect(() => {
    void forgetRemovedBooks(new Set(items.map((i) => i.id)));
  }, [items]);

  const cohortsSeen = useMemo(
    () => [...new Map(items.map((i) => [i.cohortId, i.cohortName])).entries()],
    [items],
  );
  const shelves = useMemo(() => [...new Set(items.map((i) => i.shelf))], [items]);

  const query = search.trim().toLocaleLowerCase('fr');
  const shown = items.filter(
    (b) =>
      (filter === 'tout' ||
        (filter === 'livres' ? b.format === 'pdf' || b.format === 'epub' : b.format === filter)) &&
      (cohort === 'toutes' || b.cohortId === cohort) &&
      (!onlyKept || keptIds.has(b.id)) &&
      (!query || `${b.title} ${b.author ?? ''} ${b.shelf}`.toLocaleLowerCase('fr').includes(query)),
  );
  const byShelf = new Map<string, ResourceItem[]>();
  for (const b of shown) byShelf.set(b.shelf, [...(byShelf.get(b.shelf) ?? []), b]);
  const shelfNames = [...byShelf.keys()].sort((a, b) =>
    a === 'Autres' ? 1 : b === 'Autres' ? -1 : a.localeCompare(b, 'fr'),
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-4xl font-extrabold">Bibliothèque</h1>
        {kept.length > 0 && (
          <button
            type="button"
            onClick={() => setOnlyKept((v) => !v)}
            aria-pressed={onlyKept}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-card border-2 px-4 font-bold ${
              onlyKept
                ? 'border-primary bg-primary text-surface'
                : 'border-primary-line bg-surface text-primary'
            }`}
          >
            ⬇ Mes livres hors ligne ({kept.length})
          </button>
        )}
        {cohorts.length > 0 && <AddBookDialog cohorts={cohorts} shelves={shelves} />}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="w-full sm:w-80">
            <span className="sr-only">Chercher un livre</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Chercher un livre, un auteur…"
              className="min-h-[44px] w-full rounded-card border-2 border-line bg-surface px-3"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
            {FILTERS.map((f) => (
              <button
                key={f.code}
                type="button"
                className={chip(filter === f.code)}
                aria-pressed={filter === f.code}
                onClick={() => setFilter(f.code)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {cohortsSeen.length > 1 && (
            <label className="sm:ml-auto">
              <span className="sr-only">Classe</span>
              <select
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
                className="min-h-[40px] rounded-pill border-2 border-line bg-surface px-3 text-sm font-bold"
              >
                <option value="toutes">Toutes les classes</option>
                {cohortsSeen.map(([id, name]) => (
                  <option key={id} value={id}>
                    Classe : {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-big border border-line bg-surface p-8 text-center shadow-soft">
          <p className="text-5xl" aria-hidden>
            📚
          </p>
          <p className="mt-2 text-lg">
            {cohorts.length > 0
              ? 'L’étagère est vide. Ajoutez un premier livre pour votre classe.'
              : 'Aucun livre pour le moment. Ton enseignant en ajoutera pour ta classe.'}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-big bg-surface p-6 text-center text-lg">Aucun livre ne correspond.</p>
      ) : (
        shelfNames.map((name) => (
          <Shelf
            key={name}
            name={name}
            books={byShelf.get(name)!}
            keptIds={keptIds}
            onOpen={(b) => setOpen(b as ResourceItem)}
          />
        ))
      )}

      {open && <Reader book={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Une étagère en bois et ses livres. */
export function Shelf({
  name,
  books,
  keptIds,
  onOpen,
}: {
  name: string;
  books: ShelfBook[];
  keptIds: Set<string>;
  onOpen(book: ShelfBook): void;
}) {
  const reading = useReadingPositions();
  const id = useId();
  return (
    <section aria-labelledby={id} className="pt-2">
      <h2 id={id} className="mb-3 text-2xl font-bold">
        {name}{' '}
        <span className="font-sans text-base font-normal text-ink-muted">
          · {books.length} {books.length > 1 ? 'livres' : 'livre'}
        </span>
      </h2>
      <ul
        role="list"
        className="grid grid-cols-2 items-end gap-x-4 gap-y-8 px-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-x-7 sm:px-5"
        data-testid="shelf"
      >
        {books.map((b) => (
          <BookCard
            key={b.id}
            book={b}
            kept={keptIds.has(b.id)}
            progress={reading[b.id]?.percent}
            onOpen={() => onOpen(b)}
          />
        ))}
      </ul>
      <div
        aria-hidden
        className="-mt-1 h-4 rounded-md sm:h-5"
        style={{
          background: 'linear-gradient(#c79a63, #a87a45)',
          boxShadow: '0 10px 18px rgba(80,50,20,.25), inset 0 3px 0 rgba(255,255,255,.25)',
        }}
      />
    </section>
  );
}

function BookCard({
  book,
  kept,
  progress,
  onOpen,
}: {
  book: ShelfBook;
  kept: boolean;
  progress?: number;
  onOpen(): void;
}) {
  const isLink = book.format === 'lien';
  const status =
    progress !== undefined && progress >= 100
      ? 'Terminé ✓'
      : progress
        ? `Lu à ${progress} %`
        : isLink
          ? 'Lien internet'
          : FORMAT_LABELS[book.format];
  const cover = (
    <>
      <BookCover
        book={book}
        progress={progress}
        className="aspect-[7/10] w-full transition-transform duration-200 group-hover:-translate-y-3 group-hover:-rotate-1 group-focus-visible:-translate-y-3"
      />
      {kept && (
        <span className="absolute top-[calc(100%-10px)] left-1/2 -translate-x-1/2 rounded-pill border-2 border-surface bg-primary px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-surface">
          ✓ Hors ligne
        </span>
      )}
    </>
  );
  const manage = 'canManage' in book && book.canManage;
  return (
    <li className="relative pb-1">
      {isLink && 'url' in book && book.url ? (
        <a
          href={book.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block rounded-card"
        >
          {cover}
          <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
        </a>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="group relative block w-full rounded-card text-left"
          aria-label={`Ouvrir « ${book.title} »`}
        >
          {cover}
        </button>
      )}
      <p className="mt-4 line-clamp-2 text-center text-sm leading-tight font-bold text-ink-strong">
        {book.title}
      </p>
      <p className="text-center text-xs text-ink-muted">{status}</p>
      {manage && (
        <details className="text-center text-xs">
          <summary className="inline-flex min-h-[32px] cursor-pointer items-center font-bold text-primary">
            Gérer
          </summary>
          <p className="text-ink-muted">
            {'cohortName' in book ? book.cohortName : ''}
            {'teacherName' in book && book.teacherName ? ` · ${book.teacherName}` : ''}
          </p>
          <form action={removeResourceAction}>
            <input type="hidden" name="id" value={book.id} />
            <button type="submit" className="min-h-[32px] font-bold text-error underline">
              Retirer de la bibliothèque<span className="sr-only"> « {book.title} »</span>
            </button>
          </form>
        </details>
      )}
    </li>
  );
}
