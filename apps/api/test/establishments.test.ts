import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import {
  membershipInvitations,
  memberships,
  organizationChanges,
  organizations,
} from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
let drena = '';
const granted: string[] = [];
const made: string[] = [];
const stamp = `${Date.now() % 1_000_000}`;

before(async () => {
  ctx = await createTestApp();
  const rows = await ctx.db
    .insert(memberships)
    .values([{ userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' }])
    .returning({ id: memberships.id });
  granted.push(...rows.map((r) => r.id));
  const [region] = await ctx.db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ID.orgRegion));
  drena = region!.name;
});

after(async () => {
  if (made.length > 0) {
    await ctx.db
      .delete(organizationChanges)
      .where(inArray(organizationChanges.organizationId, made));
    await ctx.db
      .delete(membershipInvitations)
      .where(inArray(membershipInvitations.organizationId, made));
    await ctx.db.delete(organizations).where(inArray(organizations.id, made));
  }
  await ctx.db.delete(memberships).where(inArray(memberships.id, granted));
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'put',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const primary = (name: string, extra: Record<string, string> = {}) => ({
  category: 'primary',
  parentId: ID.orgRegion,
  fields: {
    name,
    status: 'Public',
    locality: 'Bouaké',
    managerName: 'M. Essai',
    phone: '07 08 09 10 11',
    iepp: 'IEPP Bouaké 1',
    ...extra,
  },
});

test('formulaire : les champs suivent la catégorie et sont contrôlés', async () => {
  await call(SUB.koffi, 'post', '/organizations/establishments', 403, primary(`EPP A ${stamp}`));
  const refused = (
    await call(SUB.yao, 'post', '/organizations/establishments', 400, {
      ...primary(`EPP B ${stamp}`, { phone: '1234', iepp: '' }),
    })
  ).body;
  assert.match(refused.message, /Téléphone : 10 chiffres/);
  assert.match(refused.message, /IEPP : Obligatoire/);

  const created = (
    await call(
      SUB.yao,
      'post',
      '/organizations/establishments',
      201,
      primary(`EPP C ${stamp}`, { officialCode: `C-${stamp}`, classCount: '6' }),
    )
  ).body;
  made.push(created.id);
  // Le superadministrateur reçoit le code d'invitation du responsable, comme avant.
  assert.match(created.managerCode, /^[A-Z0-9]{4,}/);
  const fiche = (await call(SUB.yao, 'get', `/organizations/${created.id}`, 200)).body;
  assert.equal(fiche.type, 'primary');
  assert.equal(fiche.phone, '0708091011');
  assert.equal(fiche.status, 'public');
  assert.deepEqual(fiche.details, { iepp: 'IEPP Bouaké 1', classCount: 6 });
  assert.deepEqual(fiche.missing, []);

  // Doublons : même code, ou même nom dans la même DRENA.
  const dupCode = (
    await call(SUB.yao, 'post', '/organizations/establishments', 400, {
      ...primary(`EPP D ${stamp}`, { officialCode: `c-${stamp}` }),
    })
  ).body;
  assert.match(dupCode.message, /code officiel/);
  await call(SUB.yao, 'post', '/organizations/establishments', 400, primary(`EPP C ${stamp}`));

  // Un centre d'alphabétisation demande son opérateur, pas d'IEPP.
  const literacy = (
    await call(SUB.yao, 'post', '/organizations/establishments', 400, {
      category: 'literacy_center',
      parentId: ID.orgRegion,
      fields: {
        name: `Centre ${stamp}`,
        status: 'communautaire',
        locality: 'Man',
        managerName: 'Mme Test',
        phone: '0102030405',
      },
    })
  ).body;
  assert.match(literacy.message, /Opérateur ou structure porteuse : Obligatoire/);
});

test('import : structure, obligatoires, validité et doublons, puis confirmation', async () => {
  const header =
    'Nom officiel*;Code officiel;Statut*;DRENA*;Localité*;Commune ou sous-préfecture;Responsable*;Téléphone*;E-mail;Année d’ouverture;Filières ou spécialités*;Forme';
  // Mauvais modèle : colonnes du primaire pour un import du technique.
  const wrong = (
    await call(SUB.yao, 'post', '/organizations/establishments/import', 201, {
      category: 'technical_center',
      csv: `Nom officiel*;Statut*;DRENA*;IEPP*\nX;Public;${drena};IEPP`,
      confirm: false,
    })
  ).body;
  assert.ok(
    wrong.anomalies.some(
      (a: { column: string; message: string }) => a.column === 'IEPP' && /inconnue/.test(a.message),
    ),
  );
  assert.ok(
    wrong.anomalies.some(
      (a: { column: string; message: string }) =>
        a.column === 'Filières ou spécialités' && /absente/.test(a.message),
    ),
  );

  const rows = [
    `LP Un ${stamp};T1-${stamp};Public;${drena};Bouaké;;M. Un;0708091011;;2001;Électricité, Mécanique;Lycée professionnel`,
    `LP Deux ${stamp};;Privé laïc;DRENA inconnue;Bouaké;;M. Deux;123;pas-un-mail;3000;;`,
    `LP Un ${stamp};;Public;${drena};Bouaké;;M. Trois;0708091011;;;Couture;`,
  ];
  const preview = (
    await call(SUB.yao, 'post', '/organizations/establishments/import', 201, {
      category: 'technical_center',
      csv: [header, ...rows].join('\n'),
      confirm: false,
    })
  ).body;
  assert.equal(preview.total, 3);
  assert.equal(preview.ready, 0);
  const at = (line: number, column: string) =>
    preview.anomalies.find(
      (a: { line: number; column: string }) => a.line === line && a.column === column,
    );
  assert.ok(at(3, 'DRENA'));
  assert.ok(at(3, 'Téléphone'));
  assert.ok(at(3, 'E-mail'));
  assert.ok(at(3, 'Année d’ouverture'));
  assert.ok(at(3, 'Filières ou spécialités'));
  assert.match(at(4, 'Nom officiel').message, /ligne 2/);
  await call(SUB.yao, 'post', '/organizations/establishments/import', 400, {
    category: 'technical_center',
    csv: [header, ...rows].join('\n'),
    confirm: true,
  });

  const done = (
    await call(SUB.yao, 'post', '/organizations/establishments/import', 201, {
      category: 'technical_center',
      csv: `\uFEFF${header}\n${rows[0]}`,
      confirm: true,
    })
  ).body;
  assert.equal(done.created, 1);
  const list = (
    await call(SUB.yao, 'get', `/organizations?search=${encodeURIComponent(`LP Un ${stamp}`)}`, 200)
  ).body.items;
  assert.equal(list.length, 1);
  made.push(list[0].id);
  assert.deepEqual(list[0].details.tracks, ['Électricité', 'Mécanique']);

  // Le même fichier rechargé : déjà enregistré, ignoré.
  const again = (
    await call(SUB.yao, 'post', '/organizations/establishments/import', 201, {
      category: 'technical_center',
      csv: `${header}\n${rows[0]}`,
      confirm: false,
    })
  ).body;
  assert.equal(again.ready, 0);
  assert.equal(again.duplicates.length, 1);
  assert.equal(again.anomalies.length, 0);
});

test('Modifier corrige la fiche ; Mettre à jour date le changement et garde l’ancienne valeur', async () => {
  const id = made[0]!;
  const fiche = (await call(SUB.yao, 'get', `/organizations/${id}`, 200)).body;
  const fields = {
    name: fiche.name,
    officialCode: fiche.officialCode,
    status: fiche.status,
    locality: 'Bouaké Commerce',
    managerName: fiche.managerName,
    phone: fiche.phone,
    iepp: 'IEPP Bouaké 1',
  };
  const fixed = (await call(SUB.yao, 'put', `/organizations/${id}/fiche`, 200, { fields })).body;
  assert.equal(fixed.locality, 'Bouaké Commerce');
  assert.equal(fixed.changes.length, 0);

  await call(SUB.yao, 'post', `/organizations/${id}/changes`, 400, {
    field: 'name',
    value: 'Autre nom',
    effectiveOn: '2026-09-01',
  });
  await call(SUB.yao, 'post', `/organizations/${id}/changes`, 400, {
    field: 'managerName',
    value: 'Mme Nouvelle',
    effectiveOn: '2999-01-01',
  });
  const updated = (
    await call(SUB.yao, 'post', `/organizations/${id}/changes`, 201, {
      field: 'managerName',
      value: 'Mme Nouvelle',
      effectiveOn: '2026-09-01',
      note: 'Nomination de rentrée',
    })
  ).body;
  assert.equal(updated.managerName, 'Mme Nouvelle');
  assert.equal(updated.changes.length, 1);
  assert.equal(updated.changes[0].oldValue, 'M. Essai');
  assert.equal(updated.changes[0].newValue, 'Mme Nouvelle');
  assert.equal(updated.changes[0].label, 'Responsable');

  // L'enseignant ne voit pas la fiche ; la direction ne touche pas à un autre établissement.
  await call(SUB.koffi, 'get', `/organizations/${id}`, 404);
  await call(SUB.bamba, 'put', `/organizations/${id}/fiche`, 404, { fields });
});

test('tableau : chaque ligne dit les actions permises à la personne connectée', async () => {
  const all = (await call(SUB.yao, 'get', '/organizations', 200)).body.items;
  const mine = all.find((o: { id: string }) => o.id === made[0]);
  assert.deepEqual(mine.can, { edit: true, archive: true });
  // Deux onglets : les établissements d'un côté, les directions régionales de l'autre.
  const schools = (await call(SUB.yao, 'get', '/organizations?kind=etablissements', 200)).body;
  assert.ok(schools.items.every((o: { type: string }) => o.type !== 'authority'));
  const drenas = (await call(SUB.yao, 'get', '/organizations?kind=directions', 200)).body;
  const region = drenas.items.find((o: { id: string }) => o.id === ID.orgRegion);
  assert.ok(drenas.items.every((o: { type: string }) => o.type === 'authority'));
  assert.ok(region.activeChildren >= 1);
  // La direction modifie sa propre fiche mais ne la retire pas.
  const own = (await call(SUB.bamba, 'get', '/organizations', 200)).body.items;
  const manguiers = own.find((o: { id: string }) => o.id === ID.orgManguiers);
  assert.deepEqual(manguiers.can, { edit: true, archive: false });
});
