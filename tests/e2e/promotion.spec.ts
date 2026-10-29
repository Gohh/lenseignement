import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const fresh = (prefix: string, testInfo: TestInfo) =>
  `${prefix}.${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Niveau supérieur', () => {
  test('un apprenant autonome demande le niveau supérieur et le reçoit tout de suite', async ({
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau', testInfo), '/mon-espace/compte');
    await page.getByText('Collège', { exact: true }).click();
    await page.getByText('6e', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Niveau actuel : Collège 6e.')).toBeVisible();

    await page.getByRole('button', { name: 'Demander le niveau supérieur' }).click();
    await expect(page.getByText('Tu passes au niveau supérieur.')).toBeVisible();
    await expect(page.getByText('Niveau actuel : Collège 5e.')).toBeVisible();
  });

  test('le parent fait passer son enfant au niveau suivant depuis sa fiche', async ({
    page,
  }, testInfo) => {
    await loginAs(page, fresh('nouveau-parent', testInfo), '/mon-espace/famille');
    await page.getByLabel('Prénom de l’enfant').fill('Passage (fictif)');
    await page.getByLabel('Niveau ou classe (facultatif)').selectOption('cm2');
    await page.getByRole('button', { name: 'Ajouter mon enfant' }).click();
    await page.getByRole('link', { name: 'Voir ses progrès' }).click();

    await expect(page.getByTestId('learner-level')).toHaveText('Primaire CM2');
    await page.getByRole('button', { name: 'Passer en Collège 6e' }).click();
    await expect(page.getByText('Niveau supérieur accordé.')).toBeVisible();
    await expect(page.getByTestId('learner-level')).toHaveText('Collège 6e');
  });
});
