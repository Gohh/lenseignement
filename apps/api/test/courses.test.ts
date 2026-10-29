import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { auditLogs, courseVersions, lessons } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1/authoring${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const V1 = ID.courseSyllabesV1;

test('les structures de rédaction suivent les rattachements', async () => {
  const names = async (subject: string) =>
    (await call(subject, 'get', '/organizations', 200)).body.items.map((o: { id: string }) => o.id);
  assert.deepEqual(await names(SUB.koffi), [ID.orgManguiers]);
  assert.deepEqual(
    (await names(SUB.mariam)).sort(),
    [ID.orgRegion, ID.orgManguiers, ID.orgBaobabs].sort(),
  );
  assert.deepEqual(await names(SUB.awa), []);
  assert.deepEqual(await names(SUB.fatou), []);
  assert.deepEqual(await names(SUB.yao), []);
});

test('l’enseignant voit le cours de son école ; l’élève et le parent ne voient rien', async () => {
  const list = await call(SUB.koffi, 'get', '/courses', 200);
  assert.deepEqual(
    list.body.items
      .map((c: { latest: { title: string; status: string } }) => [c.latest.title, c.latest.status])
      .sort(),
    [
      ['Additionner jusqu’à 10 (démonstration)', 'published'],
      ['Compter au marché (démonstration)', 'in_review'],
      ['Des lettres aux syllabes (démonstration)', 'published'],
      ['Les nombres jusqu’à 50 (démonstration)', 'published'],
      ['Lire des mots courts (démonstration)', 'published'],
      ['Lire ses premières syllabes (démonstration)', 'draft'],
      ['Marché-école : l’argent du marché (démonstration)', 'published'],
    ],
  );
  for (const subject of [SUB.awa, SUB.fatou, SUB.yao]) {
    assert.deepEqual((await call(subject, 'get', '/courses', 200)).body.items, []);
  }
});

test('détail d’un brouillon avec programme, compétences, modules et leçons', async () => {
  const res = await call(SUB.koffi, 'get', `/course-versions/${V1}`, 200);
  assert.equal(res.body.number, 1);
  assert.deepEqual(res.body.curriculum, {
    code: 'DEMO-PRIMAIRE',
    label: '2026',
    competencies: [
      { code: 'LECT-01', title: "Reconnaître les lettres de l'alphabet" },
      { code: 'LECT-02', title: 'Lire des syllabes simples' },
    ],
  });
  assert.equal(res.body.modules[0].lessons.length, 2);
});

test('accès refusé (403 uniforme) hors de sa structure, et journalisé', async () => {
  for (const subject of [SUB.awa, SUB.fatou, SUB.yao]) {
    await call(subject, 'get', `/course-versions/${V1}`, 403);
    await call(subject, 'patch', `/course-versions/${V1}`, 403, { revision: 1, title: 'Piraté' });
  }
  const unknown = await call(
    SUB.koffi,
    'get',
    '/course-versions/60000000-0000-4000-8000-0000000000ff',
    403,
  );
  const invalid = await call(SUB.koffi, 'get', '/courses/pas-un-id', 403);
  assert.equal(unknown.body.message, 'Accès refusé.');
  assert.equal(invalid.body.message, 'Accès refusé.');
  // Personne d'une autre école ne peut créer de cours pour Les Manguiers.
  await call(SUB.awa, 'post', '/courses', 403, {
    organizationId: ID.orgManguiers,
    branch: 'primaire',
    title: 'Cours pirate',
  });

  const denied = await ctx.db
    .select()
    .from(auditLogs)
    .where(sql`${auditLogs.resourceId} = ${V1} and ${auditLogs.decision} = 'deny'`);
  assert.ok(denied.length >= 6);
});

test('création d’un cours : brouillon n° 1 dans l’école de l’auteur', async () => {
  const created = await call(SUB.aminata, 'post', '/courses', 201, {
    organizationId: ID.orgManguiers,
    branch: 'primaire',
    title: 'Compter avec les cauris',
    summary: 'Cours fictif.',
  });
  const course = await call(SUB.aminata, 'get', `/courses/${created.body.courseId}`, 200);
  assert.deepEqual(
    course.body.versions.map((v: { number: number; status: string }) => [v.number, v.status]),
    [[1, 'draft']],
  );
  // Validation des données.
  const invalid = await call(SUB.aminata, 'post', '/courses', 400, {
    organizationId: ID.orgManguiers,
    branch: 'inconnue',
    title: 'x',
  });
  assert.match(invalid.body.message, /title|Titre trop court/);
});

test('modification du brouillon : programme exact, compétences, révision', async () => {
  const updated = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 200, {
    revision: 1,
    title: 'Lire ses premières syllabes',
    level: 'cp2',
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2025', competencyCodes: ['LECT-02', 'LECT-03'] },
  });
  assert.equal(updated.body.revision, 2);
  assert.equal(updated.body.level, 'cp2');

  // Le niveau doit appartenir à l'espace du cours, et à la liste connue.
  const wrongLevel = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, {
    revision: 2,
    level: '6e',
  });
  assert.equal(wrongLevel.body.message, 'Ce niveau ne correspond pas à l’espace du cours.');
  await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, { revision: 2, level: 'cp9' });
  assert.equal(updated.body.title, 'Lire ses premières syllabes');
  assert.deepEqual(
    updated.body.curriculum.competencies.map((c: { code: string }) => c.code),
    ['LECT-02', 'LECT-03'],
  );

  // Compétence absente de la version choisie, ou programme non publié.
  const missing = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, {
    revision: 2,
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2025', competencyCodes: ['CALC-03'] },
  });
  assert.match(missing.body.message, /CALC-03/);
  await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 400, {
    revision: 2,
    curriculum: { code: 'DEMO-PRIMAIRE', label: '2099', competencyCodes: [] },
  });

  // Une révision périmée (modification concurrente) est refusée.
  const stale = await call(SUB.aminata, 'patch', `/course-versions/${V1}`, 409, {
    revision: 1,
    title: 'Écrasement',
  });
  assert.match(stale.body.message, /modifié entre-temps/);
});

test('plan du brouillon remplacé d’un bloc', async () => {
  const res = await call(SUB.koffi, 'put', `/course-versions/${V1}/outline`, 200, {
    revision: 2,
    modules: [
      { title: 'Les voyelles', lessons: [{ title: 'Le a et le i', body: 'a… i…' }] },
      { title: 'Les syllabes', lessons: [{ title: 'ma, mi, mo', estimatedMinutes: 15 }] },
    ],
  });
  assert.equal(res.body.revision, 3);
  assert.deepEqual(
    res.body.modules.map((m: { title: string; lessons: unknown[] }) => [m.title, m.lessons.length]),
    [
      ['Les voyelles', 1],
      ['Les syllabes', 1],
    ],
  );
  assert.equal(res.body.modules[1].lessons[0].estimatedMinutes, 15);
});

test('envoi en relecture : refusé tant que le brouillon est incomplet', async () => {
  // La leçon « ma, mi, mo » n'a pas de contenu.
  const incomplete = await call(SUB.koffi, 'post', `/course-versions/${V1}/submit`, 400, {
    revision: 3,
  });
  assert.match(incomplete.body.message, /Chaque leçon doit avoir un contenu/);
  const wf = await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200);
  assert.deepEqual(wf.body.missing, ['Chaque leçon doit avoir un contenu.']);

  await call(SUB.koffi, 'put', `/course-versions/${V1}/outline`, 200, {
    revision: 3,
    modules: [
      { title: 'Les voyelles', lessons: [{ title: 'Le a et le i', body: 'a… i…' }] },
      { title: 'Les syllabes', lessons: [{ title: 'ma, mi, mo', body: 'm et a : ma.' }] },
    ],
  });
  await call(SUB.koffi, 'post', `/course-versions/${V1}/submit`, 409, { revision: 3 });
  // Choix du relecteur : seuls les référents de la structure sont proposés.
  const choices = (await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200)).body;
  assert.deepEqual(
    choices.reviewers.map((r: { id: string }) => r.id),
    [ID.userMariam],
  );
  const notReviewer = await call(SUB.koffi, 'post', `/course-versions/${V1}/submit`, 400, {
    revision: 4,
    reviewerId: ID.userBamba,
  });
  assert.match(notReviewer.body.message, /ne peut pas relire/);
  await call(SUB.koffi, 'post', `/course-versions/${V1}/submit`, 204, {
    revision: 4,
    reviewerId: ID.userMariam,
  });
  const after = await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200);
  assert.deepEqual(after.body.can, {
    submit: false,
    approve: false,
    requestChanges: false,
    publish: false,
    withdraw: false,
  });
  assert.equal(after.body.history[0].action, 'submitted');
});

test('hors brouillon, la version est figée par la base et par l’API', async () => {
  await assert.rejects(
    ctx.db.update(lessons).set({ title: 'modifié' }).where(eq(lessons.courseVersionId, V1)),
    (e: { cause?: Error }) => /course_version_immutable/.test(String(e.cause?.message)),
  );
  for (const change of [{ title: 'modifié' }, { level: 'cm2' }]) {
    await assert.rejects(
      ctx.db.update(courseVersions).set(change).where(eq(courseVersions.id, V1)),
      (e: { cause?: Error }) => /course_version_immutable/.test(String(e.cause?.message)),
    );
  }
  const frozen = await call(SUB.koffi, 'patch', `/course-versions/${V1}`, 409, {
    revision: 4,
    title: 'Trop tard',
  });
  assert.match(frozen.body.message, /n’est plus un brouillon/);
  // Pas de nouvelle version tant qu'une version est en cours de validation.
  const busy = await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 409);
  assert.match(busy.body.message, /en cours de validation/);
});

test('E2E-11 : un rédacteur ne publie pas sans validation (API et base)', async () => {
  const checklist = { pedagogy: true, accessibility: true, rights: true };
  // L'auteur n'a pas le rôle de relecteur ni de publieur.
  await call(SUB.koffi, 'post', `/course-versions/${V1}/approve`, 403, { checklist });
  await call(SUB.koffi, 'post', `/course-versions/${V1}/publish`, 403);
  // Même un accès direct à la base ne permet pas de sauter une étape ou de s'approuver soi-même.
  await assert.rejects(
    ctx.db
      .update(courseVersions)
      .set({ status: 'published', publishedBy: ID.userKoffi, publishedAt: new Date() })
      .where(eq(courseVersions.id, V1)),
    (e: { cause?: Error }) => /course_workflow/.test(String(e.cause?.message)),
  );
  await assert.rejects(
    ctx.db
      .update(courseVersions)
      .set({ status: 'approved', approvedBy: ID.userKoffi })
      .where(eq(courseVersions.id, V1)),
    (e: { cause?: Error }) => /course_workflow/.test(String(e.cause?.message)),
  );
  // Un chef d'établissement n'approuve pas : c'est le rôle du référent pédagogique.
  await call(SUB.bamba, 'post', `/course-versions/${V1}/approve`, 403, { checklist });
});

test('double validation : la référente approuve, une autre personne publie', async () => {
  const queue = await call(SUB.mariam, 'get', '/reviews', 200);
  assert.deepEqual(
    queue.body.items.map((i: { versionId: string }) => i.versionId).sort(),
    [ID.courseMarcheV1, V1].sort(),
  );
  assert.deepEqual((await call(SUB.koffi, 'get', '/reviews', 200)).body.items, []);

  // « Mon travail » : la référente voit le cours à relire, l'auteur ne le voit pas.
  const kindOf = async (sub: string) =>
    (
      (await call(sub, 'get', '/my-work', 200)).body.items as Array<{
        versionId: string;
        kind: string;
      }>
    )
      .filter((i) => i.versionId === V1)
      .map((i) => i.kind);
  assert.deepEqual(await kindOf(SUB.mariam), ['to_review']);
  const designated = (await call(SUB.mariam, 'get', '/my-work', 200)).body.items.find(
    (i: { versionId: string }) => i.versionId === V1,
  );
  assert.equal(designated.assignedToMe, true);
  assert.equal(
    (await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200)).body.reviewer.id,
    ID.userMariam,
  );
  assert.deepEqual(await kindOf(SUB.koffi), []);

  const incomplete = await call(SUB.mariam, 'post', `/course-versions/${V1}/approve`, 400, {
    checklist: { pedagogy: true, accessibility: false, rights: true },
  });
  assert.match(incomplete.body.message, /trois contrôles/);
  await call(SUB.mariam, 'post', `/course-versions/${V1}/approve`, 204, {
    checklist: { pedagogy: true, accessibility: true, rights: true },
    comment: 'Clair et adapté au CP1.',
  });

  // Approuvé : à publier chez la direction, plus rien chez la référente qui a approuvé.
  assert.deepEqual(await kindOf(SUB.bamba), ['to_publish']);
  assert.deepEqual(await kindOf(SUB.mariam), []);

  // La personne qui a approuvé ne publie pas seule.
  const self = await call(SUB.mariam, 'post', `/course-versions/${V1}/publish`, 403);
  assert.match(self.body.message, /deuxième personne/);
  const wf = await call(SUB.bamba, 'get', `/course-versions/${V1}/workflow`, 200);
  assert.equal(wf.body.can.publish, true);
  await call(SUB.bamba, 'post', `/course-versions/${V1}/publish`, 204);

  const course = await call(SUB.koffi, 'get', `/courses/${ID.courseSyllabes}`, 200);
  assert.deepEqual(
    course.body.versions.map((v: { status: string }) => v.status),
    ['published'],
  );
  const history = await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200);
  assert.deepEqual(
    history.body.history.map((h: { action: string }) => h.action),
    ['submitted', 'approved', 'published'],
  );
  // L'historique est en ajout seulement.
  await assert.rejects(
    ctx.db.execute(sql`delete from course_review_events`),
    (e: { cause?: Error }) => /ajout seulement/.test(String(e.cause?.message)),
  );
});

test('demande de modifications : motif obligatoire, retour en brouillon chez l’auteur', async () => {
  const MARCHE = ID.courseMarcheV1;
  const wf = await call(SUB.mariam, 'get', `/course-versions/${MARCHE}/workflow`, 200);
  assert.equal(wf.body.can.approve, true);
  assert.equal(
    (await call(SUB.bamba, 'get', `/course-versions/${MARCHE}/workflow`, 200)).body.can.approve,
    false,
  );

  await call(SUB.mariam, 'post', `/course-versions/${MARCHE}/request-changes`, 400, {
    comment: 'Non.',
  });
  await call(SUB.mariam, 'post', `/course-versions/${MARCHE}/request-changes`, 204, {
    comment: 'Ajoutez une leçon sur les pièces de monnaie.',
  });
  const back = await call(SUB.aminata, 'get', `/course-versions/${MARCHE}/workflow`, 200);
  assert.equal(back.body.can.submit, true);
  assert.equal(back.body.history.at(-1).comment, 'Ajoutez une leçon sur les pièces de monnaie.');
  const version = await call(SUB.aminata, 'get', `/course-versions/${MARCHE}`, 200);
  assert.equal(version.body.status, 'draft');
  // « Mon travail » : le cours revient chez l'auteure avec la remarque de la référente.
  const mine = (await call(SUB.aminata, 'get', '/my-work', 200)).body.items.find(
    (i: { versionId: string }) => i.versionId === MARCHE,
  );
  assert.equal(mine.kind, 'to_fix');
  assert.equal(mine.remark, 'Ajoutez une leçon sur les pièces de monnaie.');
});

test('nouvelle version : copie complète, publication qui remplace, puis retrait', async () => {
  const next = await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 201);
  const v2 = await call(SUB.koffi, 'get', `/course-versions/${next.body.versionId}`, 200);
  assert.equal(v2.body.number, 2);
  assert.equal(v2.body.status, 'draft');
  assert.equal(v2.body.title, 'Lire ses premières syllabes');
  assert.equal(v2.body.modules.length, 2);
  assert.deepEqual(
    v2.body.curriculum.competencies.map((c: { code: string }) => c.code),
    ['LECT-02', 'LECT-03'],
  );
  await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 409);
  await call(SUB.koffi, 'delete', `/course-versions/${V1}`, 409);

  const V2 = next.body.versionId as string;
  await call(SUB.koffi, 'post', `/course-versions/${V2}/submit`, 204, { revision: 1 });
  await call(SUB.mariam, 'post', `/course-versions/${V2}/approve`, 204, {
    checklist: { pedagogy: true, accessibility: true, rights: true },
  });
  await call(SUB.bamba, 'post', `/course-versions/${V2}/publish`, 204);
  const course = await call(SUB.koffi, 'get', `/courses/${ID.courseSyllabes}`, 200);
  assert.deepEqual(
    course.body.versions.map((v: { number: number; status: string }) => [v.number, v.status]),
    [
      [2, 'published'],
      [1, 'archived'],
    ],
  );
  const v1History = await call(SUB.koffi, 'get', `/course-versions/${V1}/workflow`, 200);
  assert.equal(v1History.body.history.at(-1).action, 'replaced');

  // Retrait : réservé aux validateurs, avec un motif.
  await call(SUB.koffi, 'post', `/course-versions/${V2}/withdraw`, 403, {
    comment: 'Je retire mon cours.',
  });
  await call(SUB.bamba, 'post', `/course-versions/${V2}/withdraw`, 204, {
    comment: 'Erreur signalée dans la leçon 2.',
  });
  const final = await call(SUB.koffi, 'get', `/course-versions/${V2}`, 200);
  assert.equal(final.body.status, 'archived');

  // Un brouillon qui n'est pas la version n° 1 se supprime.
  const v3 = await call(SUB.koffi, 'post', `/courses/${ID.courseSyllabes}/versions`, 201);
  await call(SUB.koffi, 'delete', `/course-versions/${v3.body.versionId}`, 204);
});

test('cycles (ADR-019) : l’enseignante limitée au primaire ne voit ni ne touche les autres cycles', async () => {
  const branchesOf = async (subject: string) =>
    (await call(subject, 'get', '/organizations', 200)).body.items[0].branches;
  assert.deepEqual(await branchesOf(SUB.aminata), ['primaire']);
  assert.equal((await branchesOf(SUB.koffi)).length, 5);

  const titles = async (subject: string) =>
    (await call(subject, 'get', '/courses', 200)).body.items.map(
      (c: { branch: string }) => c.branch,
    );
  assert.ok((await titles(SUB.koffi)).includes('alphabetisation'));
  assert.ok(!(await titles(SUB.aminata)).includes('alphabetisation'));
  assert.ok((await titles(SUB.aminata)).includes('primaire'));

  // Un cours d’un autre cycle : refus uniforme, y compris pour le détail et la création.
  await call(SUB.aminata, 'get', `/course-versions/${ID.courseMarcheEcoleV1}`, 403);
  await call(SUB.koffi, 'get', `/course-versions/${ID.courseMarcheEcoleV1}`, 200);
  await call(SUB.aminata, 'post', '/courses', 403, {
    organizationId: ID.orgManguiers,
    branch: 'secondaire',
    title: 'Un cours hors de son cycle',
  });
});
