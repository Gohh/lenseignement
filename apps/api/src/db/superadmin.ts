import { and, eq } from 'drizzle-orm';
import type { Database } from './database.js';
import { memberships, organizations, users } from './schema.js';

const PLATFORM_NAME = 'Plateforme';

/**
 * Premier compte de la plateforme : donne le rôle de superadministrateur à la personne dont
 * l'identifiant Keycloak est fourni (son compte applicatif est créé si besoin). La structure
 * « Plateforme » est créée à la première utilisation. Idempotent.
 */
export async function createSuperadmin(db: Database, oidcSubject: string): Promise<void> {
  await db.transaction(async (tx) => {
    let [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.name, PLATFORM_NAME), eq(organizations.type, 'authority')))
      .limit(1);
    if (!org) {
      [org] = await tx
        .insert(organizations)
        .values({ name: PLATFORM_NAME, type: 'authority' })
        .returning({ id: organizations.id });
    }
    const [user] = await tx
      .insert(users)
      .values({ oidcSubject, accountType: 'staff' })
      .onConflictDoUpdate({ target: users.oidcSubject, set: { accountType: 'staff' } })
      .returning({ id: users.id });
    await tx
      .insert(memberships)
      .values({ userId: user!.id, organizationId: org!.id, role: 'superadministrateur' })
      // Rend le rôle s'il avait été retiré (fin de validité) : la commande répare l'accès.
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.organizationId, memberships.role],
        set: { validUntil: null },
      });
  });
}
