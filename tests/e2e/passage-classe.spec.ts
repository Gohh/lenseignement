import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Passage de classe', () => {
  test('la direction fait passer un élève dans la classe suivante', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const suffix = `${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    const source = `CE2 source ${suffix}`;
    const target = `CM1 cible ${suffix}`;
    await loginAs(page, 'directeur.demo', '/mon-espace/configuration?q=Manguiers');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('link', { name: 'École primaire Les Manguiers (fictive)' })
      .first()
      .click();
    await page.waitForLoadState('networkidle');
    for (const [level, name] of [
      ['ce2', source],
      ['cm1', target],
    ] as const) {
      await page.getByRole('button', { name: '+ Créer une classe' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Niveau').selectOption(level);
      await dialog.getByLabel('Nom de la classe').fill(name);
      await dialog.getByRole('button', { name: 'Créer la classe' }).click();
      await expect(page.getByText('Classe créée.')).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    const row = page.getByTestId('cohort-list').locator(':scope > li').filter({ hasText: source });
    const code = (await row.getByTestId('cohort-code').textContent())!.trim();

    // Un élève rejoint la classe source avec le code.
    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, `passage.${suffix}`.toLowerCase(), '/mon-espace/rejoindre');
    await learner.waitForLoadState('networkidle');
    await learner.getByLabel('Code de classe').fill(code);
    await learner.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await expect(learner.getByText(`Tu es dans la classe ${source}`)).toBeVisible();
    await learnerContext.close();

    // La direction ouvre la classe source et fait passer toute la classe.
    await row.getByRole('link', { name: source }).click();
    await expect(page.getByTestId('roster').getByRole('listitem')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    // Inscrire des élèves sans e-mail : ici Keycloak n'est pas réglé, la page le dit.
    await page.getByRole('button', { name: '+ Inscrire des élèves' }).click();
    await expect(page.getByRole('dialog')).toContainText('réglage unique dans Keycloak');
    await page.keyboard.press('Escape');

    await page.getByLabel('Nouvelle classe').selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Faire passer' }).click();
    await expect(page.getByText('1 élève est passé dans la nouvelle classe.')).toBeVisible();
    await expect(page.getByTestId('roster').getByRole('listitem')).toHaveCount(0);
  });
});
