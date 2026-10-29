import type {
  ChatMessage,
  ConversationItem,
  ConversationView,
  MessageContact,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../db/database.js';
import {
  cohortMembers,
  guardianLinks,
  parentConversations,
  parentMessages,
  users,
} from '../db/schema.js';
import { TeamError } from '../team/team.js';

const name = (value: string | null) => value ?? 'Utilisateur';

/** Paires (enfant, enseignant, parent) entre lesquelles un échange est permis. */
async function allowedTrios(db: Database, userId: string) {
  const learnerMember = alias(cohortMembers, 'learner_member');
  // Je suis parent : les enseignants des classes de mes enfants.
  const asParent = await db
    .selectDistinct({
      learnerId: guardianLinks.learnerUserId,
      teacherId: cohortMembers.userId,
    })
    .from(guardianLinks)
    .innerJoin(
      learnerMember,
      and(
        eq(learnerMember.userId, guardianLinks.learnerUserId),
        eq(learnerMember.role, 'apprenant'),
      ),
    )
    .innerJoin(
      cohortMembers,
      and(eq(cohortMembers.cohortId, learnerMember.cohortId), eq(cohortMembers.role, 'enseignant')),
    )
    .where(and(eq(guardianLinks.guardianUserId, userId), eq(guardianLinks.status, 'verified')));
  // Je suis enseignant : les parents vérifiés des élèves de mes classes.
  const asTeacher = await db
    .selectDistinct({
      learnerId: guardianLinks.learnerUserId,
      parentId: guardianLinks.guardianUserId,
    })
    .from(cohortMembers)
    .innerJoin(
      learnerMember,
      and(eq(learnerMember.cohortId, cohortMembers.cohortId), eq(learnerMember.role, 'apprenant')),
    )
    .innerJoin(
      guardianLinks,
      and(
        eq(guardianLinks.learnerUserId, learnerMember.userId),
        eq(guardianLinks.status, 'verified'),
      ),
    )
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.role, 'enseignant')));
  return [
    ...asParent.map((r) => ({ learnerId: r.learnerId, parentId: userId, teacherId: r.teacherId })),
    ...asTeacher.map((r) => ({ learnerId: r.learnerId, parentId: r.parentId, teacherId: userId })),
  ].filter((t) => t.parentId !== t.teacherId);
}

async function names(db: Database, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, name(r.name)]));
}

/** Personnes à qui la personne connectée peut écrire. */
export async function contacts(db: Database, userId: string): Promise<MessageContact[]> {
  const trios = await allowedTrios(db, userId);
  const label = await names(db, [
    ...new Set(trios.flatMap((t) => [t.learnerId, t.parentId, t.teacherId])),
  ]);
  return trios
    .map((t) => {
      const asParent = t.parentId === userId;
      const otherUserId = asParent ? t.teacherId : t.parentId;
      return {
        learnerId: t.learnerId,
        learnerName: label.get(t.learnerId) ?? 'Élève',
        otherUserId,
        otherName: label.get(otherUserId) ?? 'Utilisateur',
        otherRole: asParent ? ('enseignant' as const) : ('parent' as const),
      };
    })
    .sort((a, b) => a.otherName.localeCompare(b.otherName, 'fr'));
}

export async function startConversation(
  db: Database,
  userId: string,
  input: { learnerId: string; otherUserId: string; body: string },
): Promise<{ id: string }> {
  const trio = (await allowedTrios(db, userId)).find(
    (t) =>
      t.learnerId === input.learnerId &&
      (t.parentId === input.otherUserId || t.teacherId === input.otherUserId),
  );
  if (!trio) throw new TeamError('not_found', 'Vous ne pouvez pas écrire à cette personne.');
  const [existing] = await db
    .select({ id: parentConversations.id })
    .from(parentConversations)
    .where(
      and(
        eq(parentConversations.parentUserId, trio.parentId),
        eq(parentConversations.teacherUserId, trio.teacherId),
        eq(parentConversations.learnerUserId, trio.learnerId),
      ),
    );
  let id = existing?.id;
  if (!id) {
    const [row] = await db
      .insert(parentConversations)
      .values({
        parentUserId: trio.parentId,
        teacherUserId: trio.teacherId,
        learnerUserId: trio.learnerId,
      })
      .returning({ id: parentConversations.id });
    id = row!.id;
  }
  await db
    .insert(parentMessages)
    .values({ conversationId: id, senderUserId: userId, body: input.body });
  return { id };
}

async function myConversation(db: Database, userId: string, conversationId: string) {
  const [c] = await db
    .select()
    .from(parentConversations)
    .where(
      and(
        eq(parentConversations.id, conversationId),
        or(
          eq(parentConversations.parentUserId, userId),
          eq(parentConversations.teacherUserId, userId),
        ),
      ),
    );
  if (!c) throw new TeamError('not_found', 'Conversation introuvable.');
  return c;
}

export async function sendMessage(
  db: Database,
  userId: string,
  conversationId: string,
  body: string,
): Promise<void> {
  await myConversation(db, userId, conversationId);
  await db.insert(parentMessages).values({ conversationId, senderUserId: userId, body });
}

export async function myConversations(db: Database, userId: string): Promise<ConversationItem[]> {
  const rows = await db
    .select()
    .from(parentConversations)
    .where(
      or(
        eq(parentConversations.parentUserId, userId),
        eq(parentConversations.teacherUserId, userId),
      ),
    );
  if (rows.length === 0) return [];
  const label = await names(db, [
    ...new Set(rows.flatMap((c) => [c.learnerUserId, c.parentUserId, c.teacherUserId])),
  ]);
  const messages = await db
    .select()
    .from(parentMessages)
    .where(
      inArray(
        parentMessages.conversationId,
        rows.map((c) => c.id),
      ),
    )
    .orderBy(desc(parentMessages.createdAt));
  const items: ConversationItem[] = rows.map((c) => {
    const mine = messages.filter((m) => m.conversationId === c.id);
    const asParent = c.parentUserId === userId;
    const otherId = asParent ? c.teacherUserId : c.parentUserId;
    return {
      id: c.id,
      learnerName: label.get(c.learnerUserId) ?? 'Élève',
      otherName: label.get(otherId) ?? 'Utilisateur',
      otherRole: asParent ? 'enseignant' : 'parent',
      lastMessage: mine[0]?.body ?? '',
      lastAt: (mine[0]?.createdAt ?? c.createdAt).toISOString(),
      unread: mine.filter((m) => m.senderUserId !== userId && m.readAt === null).length,
    };
  });
  return items.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Ouvre la conversation et marque comme lus les messages de l'autre personne. */
export async function openConversation(
  db: Database,
  userId: string,
  conversationId: string,
): Promise<ConversationView> {
  const c = await myConversation(db, userId, conversationId);
  await db
    .update(parentMessages)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(parentMessages.conversationId, conversationId),
        ne(parentMessages.senderUserId, userId),
        isNull(parentMessages.readAt),
      ),
    );
  const label = await names(db, [c.learnerUserId, c.parentUserId, c.teacherUserId]);
  const asParent = c.parentUserId === userId;
  const otherId = asParent ? c.teacherUserId : c.parentUserId;
  const messages = await db
    .select()
    .from(parentMessages)
    .where(eq(parentMessages.conversationId, conversationId))
    .orderBy(asc(parentMessages.createdAt));
  return {
    conversation: {
      id: c.id,
      learnerName: label.get(c.learnerUserId) ?? 'Élève',
      otherName: label.get(otherId) ?? 'Utilisateur',
      otherRole: asParent ? 'enseignant' : 'parent',
    },
    messages: messages.map((m): ChatMessage => ({
      id: m.id,
      body: m.body,
      sentAt: m.createdAt.toISOString(),
      mine: m.senderUserId === userId,
      senderName: label.get(m.senderUserId) ?? 'Utilisateur',
    })),
  };
}

/** Messages reçus pas encore lus, pour la cloche. */
export async function unreadMessages(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(parentMessages)
    .innerJoin(parentConversations, eq(parentConversations.id, parentMessages.conversationId))
    .where(
      and(
        isNull(parentMessages.readAt),
        ne(parentMessages.senderUserId, userId),
        or(
          eq(parentConversations.parentUserId, userId),
          eq(parentConversations.teacherUserId, userId),
        ),
      ),
    );
  return row?.n ?? 0;
}
