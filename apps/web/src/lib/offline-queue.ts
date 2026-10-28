'use client';

import type { LearningEventInput, LearningEventResult } from '@lenseignement/types';

/**
 * File locale des actions faites sans réseau (cahier §5.4, ADR-012). Chaque action garde son
 * identifiant d'opération : un renvoi est reconnu par l'API et n'est jamais compté deux fois.
 * On ne garde que le strict nécessaire (identifiants, numéro de leçon, choix du quiz).
 */

export interface QueuedAction {
  event: LearningEventInput;
  /** Personne qui a fait l'action (empreinte, pas d'identifiant en clair) : voir `ownerOf`. */
  owner: string;
}

const DB_NAME = 'lenseignement';
const STORE = 'actions';
const CHANGED = 'lse:actions';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'event.operationId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function changed() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Prévient quand la file change (ajout, envoi, effacement). */
export function onActionsChanged(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}

export async function queueAction(action: QueuedAction): Promise<void> {
  await run('readwrite', (store) => store.put(action));
  changed();
}

export async function pendingActions(): Promise<QueuedAction[]> {
  try {
    return await run('readonly', (store) => store.getAll() as IDBRequest<QueuedAction[]>);
  } catch {
    return [];
  }
}

async function removeActions(operationIds: string[]): Promise<void> {
  if (operationIds.length === 0) return;
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const id of operationIds) tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  changed();
}

/** Identifiant et heure d'une nouvelle action, tirés sur l'appareil. */
export function stamp(): { operationId: string; occurredAt: string } {
  return { operationId: crypto.randomUUID(), occurredAt: new Date().toISOString() };
}

export type SyncOutcome =
  { kind: 'done'; sent: number; rejected: string[] } | { kind: 'login' } | { kind: 'offline' };

let running: Promise<SyncOutcome> | null = null;

/**
 * Envoie la file dans l'ordre. Les actions acceptées ou déjà reçues sont retirées ; une action
 * refusée aussi (son message est rendu), car la renvoyer ne changerait rien. Les actions d'une
 * autre personne restent sur l'appareil jusqu'à son retour ou à l'effacement.
 */
export function syncActions(): Promise<SyncOutcome> {
  running ??= (async (): Promise<SyncOutcome> => {
    try {
      const actions = await pendingActions();
      if (actions.length === 0) return { kind: 'done', sent: 0, rejected: [] };
      let response: Response;
      try {
        response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ actions }),
        });
      } catch {
        return { kind: 'offline' };
      }
      if (response.status === 401) return { kind: 'login' };
      if (!response.ok) return { kind: 'offline' };
      const { results } = (await response.json()) as { results: LearningEventResult[] };
      await removeActions(results.map((r) => r.operationId));
      return {
        kind: 'done',
        sent: results.filter((r) => r.status !== 'rejected').length,
        rejected: results.flatMap((r) => (r.status === 'rejected' ? [r.message ?? ''] : [])),
      };
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Bouton « Effacer mes données sur cet appareil » : file d'actions et pages gardées. */
export async function clearDeviceData(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('lenseignement-')).map((key) => caches.delete(key)),
    );
  }
  changed();
}
