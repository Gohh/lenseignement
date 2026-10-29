import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Brouillon fictif de M. Koffi : apps/api/src/courses/demo-courses.ts.
const DEMO_VERSION = '60000000-0000-4000-8000-000000000001';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Rédaction des cours (ticket 8)', () => {
  test('un enseignant crée un cours, le relie au programme et rédige son plan', async ({
    page,
  }, testInfo) => {
    const title = `Cours E2E ${testInfo.project.name} ${Date.now()}`;
    await loginAs(page, 'enseignant.demo');
    await page
      .getByRole('navigation', { name: 'Menu de mon espace' })
      .getByRole('link', { name: 'Cours' })
      .click();
    await expect(
      page.getByRole('link', { name: 'Lire ses premières syllabes (démonstration)' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Créer un cours' }).click();
    await page.getByLabel('Titre du cours').fill(title);
    await page.getByRole('button', { name: 'Créer le brouillon' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cours créé.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByTestId('version-status')).toContainText('version 1 · Brouillon');
    // Le circuit situe le cours : un brouillon vide commence au plan.
    await expect(page.getByTestId('circuit-current')).toHaveText('Étape 1 sur 6 : Plan');

    // Programme de référence, puis compétences de cette version exacte.
    await page
      .getByLabel('Programme de référence')
      .selectOption({ label: 'Lecture et calcul au CP (démonstration) — version 2026' });
    await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Informations enregistrées.' }),
    ).toBeVisible();
    await page.getByLabel('Lire des syllabes simples').check();
    const saved = page.waitForResponse((r) => r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
    await saved;
    await expect(page.getByLabel('Lire des syllabes simples')).toBeChecked();

    // Page rechargée : la redirection après un enregistrement peut encore re-rendre l'éditeur
    // et effacer un ajout ; après rechargement (et chargement des scripts), la page est stable.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Ajouter un module' }).click();
    await page.getByLabel('Titre du module 1').fill('Les voyelles');
    await page.getByRole('button', { name: 'Ajouter une leçon au module 1' }).click();
    await page.getByLabel('Leçon 1.1 : titre').fill('Le son a');
    await page.getByLabel('Leçon 1.1 : contenu').fill('Écoute et répète : a.');
    await page.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('outline-status')).toHaveText('Plan enregistré.');

    await page.reload();
    await expect(page.getByLabel('Leçon 1.1 : titre')).toHaveValue('Le son a');
    await expect(page.getByLabel('Lire des syllabes simples')).toBeChecked();
  });

  test('un élève n’a pas accès à la rédaction ni aux brouillons', async ({ page }) => {
    await loginAs(page, 'apprenant.demo');
    await expect(page.getByRole('heading', { name: 'Bonjour, Awa' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Menu de mon espace' })
        .getByRole('link', { name: 'Cours' }),
    ).toHaveCount(0);

    await page.goto('/mon-espace/cours');
    await expect(page.getByText('La rédaction de cours est réservée')).toBeVisible();
    await page.goto(`/mon-espace/cours/versions/${DEMO_VERSION}`);
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
  });

  test('E2E-16 : éditeur de cours sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'enseignant.demo', `/mon-espace/cours/versions/${DEMO_VERSION}`);
    await expect(page.getByRole('heading', { name: 'Plan du cours' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
