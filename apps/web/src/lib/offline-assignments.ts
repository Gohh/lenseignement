'use client';

import type { ExercisePlay } from '@lenseignement/types';
import { useSyncExternalStore } from 'react';

/**
 * Devoirs gardés sur l'appareil, pour les faire sans connexion. Les exercices (sans corrigé :
 * c'est ce que la page montre déjà) vont dans le stockage local ; leurs images et sons dans le
 * cache du navigateur, servi par le service worker. Les réponses partent dans la file d'attente
 * et ne sont corrigées qu'au retour d'internet. La déconnexion et « Effacer mes données » effacent
 * tout.
 */

export const ASSIGNMENTS_CACHE = 'lenseignement-devoirs';
export const KEPT_ASSIGNMENTS_KEY = 'lse-devoirs-gardes';
export const KEPT_ASSIGNMENTS_EVENT = 'lse-devoirs';

export interface KeptAssignment {
  id: string;
  title: string;
  instructions: string;
  cohortName: string;
  dueAt: string | null;
  maxScore: number;
  exercises: Array<{ id: string; title: string; play: ExercisePlay }>;
  /** Personne qui l'a gardé (empreinte) : ses réponses partent à son nom seulement. */
  owner: string;
  keptAt: string;
  /** Réponses gardées pour l'envoi : le devoir ne se refait pas. */
  answeredAt?: string;
}

const mediaUrl = (key: string) => `/exercices/fichiers/${key}`;
const mediaOf = (a: Pick<KeptAssignment, 'exercises'>) =>
  a.exercises.flatMap((e) => (e.play.media ? [mediaUrl(e.play.media.key)] : []));

function read(): KeptAssignment[] {
  try {
    const raw = window.localStorage.getItem(KEPT_ASSIGNMENTS_KEY);
    return raw ? (JSON.parse(raw) as KeptAssignment[]) : [];
  } catch {
    return [];
  }
}

function write(list: KeptAssignment[]): void {
  try {
    window.localStorage.setItem(KEPT_ASSIGNMENTS_KEY, JSON.stringify(list));
  } catch {
    throw new Error('Plus de place sur cet appareil.');
  } finally {
    window.dispatchEvent(new Event(KEPT_ASSIGNMENTS_EVENT));
  }
}

let snapshot: { raw: string | null; value: KeptAssignment[] } = { raw: null, value: [] };
function keptList(): KeptAssignment[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEPT_ASSIGNMENTS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshot.raw) snapshot = { raw, value: read() };
  return snapshot.value;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(KEPT_ASSIGNMENTS_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(KEPT_ASSIGNMENTS_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

const EMPTY: KeptAssignment[] = [];

export function useKeptAssignments(): KeptAssignment[] {
  return useSyncExternalStore(subscribe, keptList, () => EMPTY);
}

/** Télécharge les images et sons du devoir et garde ses exercices. */
export async function keepAssignment(assignment: Omit<KeptAssignment, 'keptAt'>): Promise<void> {
  const urls = [...new Set(mediaOf(assignment))];
  if (urls.length > 0) {
    if (!('caches' in window)) throw new Error('Cet appareil ne peut pas garder de fichiers.');
    await navigator.storage?.persist?.().catch(() => false);
    const cache = await caches.open(ASSIGNMENTS_CACHE);
    for (const url of urls) {
      if (await cache.match(url)) continue;
      const file = await fetch(url);
      if (!file.ok) throw new Error('Fichier non téléchargé.');
      await cache.put(url, file);
    }
  }
  write([
    { ...assignment, keptAt: new Date().toISOString() },
    ...read().filter((a) => a.id !== assignment.id),
  ]);
}

/** Note que les réponses sont gardées pour l'envoi (le devoir ne se refait pas). */
export function markAssignmentAnswered(id: string): void {
  write(read().map((a) => (a.id === id ? { ...a, answeredAt: new Date().toISOString() } : a)));
}

/** Retire le devoir de l'appareil (et ses images et sons). */
export async function forgetAssignment(id: string): Promise<void> {
  const list = read();
  const gone = list.find((a) => a.id === id);
  const rest = list.filter((a) => a.id !== id);
  write(rest);
  if (!gone || !('caches' in window)) return;
  const stillUsed = new Set(rest.flatMap(mediaOf));
  const cache = await caches.open(ASSIGNMENTS_CACHE);
  for (const url of mediaOf(gone)) if (!stillUsed.has(url)) await cache.delete(url);
}
