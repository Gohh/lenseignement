import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { closeDb, sql } from './support/db';

// Fabrique d'exercices : l'enseignant écrit un exercice sur une compétence du programme, vérifie
// l'aperçu élève, le référent relit et publie, puis l'enseignant en fait une nouvelle version.

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

test.afterAll(async () => {
  await closeDb();
});

test('un exercice écrit, essayé, relu et publié rejoint la banque', async ({
  page,
}, testInfo: TestInfo) => {
  const title = `Partager des mangues ${testInfo.project.name} ${Date.now()}`;

  await loginAs(page, 'enseignant.demo', '/mon-espace/fabrique');
  await expect(page.getByRole('heading', { level: 1, name: 'Fabrique d’exercices' })).toBeVisible();
  await page.getByRole('link', { name: 'Créer un exercice' }).click();
  await page.getByLabel('Compétence du programme').selectOption({ index: 1 });
  await page.getByLabel('Domaine').selectOption({ label: 'Nombres et opérations' });
  await page.getByRole('radio', { name: /Calcul à saisir/ }).check();
  await page.getByLabel('Titre').fill(title);
  await axe(page);
  await page.getByRole('button', { name: 'Créer et écrire l’exercice' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Exercice créé' })).toBeVisible();

  const editor = page.getByTestId('exercise-editor');
  await editor
    .getByTestId('exercise-prompt')
    .fill('Awa partage 24 mangues entre 4 enfants. Combien chacun en reçoit-il ?');
  await editor.getByLabel('Bonne réponse').fill('6');
  await editor.getByLabel('Unité (facultatif)').fill('mangues');
  await editor.getByLabel(/Explication montrée/).fill('24 divisé par 4 font 6.');
  await axe(page);
  await editor.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon enregistré' })).toBeVisible();

  // Aperçu élève : la plateforme corrige.
  const preview = page.getByTestId('exercise-preview');
  await expect(preview).toContainText('Awa partage 24 mangues');
  await preview.getByLabel('Ta réponse').fill('5');
  await preview.getByRole('button', { name: 'Vérifier' }).click();
  await expect(preview.getByTestId('exercise-result')).toContainText('À revoir');
  await preview.getByRole('button', { name: 'Recommencer' }).click();
  await preview.getByLabel('Ta réponse').fill('6');
  await preview.getByRole('button', { name: 'Vérifier' }).click();
  await expect(preview.getByTestId('exercise-result')).toContainText('Bonne réponse');
  await expect(preview.getByTestId('exercise-result')).toContainText('24 divisé par 4');

  await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
  await expect(page.getByTestId('exercise-status')).toContainText('En relecture');
  await expect(page.getByRole('button', { name: 'Publier dans la banque' })).toHaveCount(0);

  // Le référent relit le corrigé et publie.
  await page.context().clearCookies();
  await loginAs(page, 'referent.demo', '/mon-espace/fabrique');
  await page.getByTestId('exercises-review').getByRole('link', { name: title }).click();
  await expect(page.getByTestId('exercise-key')).toContainText('6 mangues');
  await axe(page);
  await page.getByRole('button', { name: 'Publier dans la banque' }).click();
  await expect(page.getByTestId('exercise-status')).toContainText('Publié');

  // La banque compte l'exercice dans son domaine ; l'auteur en ouvre une nouvelle version.
  await page.context().clearCookies();
  await loginAs(page, 'enseignant.demo', '/mon-espace/fabrique?domaine=nombres-operations');
  await expect(page.getByTestId('exercise-domains')).toContainText('Nombres et opérations');
  await axe(page);
  await page.getByTestId('exercises-list').getByRole('link', { name: title }).first().click();
  await page.getByRole('button', { name: 'Modifier (nouvelle version)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon ouvert' })).toBeVisible();
  await expect(page.getByTestId('exercise-status')).toContainText('Brouillon');
  await expect(page.getByTestId('exercise-editor')).toBeVisible();
});

test('un fichier d’exercices importé arrive en relecture', async ({ page }, testInfo) => {
  const [comp] = await sql<{ code: string; version: string }>(
    `select c.code, v.id as version from competencies c
       join curriculum_versions v on v.id = c.version_id
      where v.status = 'published' order by c.code limit 1`,
  );
  const title = `Importé ${testInfo.project.name} ${Date.now()}`;
  const file = {
    exercices: [
      {
        competencyCode: comp!.code,
        domain: 'nombres-operations',
        title,
        content: { kind: 'truefalse', prompt: 'Deux et deux font quatre.', correct: true },
      },
      { competencyCode: 'INCONNU-99', domain: 'autre', title: 'Mauvais code', content: {} },
    ],
  };

  await loginAs(page, 'enseignant.demo', '/mon-espace/fabrique');
  await page.getByRole('link', { name: 'Importer', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Importer des exercices' }),
  ).toBeVisible();
  await page.getByLabel(/^Programme/).selectOption(comp!.version);
  await page.getByLabel('Fichier d’exercices (.json)').setInputFiles({
    name: 'exercices.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await axe(page);
  await page.getByRole('button', { name: 'Importer' }).click();
  const result = page.getByTestId('import-result');
  await expect(result).toContainText('1 exercice importé');
  await expect(result).toContainText('n° 2 « Mauvais code »');

  await page.goto('/mon-espace/fabrique?etat=review');
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});
