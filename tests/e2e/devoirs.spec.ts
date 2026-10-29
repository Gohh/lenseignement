import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Devoirs', () => {
  test('l’enseignant donne un devoir, l’élève le rend, l’enseignant le corrige', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const title = `Rédaction ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;

    await loginAs(page, 'enseignant.demo', '/mon-espace/devoirs');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Donner un devoir' }).click();
    const dialog = page.getByRole('dialog');
    // D'autres tests créent des classes : on choisit la classe de l'élève de démonstration.
    await dialog
      .getByLabel('Classe')
      .selectOption(await dialog.getByRole('option', { name: /CP1 A/ }).getAttribute('value'));
    await dialog.getByLabel('Titre du devoir').fill(title);
    await dialog.getByLabel('Consigne').fill('Décris ta maison en trois phrases.');
    await dialog.getByRole('button', { name: 'Donner le devoir' }).click();
    await expect(page.getByText('Devoir donné.')).toBeVisible();

    // L'élève le voit et le rend.
    const learnerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const learner = await learnerContext.newPage();
    await loginAs(learner, 'apprenant.demo', '/mon-espace/devoirs');
    await learner.waitForLoadState('networkidle');
    const mine = learner
      .getByTestId('my-assignments')
      .getByRole('listitem')
      .filter({ hasText: title });
    await expect(mine).toContainText('Décris ta maison');
    await mine.getByLabel('Ma réponse').fill('Ma maison est grande. Elle a un jardin.');
    await mine.getByRole('button', { name: /Rendre mon devoir/ }).click();
    await expect(learner.getByText('Ton devoir est rendu.')).toBeVisible();

    const results = await new AxeBuilder({ page: learner })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    // L'enseignant corrige.
    await page.reload();
    await page
      .getByTestId('given-assignments')
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: /Corriger/ })
      .click();
    const copy = page
      .getByTestId('submissions')
      .getByRole('listitem')
      .filter({ hasText: 'Ma maison est grande' });
    await copy.getByLabel(/Note sur 20/).fill('16');
    await copy.getByLabel('Commentaire (facultatif)').fill('Très bien.');
    await copy.getByRole('button', { name: /Enregistrer la note/ }).click();
    await expect(page.getByText('Correction enregistrée.')).toBeVisible();

    // L'élève voit sa note.
    await learner.reload();
    await expect(
      learner
        .getByTestId('my-assignments')
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByTestId('grade'),
    ).toHaveText('Note : 16/20');
    await learnerContext.close();
  });
});
