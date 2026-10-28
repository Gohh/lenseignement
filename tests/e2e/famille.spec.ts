import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const fresh = (prefix: string, testInfo: TestInfo) =>
  `${prefix}.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Famille : enfant et répétiteur (étape 2, ADR-020)', () => {
  test('le parent ajoute son enfant, invite un répétiteur, puis retire son accès', async ({
    browser,
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau-parent', testInfo), '/mon-espace/famille');
    await expect(page.getByRole('heading', { level: 1, name: 'Ma famille' })).toBeVisible();
    await expect(page.getByText('Vous n’avez pas encore ajouté d’enfant.')).toBeVisible();

    await page.getByLabel('Prénom de l’enfant').fill('Kader (fictif)');
    await page.getByLabel('Niveau ou classe (facultatif)').selectOption('cp2');
    await page.getByRole('button', { name: 'Ajouter mon enfant' }).click();
    await expect(page.getByText('Enfant ajouté.')).toBeVisible();
    await expect(page.locator('p', { hasText: 'Primaire CP2' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Créer un code d’invitation' }).click();
    const code = (await page.getByTestId('invitation-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    // Le répétiteur saisit le code et ne voit que cet enfant.
    const tutorContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const tutor = await tutorContext.newPage();
    await loginAs(tutor, fresh('nouveau', testInfo), '/mon-espace/repetiteur');
    await tutor.getByLabel('Code d’invitation').fill('AAAAAAAA');
    await tutor.getByRole('button', { name: 'Valider le code' }).click();
    await expect(tutor.getByText('Code invalide ou expiré.')).toBeVisible();
    await tutor.getByLabel('Code d’invitation').fill(code);
    await tutor.getByRole('button', { name: 'Valider le code' }).click();
    await expect(tutor.getByText('Accès accordé.')).toBeVisible();
    await tutor.getByRole('link', { name: 'Voir ses progrès' }).click();
    await expect(tutor.getByRole('heading', { level: 1 })).toHaveText('Kader (fictif)');

    // Le parent retire l'accès : la fiche est refusée au répétiteur.
    const fiche = tutor.url();
    await page.reload();
    await page.getByRole('button', { name: 'Retirer l’accès' }).click();
    await expect(page.getByText('Accès retiré.')).toBeVisible();
    await tutor.goto(fiche);
    await expect(tutor.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await tutorContext.close();
  });
});
