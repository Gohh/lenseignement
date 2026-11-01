'use client';

import type { ResourceItem } from '@lenseignement/types';
import { useSyncExternalStore } from 'react';

/**
 * Livres gardés sur l'appareil (lecture sans connexion). Les fichiers vont dans le cache du
 * navigateur (le service worker les sert hors ligne), la liste et la page de lecture dans le
 * stockage local. La déconnexion et « Effacer mes données » effacent tout.
 */

export const BOOKS_CACHE = 'lenseignement-livres';
const KEPT_KEY = 'lse-livres-gardes';
const READING_KEY = 'lse-livres-lecture';
const EVENT = 'lse-livres';

export const fileUrl = (id: string) => `/mon-espace/bibliotheque/fichier/${id}`;

/** Ce qui suffit pour montrer et ouvrir un livre sans connexion. */
export type KeptBook = Pick<
  ResourceItem,
  | 'id'
  | 'title'
  | 'format'
  | 'shelf'
  | 'author'
  | 'coverColor'
  | 'coverFileId'
  | 'files'
  | 'cohortName'
  | 'offlineAllowed'
> & { keptAt: string };

export interface ReadingPosition {
  /** Page (PDF, images) ou emplacement dans le texte (EPUB). */
  page?: number;
  cfi?: string;
  /** Avancement de 0 à 100. */
  percent: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou interdit : la lecture continue sans mémoriser.
  }
  window.dispatchEvent(new Event(EVENT));
}

let keptSnapshot: { raw: string | null; value: KeptBook[] } = { raw: null, value: [] };
function keptList(): KeptBook[] {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEPT_KEY);
  if (raw !== keptSnapshot.raw) keptSnapshot = { raw, value: read<KeptBook[]>(KEPT_KEY, []) };
  return keptSnapshot.value;
}

let readingSnapshot: { raw: string | null; value: Record<string, ReadingPosition> } = {
  raw: null,
  value: {},
};
function readingMap(): Record<string, ReadingPosition> {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(READING_KEY);
  if (raw !== readingSnapshot.raw) {
    readingSnapshot = { raw, value: read<Record<string, ReadingPosition>>(READING_KEY, {}) };
  }
  return readingSnapshot.value;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

const EMPTY_KEPT: KeptBook[] = [];
const EMPTY_READING: Record<string, ReadingPosition> = {};

export function useKeptBooks(): KeptBook[] {
  return useSyncExternalStore(subscribe, keptList, () => EMPTY_KEPT);
}

export function useReadingPositions(): Record<string, ReadingPosition> {
  return useSyncExternalStore(subscribe, readingMap, () => EMPTY_READING);
}

export function readingPosition(id: string): ReadingPosition | undefined {
  return readingMap()[id];
}

export function saveReadingPosition(id: string, position: ReadingPosition): void {
  write(READING_KEY, { ...readingMap(), [id]: position });
}

function urlsOf(book: Pick<ResourceItem, 'files' | 'coverFileId'>): string[] {
  return [
    ...book.files.map((f) => fileUrl(f.id)),
    ...(book.coverFileId ? [fileUrl(book.coverFileId)] : []),
  ];
}

/** Télécharge tous les fichiers du livre et le note comme gardé. */
export async function keepBook(
  book: ResourceItem | KeptBook,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!('caches' in window)) throw new Error('Cet appareil ne peut pas garder de fichiers.');
  // Demande au navigateur de ne pas effacer ces fichiers quand la place manque.
  await navigator.storage?.persist?.().catch(() => false);
  const cache = await caches.open(BOOKS_CACHE);
  const urls = urlsOf(book);
  let done = 0;
  for (const url of urls) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Téléchargement impossible.');
    await cache.put(url, response);
    onProgress?.(++done, urls.length);
  }
  const kept: KeptBook = {
    id: book.id,
    title: book.title,
    format: book.format,
    shelf: book.shelf,
    author: book.author,
    coverColor: book.coverColor,
    coverFileId: book.coverFileId,
    files: book.files,
    cohortName: book.cohortName,
    offlineAllowed: book.offlineAllowed,
    keptAt: new Date().toISOString(),
  };
  write(KEPT_KEY, [kept, ...keptList().filter((b) => b.id !== book.id)]);
}

/** Retire le livre de l'appareil (fichiers et liste). */
export async function forgetBook(book: Pick<ResourceItem, 'id' | 'files' | 'coverFileId'>) {
  if ('caches' in window) {
    const cache = await caches.open(BOOKS_CACHE);
    await Promise.all(urlsOf(book).map((url) => cache.delete(url)));
  }
  write(
    KEPT_KEY,
    keptList().filter((b) => b.id !== book.id),
  );
}

/** Retire de l'appareil les livres que l'enseignant a enlevés de la bibliothèque. */
export async function forgetRemovedBooks(stillThere: Set<string>): Promise<void> {
  for (const book of keptList()) {
    if (!stillThere.has(book.id)) await forgetBook(book);
  }
}
