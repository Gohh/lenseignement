import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const fresh = (prefix: string, testInfo: TestInfo) =>
  `${prefix}.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Classes : création, enseignants et code de classe', () => {
  test('la direction crée une classe, affecte un enseignant, un élève la rejoint avec le code', async ({
    browser,
    page,
  }, testInfo) => {
    const name = `CE2 ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    await loginAs(page, 'directeur.demo', '/mon-espace/configuration?q=Manguiers');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('link', { name: 'École primaire Les Manguiers (fictive)' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'École primaire Les Manguiers (fictive)' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '+ Créer une classe' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Niveau').selectOption('ce2');
    // L'année scolaire se choisit dans une liste ; l'année en cours est proposée d'abord.
    const now = new Date();
    const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    await expect(dialog.getByLabel('Année scolaire')).toHaveValue(`${start}-${start + 1}`);
    await expect(dialog.getByLabel('Année scolaire').locator('option')).toHaveCount(3);
    await dialog.getByLabel('Nom de la classe').fill(name);
    await dialog.getByRole('button', { name: 'Créer la classe' }).click();
    await expect(page.getByText('Classe créée.')).toBeVisible();

    const item = page.getByTestId('cohort-list').locator(':scope > li').filter({ hasText: name });
    await expect(item).toContainText('Primaire CE2');
    const code = (await item.getByTestId('cohort-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    await item.getByRole('button', { name: /Affecter/ }).click();
    await expect(page.getByText('Enseignant affecté à la classe.')).toBeVisible();
    await expect(
      page.getByTestId('cohort-list').locator(':scope > li').filter({ hasText: name }),
    ).toContainText('Retirer');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    // L'élève saisit le code et entre dans la classe.
    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, fresh('nouveau', testInfo), '/mon-espace/rejoindre');
    await learner.waitForLoadState('networkidle');
    await learner.getByLabel('Code de classe').fill('ZZZZZZ');
    await learner.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await expect(learner.getByText('Code de classe invalide.')).toBeVisible();
    await learner.getByLabel('Code de classe').fill(code);
    await learner.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await expect(learner.getByText(`Tu es dans la classe ${name}`)).toBeVisible();
    await learnerContext.close();

    await page.reload();
    await expect(
      page.getByTestId('cohort-list').locator(':scope > li').filter({ hasText: name }),
    ).toContainText('1 élève');
  });
});
