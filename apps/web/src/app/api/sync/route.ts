import {
  AssignmentAnswersEventSchema,
  LearningEventSchema,
  WorkshopAttemptEventSchema,
  type AssignmentAnswersEvent,
  type LearningEventInput,
  type LearningEventResult,
  type WorkshopAttemptEvent,
} from '@lenseignement/types';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSend } from '@/lib/api';
import { ownerOf } from '@/lib/device-owner';
import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  actions: z
    .array(
      z.object({
        owner: z.string().max(64),
        event: z.union([
          LearningEventSchema,
          WorkshopAttemptEventSchema,
          AssignmentAnswersEventSchema,
        ]),
      }),
    )
    .min(1)
    .max(200),
});

/** Taille des lots acceptée par l'API (ADR-011). */
const BATCH = 50;

/**
 * Synchronisation des actions faites hors ligne (ADR-012). Le jeton reste côté serveur ; seules
 * les actions de la personne connectée partent, dans l'ordre, vers `POST /learning-events`.
 * Les autres restent sur l'appareil (absentes des résultats).
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(serverEnv().APP_URL).origin) {
    return NextResponse.json({ message: 'Origine refusée.' }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { message: 'Connectez-vous pour envoyer vos progrès.' },
      { status: 401 },
    );
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Actions illisibles.' }, { status: 400 });
  }

  const owner = ownerOf(session.subject);
  const mine = parsed.data.actions.filter((a) => a.owner === owner).map((a) => a.event);
  const events = mine.filter(
    (e): e is LearningEventInput =>
      e.type !== 'workshop_attempt' && e.type !== 'assignment_answers',
  );
  const homework = mine.filter((e): e is AssignmentAnswersEvent => e.type === 'assignment_answers');
  const attempts = mine.filter((e): e is WorkshopAttemptEvent => e.type === 'workshop_attempt');
  const results: LearningEventResult[] = [];
  // Essais d'atelier : corrigés par l'API ; l'identifiant d'opération sert d'identifiant d'essai,
  // un renvoi n'est donc jamais compté deux fois.
  for (const attempt of attempts) {
    const sent = await apiSend(
      session.accessToken,
      'POST',
      `/me/simulations/${encodeURIComponent(attempt.code)}/attempts`,
      { attemptId: attempt.operationId, steps: attempt.steps },
    );
    if (sent.ok) results.push({ operationId: attempt.operationId, status: 'applied' });
    else if (sent.status && sent.status >= 400 && sent.status < 500 && sent.status !== 401) {
      results.push({
        operationId: attempt.operationId,
        status: 'rejected',
        message: `Atelier : ${sent.message ?? 'essai refusé.'}`,
      });
    } else break;
  }
  // Devoirs faits sans connexion : corrigés par l'API, l'identifiant d'opération sert d'identifiant
  // d'envoi (un renvoi rend la même copie).
  for (const work of homework) {
    const sent = await apiSend(
      session.accessToken,
      'POST',
      `/assignments/${work.assignmentId}/answers`,
      { attemptId: work.operationId, answers: work.answers },
    );
    if (sent.ok) results.push({ operationId: work.operationId, status: 'applied' });
    else if (sent.status && sent.status >= 400 && sent.status < 500 && sent.status !== 401) {
      results.push({
        operationId: work.operationId,
        status: 'rejected',
        message: `Devoir : ${sent.message ?? 'réponses refusées.'}`,
      });
    } else break;
  }
  for (let i = 0; i < events.length; i += BATCH) {
    const sent = await apiSend<{ results: LearningEventResult[] }>(
      session.accessToken,
      'POST',
      '/learning-events',
      { events: events.slice(i, i + BATCH) },
    );
    // Échec (réseau, service) : ce qui est déjà accepté est rendu, le reste sera renvoyé.
    if (!sent.ok) break;
    results.push(...sent.data.results);
  }
  return NextResponse.json({ results }, { headers: { 'cache-control': 'no-store' } });
}
