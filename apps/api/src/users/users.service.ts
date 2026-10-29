import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Principal } from '../auth/principal.js';
import { DATABASE, type Database } from '../db/database.js';
import { users } from '../db/schema.js';

export interface CurrentUser {
  id: string;
  subject: string;
  displayName: string | null;
  accountType: string;
  level: string | null;
}

/** Fait le lien entre l'identité OIDC (`sub`) et le compte applicatif. */
@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Retrouve le compte de la personne connectée, ou le crée à sa première visite (sans aucun
   * droit : les rattachements sont attribués à part). Un compte suspendu est refusé.
   */
  async resolve(principal: Principal): Promise<CurrentUser> {
    const [row] = await this.db
      .insert(users)
      .values({ oidcSubject: principal.subject, lastSeenAt: sql`now()` })
      .onConflictDoUpdate({ target: users.oidcSubject, set: { lastSeenAt: sql`now()` } })
      .returning({
        id: users.id,
        displayName: users.displayName,
        accountType: users.accountType,
        level: users.level,
        status: users.status,
      });
    if (!row || row.status !== 'active') {
      throw new ForbiddenException('Accès refusé.');
    }
    return {
      id: row.id,
      subject: principal.subject,
      displayName: row.displayName,
      accountType: row.accountType,
      level: row.level,
    };
  }
}
