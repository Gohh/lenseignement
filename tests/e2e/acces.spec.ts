import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Comptes et identifiants fictifs : voir apps/api/src/db/demo-data.ts.
const CP1_B = '30000000-0000-4000-8000-000000000002';

const loginAs = (page: Page, username: string) =>
  page.goto(`/auth/login?returnTo=/mon-espace&login_hint=${username}`);

test.describe('Périmètres d’accès (ticket 6)', () => {
  test('l’enseignant voit sa classe et ses élèves, pas ceux d’un collègue', async ({ page }) => {
    await loginAs(page, 'enseignant.demo');
    await expect(page.getByRole('heading', { name: 'Bonjour, Koffi' })).toBeVisible();
    await expect(page.getByTestId('memberships')).toContainText(
      'École primaire Les Manguiers (fictive) : Enseignant ou formateur',
    );
    await expect(page.getByRole('heading', { name: 'Mes classes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CP1 B' })).toHaveCount(0);

    await page.getByRole('link', { name: 'CP1 A' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'CP1 A' })).toBeVisible();
    for (const name of ['Awa (fictive)', 'Kouamé (fictif)', 'Aya (fictive)']) {
      await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
    }
    await expect(page.getByText('Seydou (fictif)')).toHaveCount(0);

    // Accès direct à la classe d'une collègue par son identifiant : refusé.
    await page.goto(`/mon-espace/classes/${CP1_B}`);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(page.getByText('Seydou (fictif)')).toHaveCount(0);
  });

  test('le parent voit son enfant vérifié uniquement', async ({ page }) => {
    await loginAs(page, 'parent.demo');
    await expect(page.getByRole('heading', { name: 'Bonjour, Fatou' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mes enfants' })).toBeVisible();
    await expect(page.getByText('Awa (fictive)')).toBeVisible();
    await expect(page.getByText('Seydou (fictif)')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Mes classes' })).toHaveCount(0);
  });

  test('l’élève ne voit ni classe ni enfant', async ({ page }) => {
    await loginAs(page, 'apprenant.demo');
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mes classes' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Mes enfants' })).toHaveCount(0);
  });

  test('E2E-16 : « Mon espace » enseignant sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'enseignant.demo');
    await expect(page.getByRole('heading', { name: 'Mes classes' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
