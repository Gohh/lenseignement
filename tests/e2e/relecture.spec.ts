import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Cours fictif de Mme Aminata, en attente de relecture : apps/api/src/courses/demo-courses.ts.
const DEMO_IN_REVIEW = '60000000-0000-4000-8000-000000000002';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Change de personne : la session du navigateur est effacée avant la nouvelle connexion. */
async function switchTo(page: Page, username: string, returnTo: string) {
  await page.context().clearCookies();
  await loginAs(page, username, returnTo);
}

const status = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

/** M. Koffi rédige un cours complet (programme, compétence, une leçon avec contenu). */
async function writeCompleteCourse(page: Page, title: string): Promise<string> {
  await loginAs(page, 'enseignant.demo', '/mon-espace/cours/nouveau');
  await page.getByLabel('Titre du cours').fill(title);
  await page.getByRole('button', { name: 'Créer le brouillon' }).click();
  await expect(status(page, 'Cours créé.')).toBeVisible();
  const versionPath = new URL(page.url()).pathname;

  await page
    .getByLabel('Programme de référence')
    .selectOption({ label: 'Lecture et calcul au CP (démonstration) — version 2026' });
  await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
  await expect(status(page, 'Informations enregistrées.')).toBeVisible();
  await page.getByLabel('Lire des syllabes simples').check();
  const saved = page.waitForResponse((r) => r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
  await saved;
  await page.waitForLoadState('networkidle');

  await expect(async () => {
    if ((await page.getByLabel('Titre du module 1').count()) === 0) {
      await page.getByRole('button', { name: 'Ajouter un module' }).click();
    }
    await expect(page.getByLabel('Titre du module 1')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByLabel('Titre du module 1').fill('Les syllabes');
  await page.getByRole('button', { name: 'Ajouter une leçon au module 1' }).click();
  await page.getByLabel('Leçon 1.1 : titre').fill('Lire « ma »');
  await page.getByLabel('Leçon 1.1 : contenu').fill('m et a : ma.');
  await page.getByRole('button', { name: 'Enregistrer le plan' }).click();
  await expect(page.getByTestId('outline-status')).toHaveText('Plan enregistré.');
  return versionPath;
}

test.describe('Relecture et publication des cours (ticket 9)', () => {
  test('double validation : l’auteur soumet, la référente approuve, le directeur publie', async ({
    page,
  }, testInfo) => {
    const title = `Relecture E2E ${testInfo.project.name} ${Date.now()}`;
    const versionPath = await writeCompleteCourse(page, title);

    await page.reload();
    await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
    await expect(status(page, 'Version envoyée en relecture.')).toBeVisible();
    await expect(page.getByTestId('version-status')).toContainText('En relecture');
    // E2E-11 : l'auteur ne peut ni approuver ni publier.
    await expect(page.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publier cette version' })).toHaveCount(0);

    await switchTo(page, 'referent.demo', '/mon-espace/relecture');
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByText('m et a : ma.')).toBeVisible();
    await page.getByLabel('Exactitude pédagogique').check();
    await page.getByLabel('Accessibilité vérifiée').check();
    await page.getByLabel('Droits d’utilisation').check();
    await page.getByRole('button', { name: 'Approuver' }).click();
    await expect(status(page, 'Version approuvée.')).toBeVisible();
    // La personne qui approuve ne publie pas elle-même.
    await expect(page.getByRole('button', { name: 'Publier cette version' })).toHaveCount(0);

    await switchTo(page, 'directeur.demo', versionPath);
    await page.getByRole('button', { name: 'Publier cette version' }).click();
    await expect(status(page, 'Version publiée.')).toBeVisible();
    await expect(page.getByTestId('version-status')).toContainText('Publiée');
    await expect(page.getByTestId('review-history').getByRole('listitem')).toHaveCount(3);
  });

  test('un cours renvoyé revient avec la remarque, en haut de page et dans Mon travail', async ({
    page,
  }, testInfo) => {
    const title = `Renvoi E2E ${testInfo.project.name} ${Date.now()}`;
    const versionPath = await writeCompleteCourse(page, title);
    await page.reload();
    await page.getByLabel('Relecteur').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Envoyer en relecture' }).click();
    await expect(status(page, 'Version envoyée en relecture.')).toBeVisible();

    await switchTo(page, 'referent.demo', '/mon-espace/travail');
    await expect(
      page.getByTestId('work-to_review').getByText('Désigné pour vous').first(),
    ).toBeVisible();
    await page.goto('/mon-espace/relecture');
    await page.getByRole('link', { name: title }).click();
    await page.getByLabel('Modifications demandées').fill('Ajoutez un exemple avec « mi ».');
    await page.getByRole('button', { name: 'Demander des modifications' }).click();
    await expect(status(page, 'la version est revenue en brouillon')).toBeVisible();

    await switchTo(page, 'enseignant.demo', versionPath);
    await expect(page.getByTestId('returned-remark')).toContainText(
      'Ajoutez un exemple avec « mi ».',
    );
    await page.goto('/mon-espace/travail');
    const fix = page.getByTestId('work-to_fix');
    await expect(fix).toContainText(title);
    await expect(fix).toContainText('Ajoutez un exemple avec « mi ».');
  });

  test('E2E-11 : un enseignant ne valide pas le cours d’une collègue', async ({ page }) => {
    await loginAs(page, 'enseignant.demo', `/mon-espace/cours/versions/${DEMO_IN_REVIEW}`);
    await expect(page.getByTestId('version-status')).toContainText('En relecture');
    await expect(page.getByText('Aucune action de validation ne vous revient')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
    await page.goto('/mon-espace');
    await expect(
      page
        .getByRole('navigation', { name: 'Menu de mon espace' })
        .getByRole('link', { name: 'Relecture' }),
    ).toHaveCount(0);
  });

  test('E2E-16 : relecture sans violation axe WCAG A/AA', async ({ page }) => {
    await loginAs(page, 'referent.demo', `/mon-espace/cours/versions/${DEMO_IN_REVIEW}`);
    await expect(page.getByRole('button', { name: 'Approuver' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('« Mon travail » liste les sections de la référente, sans violation axe', async ({
    page,
  }) => {
    await loginAs(page, 'referent.demo', '/mon-espace/travail');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon travail' })).toBeVisible();
    for (const kind of ['to_fix', 'to_review', 'to_publish', 'to_write']) {
      await expect(page.getByTestId(`work-${kind}`)).toBeVisible();
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
