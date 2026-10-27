import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CohortsController } from './cohorts/cohorts.controller.js';
import { CurriculaController } from './curricula/curricula.controller.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { LearnersController } from './learners/learners.controller.js';
import { MeController } from './me/me.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [
    HealthController,
    CatalogController,
    CurriculaController,
    MeController,
    CohortsController,
    LearnersController,
  ],
})
export class AppModule {}
