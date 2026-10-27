import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Database, Executor } from '../db/database.js';
import { outboxEvents, type OutboxEventType } from '../db/schema.js';

export type OutboxEvent = typeof outboxEvents.$inferSelect;

/**
 * Écrit un évènement métier dans l'outbox. À appeler dans la transaction du changement : les deux
 * sont enregistrés ensemble, ou pas du tout (ADR-011). Contenu : identifiants seulement.
 */
export async function emit(
  tx: Executor,
  eventType: OutboxEventType,
  payload: Record<string, string | number>,
): Promise<void> {
  await tx.insert(outboxEvents).values({ eventType, payload });
}

/**
 * Destinataire d'un évènement. Livraison « au moins une fois » : un destinataire peut recevoir
 * deux fois le même évènement (panne entre la livraison et son enregistrement) et doit s'appuyer
 * sur `event.id` pour ne pas le traiter deux fois.
 */
export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

/** Délai avant la tentative suivante : 2 s, 4 s, 8 s… jusqu'à une heure. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(2 ** attempts, 3600);
}

export interface DrainResult {
  published: number;
  failed: number;
}

/**
 * Délivre un lot d'évènements en attente, dans l'ordre d'écriture. `for update skip locked` :
 * plusieurs travailleurs peuvent tourner en même temps sans jamais prendre le même évènement.
 */
export async function drainOutbox(
  db: Database,
  handler: OutboxHandler,
  limit = 50,
): Promise<DrainResult> {
  return db.transaction(async (tx) => {
    const batch = await tx
      .select()
      .from(outboxEvents)
      .where(and(isNull(outboxEvents.publishedAt), lte(outboxEvents.availableAt, sql`now()`)))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    const result: DrainResult = { published: 0, failed: 0 };
    for (const event of batch) {
      try {
        await handler(event);
        await tx
          .update(outboxEvents)
          .set({ publishedAt: sql`now()`, attempts: event.attempts + 1, lastError: null })
          .where(eq(outboxEvents.id, event.id));
        result.published += 1;
      } catch (error) {
        const attempts = event.attempts + 1;
        await tx
          .update(outboxEvents)
          .set({
            attempts,
            // Message technique tronqué : jamais de contenu personnel dans l'outbox.
            lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
            availableAt: sql`now() + make_interval(secs => ${retryDelaySeconds(attempts)})`,
          })
          .where(eq(outboxEvents.id, event.id));
        result.failed += 1;
      }
    }
    return result;
  });
}
