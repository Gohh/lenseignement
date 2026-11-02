import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeDb, sql, subjectOf } from './support/db';

// Évaluation orale chronométrée (étape 5a) : l'enseignant crée une épreuve depuis un modèle, la
// direction la publie, l'enseignant la fait passer élève par élève (chronomètre, cases fausses,
// règle d'arrêt, questions), y compris sans connexion, puis lit les résultats de la classe.

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const axe = async (page: Page) => {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
};

const CP1_A = '30000000-0000-4000-8000-000000000001';

test.afterAll(async () => {
  await closeDb();
});

test('épreuve orale créée, publiée, passée en classe et hors ligne, résultats lus', async ({
  browser,
  page,
  context,
}, testInfo) => {
  const title = `Lecture à voix haute ${testInfo.project.name}-${Date.now()}`;
  // Pas de repère pour ce niveau : la page le dit.
  await sql(`delete from oral_benchmarks where level = 'cp1' and subject = 'lecture'`);

  await loginAs(page, 'enseignant.demo', '/mon-espace/oral');
  await expect(page.getByRole('heading', { level: 1, name: 'Évaluations orales' })).toBeVisible();
  await page.getByRole('link', { name: 'Créer une épreuve orale' }).click();
  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Niveau').selectOption('cp1');
  await axe(page);
  await page.getByRole('button', { name: 'Créer l’épreuve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Épreuve créée' })).toBeVisible();
  await expect(page.getByTestId('oral-part')).toHaveCount(4);
  await expect(page.getByTestId('oral-status')).toHaveText('Brouillon');
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Brouillon enregistré' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publier l’épreuve' })).toHaveCount(0);
  await axe(page);
  const testUrl = new URL(page.url()).pathname;
  const testId = testUrl.split('/').at(-1)!;

  // La direction publie : l'épreuve est figée.
  const director = await (
    await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  ).newPage();
  await loginAs(director, 'directeur.demo', testUrl);
  await director.getByRole('button', { name: 'Publier l’épreuve' }).click();
  await expect(director.getByRole('status').filter({ hasText: 'Épreuve publiée' })).toBeVisible();
  await expect(director.getByTestId('oral-editor')).toHaveCount(0);
  await director.context().close();

  // Passation : premier élève.
  await page.goto('/mon-espace/oral');
  const run = page.getByTestId('oral-run');
  await run.getByLabel('Classe').selectOption(CP1_A);
  await run.getByLabel('Épreuve').selectOption(testId);
  await run.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByTestId('oral-learner')).toHaveCount(3);
  await axe(page);
  await page.getByTestId('oral-learner').first().click();

  // 1. Sons : deux erreurs, fini avant la fin, dernier lu = 21e.
  await page.getByTestId('oral-start').click();
  await expect(page.getByTestId('oral-clock')).toBeVisible();
  const items = page.getByTestId('oral-item');
  await items.nth(1).click();
  await items.nth(2).click();
  await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('oral-finish').click();
  await items.nth(20).click();
  await page.getByTestId('oral-last').click();
  // 2. Mots familiers : partie non passée.
  await page.getByRole('button', { name: 'Ne pas passer cette partie' }).click();
  // 3. Mots inventés : les 10 premiers faux, la règle d'arrêt s'affiche.
  await page.getByTestId('oral-start').click();
  for (let i = 0; i < 10; i += 1) await items.nth(i).click();
  await expect(page.getByTestId('oral-part-run').getByRole('alert')).toContainText('règle d’arrêt');
  await page.getByTestId('oral-stop').click();
  // 4. Texte : lu en entier avant la fin, puis questions.
  await page.getByTestId('oral-start').click();
  await page.getByTestId('oral-finish').click();
  await page.getByTestId('oral-last').click();
  await page.getByTestId('oral-q-right').nth(0).click();
  await page.getByTestId('oral-q-right').nth(1).click();
  await page.getByTestId('oral-q-wrong').nth(2).click();
  await page.getByTestId('oral-next').click();
  const summary = page.getByTestId('oral-summary');
  await expect(summary).toContainText('(19/50)');
  await expect(summary).toContainText('arrêtée');
  await expect(summary).toContainText('questions 2/4');
  await axe(page);
  await page.getByTestId('oral-save').click();
  await expect(page.getByTestId('oral-saved')).toHaveText('Résultat enregistré.');

  // Deuxième élève sans connexion : le résultat attend sur l'appareil.
  await page.getByRole('button', { name: 'Élève suivant' }).click();
  await context.setOffline(true);
  await page.getByTestId('oral-learner').nth(1).click();
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Ne pas passer cette partie' }).click();
  }
  await page.getByTestId('oral-save').click();
  await expect(page.getByTestId('oral-saved')).toContainText('Pas de connexion');
  const count = async () =>
    Number(
      (
        await sql<{ n: number }>(`select count(*)::int as n from oral_results where test_id = $1`, [
          testId,
        ])
      )[0]!.n,
    );
  expect(await count()).toBe(1);
  await context.setOffline(false);
  await expect.poll(count, { timeout: 15_000 }).toBe(2);

  // Résultats de la classe.
  await page.goto(`/mon-espace/oral/resultats?epreuve=${testId}&classe=${CP1_A}`);
  await expect(page.getByTestId('oral-tiles')).toContainText('2 / 3');
  await expect(page.getByTestId('oral-tiles')).toContainText('pas encore de repère');
  await expect(page.getByTestId('oral-learners-table')).toContainText('Pas encore passé');
  await axe(page);
});

test('le superadministrateur règle les repères', async ({ page }, testInfo) => {
  const username =
    `nouveau.superadmin-oral-${Date.now() % 1000000}-${testInfo.project.name}`.toLowerCase();
  await loginAs(page, username, '/mon-espace');
  await page.waitForLoadState('networkidle');
  await sql(
    `insert into memberships (user_id, organization_id, role)
     select u.id, o.id, 'superadministrateur' from users u, organizations o
      where u.oidc_subject = $1 and o.type = 'authority' and o.name like 'Direction régionale de démonstration%'`,
    [subjectOf(username)],
  );
  await page.goto('/mon-espace/oral/reperes');
  const form = page.getByTestId('oral-benchmarks');
  await expect(form).toBeVisible();
  await form.getByLabel('Primaire CE1, Lecture : justes par minute').fill('45');
  await axe(page);
  await page.getByRole('button', { name: 'Enregistrer les repères' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Repères enregistrés' })).toBeVisible();
  await expect(form.getByLabel('Primaire CE1, Lecture : justes par minute')).toHaveValue('45');
  await sql(`delete from oral_benchmarks where level = 'ce1'`);
});
