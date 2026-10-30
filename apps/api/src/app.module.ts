import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { CatalogCoursesController } from './catalog/catalog-courses.controller.js';
import { ClassSessionsController } from './sessions/class-sessions.controller.js';
import { AssignmentsController } from './assignments/assignments.controller.js';
import { EvaluationsController } from './evaluations/evaluations.controller.js';
import { MessagesController } from './messages/messages.controller.js';
import { LibraryController } from './library/library.controller.js';
import { CohortAdminController } from './cohorts/cohort-admin.controller.js';
import { CohortsController } from './cohorts/cohorts.controller.js';
import { AuthoringController } from './courses/authoring.controller.js';
import { AccountsController } from './accounts/accounts.controller.js';
import { ConsultController } from './consult/consult.controller.js';
import { CurriculaController } from './curricula/curricula.controller.js';
import { CurriculaAdminController } from './curricula/curricula-admin.controller.js';
import { DirectionController } from './direction/direction.controller.js';
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
import { IDENTITY_ADMIN, KeycloakAdmin } from './team/identity-admin.js';
import { loadConfig } from './config.js';
import { TeamController } from './team/team.controller.js';
import { StatsController } from './stats/stats.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [
    HealthController,
    CatalogController,
    CatalogCoursesController,
    CurriculaController,
    CurriculaAdminController,
    MeController,
    CohortsController,
    CohortAdminController,
    ClassSessionsController,
    AssignmentsController,
    LibraryController,
    MessagesController,
    EvaluationsController,
    LearnersController,
    AuthoringController,
    LearningController,
    RemediationController,
    SimulationController,
    StatsController,
    DirectionController,
    FamilyController,
    PromotionController,
    TeamController,
    OrganizationsController,
    AccountsController,
    ConsultController,
    HelpController,
  ],
  providers: [
    OutboxRelayService,
    {
      provide: IDENTITY_ADMIN,
      useFactory: () => {
        const config = loadConfig();
        return new KeycloakAdmin({
          issuerUrl: config.OIDC_ISSUER_URL,
          clientId: config.KEYCLOAK_ADMIN_CLIENT_ID,
          clientSecret: config.KEYCLOAK_ADMIN_CLIENT_SECRET,
        });
      },
    },
  ],
})
export class AppModule {}
