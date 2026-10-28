import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.equipe-${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

test.describe('Équipe et rôles (étape 3, ADR-021)', () => {
  test('la direction invite un gestionnaire pour un cycle ; il rejoint avec le code', async ({
    browser,
    page,
  }, testInfo) => {
    await loginAs(page, 'directeur.demo', '/mon-espace/equipe');
    await expect(page.getByRole('heading', { level: 1, name: 'Équipe' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    await page.getByLabel('Rôle').selectOption('gestionnaire');
    await page
      .locator('form', { hasText: 'Inviter quelqu’un' })
      .getByLabel('Préscolaire et primaire')
      .check();
    await page.getByRole('button', { name: 'Créer un code d’invitation' }).click();
    const code = (await page.getByTestId('invitation-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const member = await other.newPage();
    await loginAs(member, freshLearner(testInfo), '/mon-espace/rejoindre');
    await member.getByLabel('Code d’invitation').fill('AAAAAAAA');
    await member.getByRole('button', { name: 'Rejoindre l’équipe' }).click();
    await expect(member.getByText('Code invalide ou expiré.')).toBeVisible();
    await member.getByLabel('Code d’invitation').fill(code);
    await member.getByRole('button', { name: 'Rejoindre l’équipe' }).click();
    await expect(member.getByText(/Bienvenue dans l’équipe de/)).toBeVisible();

    // Le nouveau gestionnaire rédige ; il n'est pas de l'équipe de direction.
    await member.goto('/mon-espace');
    await expect(
      member.getByRole('navigation', { name: 'Menu de mon espace' }).getByRole('link', {
        name: 'Rédiger',
      }),
    ).toBeVisible();
    await member.goto('/mon-espace/equipe');
    await expect(member.getByText('Cette page est réservée à la direction')).toBeVisible();
    await other.close();
  });
});
