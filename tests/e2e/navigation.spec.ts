import { expect, test, type Page } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu de mon espace' });

test.describe('Navigation', () => {
  test('le pied de page est présent partout, public comme connecté', async ({ page }) => {
    for (const path of ['/', '/catalogue']) {
      await page.goto(path);
      await expect(page.getByTestId('site-footer')).toContainText('Projet indépendant');
    }
    await loginAs(page, 'directeur.demo', '/mon-espace/configuration');
    const footer = page.getByTestId('site-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Catalogue des leçons' })).toBeVisible();
  });

  test('le menu de mon espace suit le profil et montre la page en cours', async ({ page }) => {
    await loginAs(page, 'directeur.demo', '/mon-espace');
    await expect(menu(page).getByRole('link')).toHaveText([
      'Tableau de bord',
      'Suivi de l’établissement',
      'Mon travail',
      'Cours',
      'Relecture',
      'Classe virtuelle',
      'Devoirs',
      'Évaluations',
      'Bibliothèque',
      'Messages',
      'Questions des élèves',
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
      'Ma classe',
      'Mes devoirs',
      'Mes notes',
      'Bibliothèque',
      'Mes réussites',
      'Aide et tutorat',
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
