import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogCoursesController } from './catalog/catalog-courses.controller.js';
import { ClassSessionsController } from './sessions/class-sessions.controller.js';
import { CohortAdminController } from './cohorts/cohort-admin.controller.js';
import { CohortsController } from './cohorts/cohorts.controller.js';
import { AuthoringController } from './courses/authoring.controller.js';
import { CurriculaController } from './curricula/curricula.controller.js';
import { DatabaseModule } from './db/database.module.js';
import { FamilyController } from './family/family.controller.js';
import { PromotionController } from './promotion/promotion.controller.js';
import { OutboxRelayService } from './events/outbox-relay.service.js';
import { HelpController } from './help/help.controller.js';
import { HealthController } from './health/health.controller.js';
import { LearnersController } from './learners/learners.controller.js';
import { LearningController } from './learning/learning.controller.js';
import { MeController } from './me/me.controller.js';
import { RemediationController } from './remediation/remediation.controller.js';
import { SimulationController } from './simulation/simulation.controller.js';
import { OrganizationsController } from './team/organizations.controller.js';
import { TeamController } from './team/team.controller.js';
import { StatsController } from './stats/stats.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [
    HealthController,
    CatalogController,
    CatalogCoursesController,
    CurriculaController,
    MeController,
    CohortsController,
    CohortAdminController,
    ClassSessionsController,
    LearnersController,
    AuthoringController,
    LearningController,
    RemediationController,
    SimulationController,
    StatsController,
    FamilyController,
    PromotionController,
    TeamController,
    OrganizationsController,
    HelpController,
  ],
  providers: [OutboxRelayService],
})
export class AppModule {}
