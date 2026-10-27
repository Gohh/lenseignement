import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Programmes FICTIFS : database/curricula. La version 2026 du primaire est en vigueur
// depuis le 1er septembre 2026, la version 2025 avant cette date.
test.describe('Programmes versionnés (ticket 7)', () => {
  test('le programme en vigueur s’affiche, avec son historique consultable', async ({ page }) => {
    await page.goto('/branches/primaire');
    await page.getByRole('link', { name: 'Voir le programme et les compétences' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Programme · Préscolaire et primaire',
    );
    await expect(page.getByTestId('non-officiel')).toBeVisible();
    await expect(page.getByTestId('version-courante')).toContainText('Version 2026');
    await expect(page.getByText("Compter jusqu'à 50", { exact: true })).toBeVisible();
    await expect(
      page.getByText('Prérequis : Additionner des nombres inférieurs à 10'),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Version 2025' }).click();
    await expect(page).toHaveURL(/\/branches\/primaire\/programme\?date=2025-09-01$/);
    await expect(page.getByTestId('version-courante')).toContainText('Version 2025');
    await expect(page.getByText("Compter jusqu'à 20", { exact: true })).toBeVisible();
    await expect(
      page.getByText('Résoudre un petit problème du marché', { exact: true }),
    ).toHaveCount(0);
  });

  test('chaque branche de démonstration a son programme', async ({ page }) => {
    await page.goto('/branches/technique/programme');
    await expect(
      page.getByText('Identifier les risques électriques', { exact: true }),
    ).toBeVisible();
    await page.goto('/branches/alphabetisation/programme');
    await expect(page.getByText('Rendre la monnaie au marché', { exact: true })).toBeVisible();
    await page.goto('/branches/secondaire/programme');
    await expect(
      page.getByText('Aucun programme n’est encore publié pour cet espace.'),
    ).toBeVisible();
  });

  test('E2E-16 : page programme sans violation axe WCAG A/AA', async ({ page }) => {
    await page.goto('/branches/primaire/programme');
    await expect(page.getByTestId('version-courante')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
