'use client';

import Link from 'next/link';
import { useState } from 'react';
import { completeLessonAction } from '@/app/catalogue/actions';
import { queueAction, stamp } from '@/lib/offline-queue';
import { buttonClass } from './Notice';

interface Props {
  courseId: string;
  lessonNumber: number;
  /** Empreinte de la personne connectée (ADR-012). */
  owner: string;
  nextHref: string;
}

/**
 * « J'ai terminé cette leçon ». Avec réseau : enregistrement direct, puis leçon suivante. Sans
 * réseau : l'action est gardée sur l'appareil et envoyée au retour d'internet (ADR-012).
 */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    String((error as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')
  );
}

export function CompleteLessonForm({ courseId, lessonNumber, owner, nextHref }: Props) {
  const [queued, setQueued] = useState(false);

  async function keep() {
    await queueAction({
      owner,
      event: { ...stamp(), type: 'lesson_completed', courseId, lessonNumber },
    });
    setQueued(true);
  }

  async function complete(form: FormData) {
    if (!navigator.onLine) return keep();
    try {
      await completeLessonAction(form);
    } catch (error) {
      // Redirection vers la leçon suivante : elle est gérée par Next.
      if (isRedirect(error)) throw error;
      // Site injoignable malgré un réseau annoncé : l'action est gardée.
      await keep();
    }
  }

  if (queued) {
    return (
      <div className="space-y-2 rounded-big border-2 border-primary bg-primary-soft p-4">
        <p className="font-bold" data-testid="lesson-status">
          ✓ Leçon terminée sur cet appareil, en attente de synchronisation.
        </p>
        <Link href={nextHref} className={buttonClass}>
          Continuer
        </Link>
      </div>
    );
  }
  return (
    <form action={complete}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="lessonNumber" value={lessonNumber} />
      <button type="submit" className={`${buttonClass} min-h-[56px] px-7 text-xl font-display`}>
        J’ai terminé cette leçon
      </button>
    </form>
  );
}
