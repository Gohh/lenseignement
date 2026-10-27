import { Module } from '@nestjs/common';
import { CatalogController } from './catalog/catalog.controller.js';
import { HealthController } from './health/health.controller.js';

@Module({
  controllers: [HealthController, CatalogController],
})
export class AppModule {}
