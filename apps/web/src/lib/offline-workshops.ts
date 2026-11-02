'use client';

import type { H5PKeepList, SimulationStep, WorkshopTrade } from '@lenseignement/types';
import { useSyncExternalStore } from 'react';

/**
 * Ateliers gardés sur l'appareil, pour les faire sans connexion. La fiche (sans corrigé : c'est
 * ce que la page montre déjà) va dans le stockage local ; les fichiers des exercices H5P dans le
 * cache du navigateur. Un essai fait sans connexion part dans la file d'attente des actions et
 * n'est corrigé qu'au retour d'internet. La déconnexion et « Effacer mes données » effacent tout.
 */

export const WORKSHOPS_CACHE = 'lenseignement-ateliers';
const KEPT_KEY = 'lse-ateliers-gardes';
const EVENT = 'lse-ateliers';

export interface KeptWorkshop {
  code: string;
  title: string;
  trade: WorkshopTrade;
  summary: string;
  steps: SimulationStep[];
  /** Personne qui l'a gardé (empreinte) : ses essais partent à son nom seulement. */
  owner: string;
  keptAt: string;
}

const listUrl = (key: string) => `/h5p/liste/${key}`;
const playerUrl = (key: string) => `/h5p/lecteur/${key}?mode=local`;

const packagesOf = (steps: SimulationStep[]) =>
  steps.flatMap((s) => (s.kind === 'h5p' ? [s.packageKey] : []));

function read(): KeptWorkshop[] {
  try {
    const raw = window.localStorage.getItem(KEPT_KEY);
    return raw ? (JSON.parse(raw) as KeptWorkshop[]) : [];
  } catch {
    return [];
  }
}

function write(list: KeptWorkshop[]): void {
  try {
    window.localStorage.setItem(KEPT_KEY, JSON.stringify(list));
  } catch {
    throw new Error('Plus de place sur cet appareil.');
  } finally {
    window.dispatchEvent(new Event(EVENT));
  }
}

let snapshot: { raw: string | null; value: KeptWorkshop[] } = { raw: null, value: [] };
function keptList(): KeptWorkshop[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEPT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshot.raw) snapshot = { raw, value: read() };
  return snapshot.value;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

const EMPTY: KeptWorkshop[] = [];

export function useKeptWorkshops(): KeptWorkshop[] {
  return useSyncExternalStore(subscribe, keptList, () => EMPTY);
}

/** Poids total des fichiers à télécharger (exercices H5P), ou 0. */
export async function workshopBytes(steps: SimulationStep[]): Promise<number> {
  let bytes = 0;
  for (const key of new Set(packagesOf(steps))) {
    const res = await fetch(listUrl(key));
    if (!res.ok) throw new Error('Exercice introuvable.');
    bytes += ((await res.json()) as H5PKeepList).bytes;
  }
  return bytes;
}

/** Télécharge les fichiers des exercices et garde la fiche de l'atelier. */
export async function keepWorkshop(
  workshop: Omit<KeptWorkshop, 'keptAt'>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const keys = [...new Set(packagesOf(workshop.steps))];
  if (keys.length > 0) {
    if (!('caches' in window)) throw new Error('Cet appareil ne peut pas garder de fichiers.');
    await navigator.storage?.persist?.().catch(() => false);
    const cache = await caches.open(WORKSHOPS_CACHE);
    for (const key of keys) {
      const res = await fetch(listUrl(key));
      if (!res.ok) throw new Error('Exercice introuvable.');
      const list = (await res.clone().json()) as H5PKeepList;
      const urls = [playerUrl(key), ...list.files.map((f) => f.url)];
      let done = 0;
      for (const url of urls) {
        // Le moteur du lecteur est commun à tous les exercices : déjà gardé, il n'est pas repris.
        if (!url.startsWith('/h5p/moteur/') || !(await cache.match(url))) {
          const file = await fetch(url);
          if (!file.ok) throw new Error('Fichier non téléchargé.');
          await cache.put(url, file);
        }
        onProgress?.(++done, urls.length);
      }
      await cache.put(listUrl(key), res);
    }
  }
  const kept: KeptWorkshop = { ...workshop, keptAt: new Date().toISOString() };
  write([kept, ...read().filter((w) => w.code !== workshop.code)]);
}

/** Retire l'atelier de l'appareil (et les fichiers de ses exercices). */
export async function forgetWorkshop(code: string): Promise<void> {
  const list = read();
  const gone = list.find((w) => w.code === code);
  const rest = list.filter((w) => w.code !== code);
  write(rest);
  if (!gone || !('caches' in window)) return;
  const stillUsed = new Set(rest.flatMap((w) => packagesOf(w.steps)));
  const cache = await caches.open(WORKSHOPS_CACHE);
  for (const key of packagesOf(gone.steps)) {
    if (stillUsed.has(key)) continue;
    const res = await cache.match(listUrl(key));
    const files = res ? ((await res.json()) as H5PKeepList).files : [];
    for (const f of files) if (!f.url.startsWith('/h5p/moteur/')) await cache.delete(f.url);
    await cache.delete(playerUrl(key));
    await cache.delete(listUrl(key));
  }
}

/** Efface la liste des ateliers gardés (« Effacer mes données sur cet appareil »). */
export function clearKeptWorkshops(): void {
  try {
    window.localStorage.removeItem(KEPT_KEY);
  } catch {
    // Rien à effacer.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Page du lecteur et fichiers d'un exercice gardé, lus dans le cache de l'appareil. */
export async function keptPlayer(key: string): Promise<{
  html: string;
  files: Array<{ path: string; type: string; data: ArrayBuffer }>;
} | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(WORKSHOPS_CACHE);
  const [page, listRes] = await Promise.all([
    cache.match(playerUrl(key)),
    cache.match(listUrl(key)),
  ]);
  if (!page || !listRes) return null;
  const list = (await listRes.json()) as H5PKeepList;
  const files = [];
  for (const f of list.files) {
    const res = await cache.match(f.url);
    if (!res) return null;
    files.push({
      path: new URL(f.url, location.origin).pathname,
      type: res.headers.get('content-type') ?? 'application/octet-stream',
      data: await res.arrayBuffer(),
    });
  }
  return { html: await page.text(), files };
}
