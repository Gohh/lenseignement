import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Bibliothèque', () => {
  test('l’enseignant ajoute une ressource, l’élève la voit', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const title = `Fiche ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;

    await loginAs(page, 'enseignant.demo', '/mon-espace/bibliotheque');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Ajouter une ressource' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Titre').fill(title);
    await dialog.getByLabel('Lien (commence par https://)').fill('https://exemple.org/fiche');
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Ressource ajoutée.')).toBeVisible();

    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, 'apprenant.demo', '/mon-espace/bibliotheque');
    await learner.waitForLoadState('networkidle');
    const item = learner.getByTestId('resources').getByRole('listitem').filter({ hasText: title });
    await expect(item.getByRole('link')).toHaveAttribute('href', 'https://exemple.org/fiche');
    const results = await new AxeBuilder({ page: learner })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await learnerContext.close();

    // Nettoyage : l'enseignant retire la ressource.
    await page.reload();
    await page
      .getByTestId('resources')
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('button', { name: /Retirer/ })
      .click();
    await expect(page.getByText('Ressource retirée.')).toBeVisible();
  });
});
