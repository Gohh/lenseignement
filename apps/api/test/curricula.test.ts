import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { CurriculumFile } from '@lenseignement/types';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { importCurriculumVersion, publishCurriculumVersion } from '../src/curricula/curricula.js';
import { competencies, curricula, curriculumVersions, levels } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

const api = (path: string, status: number) =>
  request(ctx.app.getHttpServer()).get(`/api/v1/catalog/curricula${path}`).expect(status);

/** Rejet par la base : message des déclencheurs d'immuabilité (ADR-004). */
const immutable = (error: unknown) =>
  /curriculum_version_immutable/.test(
    String((error as { cause?: Error }).cause?.message ?? (error as Error).message),
  );

async function versionId(code: string, label: string): Promise<string> {
  const [row] = await ctx.db
    .select({ id: curriculumVersions.id })
    .from(curriculumVersions)
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .where(and(eq(curricula.code, code), eq(curriculumVersions.label, label)));
  return row!.id;
}

test('la liste publique donne la version en vigueur, marquée non officielle', async () => {
  const res = await api('?branch=primaire&date=2026-10-27', 200);
  assert.equal(res.body.items.length, 1);
  const [primaire] = res.body.items;
  assert.equal(primaire.code, 'DEMO-PRIMAIRE');
  assert.equal(primaire.current.label, '2026');
  assert.equal(primaire.current.source.isOfficial, false);
  assert.equal(primaire.current.effectiveTo, null);
});

test('la version servie dépend de la date demandée', async () => {
  const before2026 = await api('/DEMO-PRIMAIRE?date=2026-03-01', 200);
  assert.equal(before2026.body.version.label, '2025');
  assert.equal(before2026.body.competencies.length, 5);
  assert.equal(
    before2026.body.competencies.find((c: { code: string }) => c.code === 'CALC-01').title,
    "Compter jusqu'à 20",
  );

  const from2026 = await api('/DEMO-PRIMAIRE?date=2026-09-01', 200);
  assert.equal(from2026.body.version.label, '2026');
  assert.equal(from2026.body.competencies.length, 7);
  const calc3 = from2026.body.competencies.find((c: { code: string }) => c.code === 'CALC-03');
  assert.deepEqual(calc3, {
    code: 'CALC-03',
    title: 'Résoudre un petit problème du marché',
    description: null,
    subject: 'CALC',
    level: 'CP2',
    prerequisites: ['CALC-02', 'LECT-03'],
  });
  assert.deepEqual(
    from2026.body.levels.map((l: { code: string }) => l.code),
    ['CP1', 'CP2'],
  );
});

test('historique des versions publiées, la plus récente d’abord', async () => {
  const res = await api('/DEMO-PRIMAIRE/versions', 200);
  assert.deepEqual(
    res.body.items.map(
      (v: { label: string; effectiveFrom: string; effectiveTo: string | null }) => [
        v.label,
        v.effectiveFrom,
        v.effectiveTo,
      ],
    ),
    [
      ['2026', '2026-09-01', null],
      ['2025', '2025-09-01', '2026-09-01'],
    ],
  );
});

test('erreurs : date invalide, branche inconnue, aucune version à la date, programme inconnu', async () => {
  await api('/DEMO-PRIMAIRE?date=2026-13-45', 400);
  await api('?branch=inconnue', 400);
  await api('/DEMO-PRIMAIRE?date=2020-01-01', 404);
  await api('/INCONNU', 404);
  await api('/INCONNU/versions', 404);
});

test('la base refuse toute modification d’une version publiée', async () => {
  const v2025 = await versionId('DEMO-PRIMAIRE', '2025');
  await assert.rejects(
    ctx.db.update(competencies).set({ title: 'modifié' }).where(eq(competencies.versionId, v2025)),
    immutable,
  );
  await assert.rejects(
    ctx.db.insert(levels).values({ versionId: v2025, code: 'CE1', title: 'CE1', position: 9 }),
    immutable,
  );
  await assert.rejects(
    ctx.db.delete(competencies).where(eq(competencies.versionId, v2025)),
    immutable,
  );
  await assert.rejects(
    ctx.db
      .update(curriculumVersions)
      .set({ label: '2025-bis' })
      .where(eq(curriculumVersions.id, v2025)),
    immutable,
  );
  // Date de fin déjà posée : elle ne peut plus changer.
  await assert.rejects(
    ctx.db
      .update(curriculumVersions)
      .set({ effectiveTo: '2030-01-01' })
      .where(eq(curriculumVersions.id, v2025)),
    immutable,
  );
  await assert.rejects(
    ctx.db.delete(curriculumVersions).where(eq(curriculumVersions.id, v2025)),
    immutable,
  );
});

const draft2027: CurriculumFile = {
  curriculum: {
    code: 'DEMO-PRIMAIRE',
    branch: 'primaire',
    title: 'Lecture et calcul au CP (démonstration)',
    description: 'Programme FICTIF.',
  },
  version: {
    label: '2027',
    source: { title: 'Note fictive n° 3', issuer: 'Équipe projet', isOfficial: false },
  },
  levels: [{ code: 'CP1', title: 'CP1' }],
  subjects: [{ code: 'LECT', title: 'Lecture' }],
  competencies: [
    { code: 'LECT-01', title: 'Reconnaître les lettres', subject: 'LECT', prerequisites: [] },
  ],
};

test('cycle de vie : brouillon invisible et modifiable, puis publication datée', async () => {
  await importCurriculumVersion(ctx.db, draft2027);
  await assert.rejects(importCurriculumVersion(ctx.db, draft2027), /existe déjà/);

  // Un brouillon n'est jamais servi, même à une date future.
  assert.equal((await api('/DEMO-PRIMAIRE?date=2028-01-01', 200)).body.version.label, '2026');
  // Il reste modifiable tant qu'il n'est pas publié.
  const v2027 = await versionId('DEMO-PRIMAIRE', '2027');
  await ctx.db
    .update(competencies)
    .set({ title: 'Reconnaître toutes les lettres' })
    .where(eq(competencies.versionId, v2027));

  // Pas de version insérée avant la dernière publiée.
  await assert.rejects(
    publishCurriculumVersion(ctx.db, 'DEMO-PRIMAIRE', '2027', '2026-09-01'),
    /postérieure au 2026-09-01/,
  );
  await assert.rejects(
    publishCurriculumVersion(ctx.db, 'DEMO-PRIMAIRE', '2027', '2027-02-30'),
    /invalide/,
  );

  await publishCurriculumVersion(ctx.db, 'DEMO-PRIMAIRE', '2027', '2027-09-01');
  await assert.rejects(
    publishCurriculumVersion(ctx.db, 'DEMO-PRIMAIRE', '2027', '2028-09-01'),
    /déjà publiée/,
  );

  assert.equal((await api('/DEMO-PRIMAIRE?date=2027-08-31', 200)).body.version.label, '2026');
  const v = await api('/DEMO-PRIMAIRE?date=2027-09-01', 200);
  assert.equal(v.body.version.label, '2027');
  assert.equal(v.body.competencies[0].title, 'Reconnaître toutes les lettres');

  const history = (await api('/DEMO-PRIMAIRE/versions', 200)).body.items;
  assert.deepEqual(history[1], { ...history[1], label: '2026', effectiveTo: '2027-09-01' });

  // Et désormais figée.
  await assert.rejects(
    ctx.db.update(competencies).set({ title: 'x' }).where(eq(competencies.versionId, v2027)),
    immutable,
  );
});

test('le jeu de démonstration se relance sans doublon', async () => {
  const { seedDemo } = await import('../src/db/seed.js');
  await seedDemo(ctx.db);
  const [{ count }] = (
    await ctx.db.execute<{ count: number }>(
      sql`select count(*)::int as count from curriculum_versions`,
    )
  ).rows as [{ count: number }];
  assert.equal(count, 5); // 4 versions de démonstration + le 2027 de ce fichier
});
