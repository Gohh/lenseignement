import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { ApiErrorFilter } from './api-error.filter.js';
import type { AppConfig } from './config.js';

/** Configuration partagée par le serveur et les tests (préfixe, en-têtes de sécurité, CORS strict). */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: [config.WEB_ORIGIN], credentials: true });
  app.useGlobalFilters(new ApiErrorFilter());
}
