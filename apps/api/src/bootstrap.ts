import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ApiErrorFilter } from './api-error.filter.js';
import type { AppConfig } from './config.js';
import { traceId } from './trace-id.js';

/** Configuration partagée par le serveur et les tests (préfixe, en-têtes de sécurité, CORS strict). */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api/v1');
  app.use(traceId);
  app.use(helmet());
  // Pièces jointes des questions d'aide (photo, message vocal) : octets bruts, poids limité.
  (app as NestExpressApplication).useBodyParser('raw', {
    type: ['image/*', 'audio/*'],
    limit: '4mb',
  });
  app.enableCors({ origin: [config.WEB_ORIGIN], credentials: true });
  app.useGlobalFilters(new ApiErrorFilter());
}
