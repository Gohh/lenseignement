import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const ACCEPTED = /^[A-Za-z0-9._-]{8,64}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

/**
 * Identifiant de corrélation : reprend `x-request-id` s'il est sûr, sinon en génère un.
 * Il est renvoyé au client et repris dans les erreurs et le journal d'audit.
 */
export function traceId(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  request.traceId = incoming && ACCEPTED.test(incoming) ? incoming : randomUUID();
  response.setHeader('x-request-id', request.traceId);
  next();
}
