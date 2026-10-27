import { LearningEventSchema, type LearningEventResult } from '@lenseignement/types';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiSend } from '@/lib/api';
import { ownerOf } from '@/lib/device-owner';
import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  actions: z
    .array(z.object({ owner: z.string().max(64), event: LearningEventSchema }))
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
  const events = parsed.data.actions.filter((a) => a.owner === owner).map((a) => a.event);
  const results: LearningEventResult[] = [];
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
