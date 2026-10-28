import { createHash } from 'node:crypto';

/**
 * Empreinte de la personne connectée, posée sur chaque action gardée hors ligne (ADR-012) :
 * sur un appareil partagé, l'action d'une personne n'est jamais envoyée au nom d'une autre.
 */
export function ownerOf(subject: string): string {
  return createHash('sha256')
    .update(`lenseignement-appareil:${subject}`)
    .digest('hex')
    .slice(0, 32);
}
