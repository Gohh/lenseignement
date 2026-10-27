import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { HealthController } from './health/health.controller.js';
import { MeController } from './me/me.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, CatalogController, MeController],
})
export class AppModule {}
