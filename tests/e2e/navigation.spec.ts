import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu de mon espace' });

test.describe('Navigation', () => {
  test('le menu de mon espace suit le profil et montre la page en cours', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace');
    await expect(menu(page).getByRole('link')).toHaveText([
      'Tableau de bord',
      'Mon travail',
      'Cours',
      'Relecture',
      'Statistiques',
      'Établissements',
      'Équipe et invitations',
    ]);
    await expect(page.getByTestId('circuit-published')).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // D'un outil à l'autre sans repasser par la vue d'ensemble.
    await menu(page).getByRole('link', { name: 'Statistiques' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statistiques anonymes');
    await expect(menu(page).getByRole('link', { name: 'Statistiques' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu(page).getByRole('link', { name: 'Relecture' }).click();
    await expect(page).toHaveURL(/\/mon-espace\/relecture$/);
  });

  test('le bouton à initiales ouvre le menu du compte, avec la déconnexion', async ({ page }) => {
    await loginAs(page, 'apprenant.demo', '/catalogue');
    await page.getByRole('banner').locator('summary').click();
    const account = page.getByRole('navigation', { name: 'Menu du compte' });
    await expect(account.getByRole('link', { name: 'Vue d’ensemble' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Modifier mon compte' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  });

  test('un visiteur voit « Se connecter » et « Créer mon compte » dans l’en-tête', async ({
    page,
  }) => {
    await page.goto('/catalogue');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Se connecter' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute(
      'href',
      /inscription=1/,
    );
  });

  test('l’apprenant a son bilan et son atelier dans le menu', async ({ page }) => {
    await loginAs(page, 'apprenant.demo', '/mon-espace/atelier-securite');
    await expect(menu(page).getByRole('link')).toHaveText([
      'Vue d’ensemble',
      'Mon bilan',
      'Atelier',
    ]);
    await expect(menu(page).getByRole('link', { name: 'Atelier' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('banner').getByRole('link', { name: 'Catalogue' }).click();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Catalogue' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
