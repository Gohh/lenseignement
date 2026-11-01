import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';

const FIXTURES = join(__dirname, 'fixtures');

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Attend que le service worker contrôle la page (livres gardés, page « Hors connexion »). */
async function workerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

async function openAddDialog(page: Page) {
  await page.getByRole('button', { name: '＋ Ajouter un livre' }).click();
  const dialog = page.getByRole('dialog');
  // D'autres tests créent des classes : on choisit la classe de l'élève de démonstration.
  await dialog
    .getByLabel('Classe')
    .selectOption(await dialog.getByRole('option', { name: /CP1 A/ }).getAttribute('value'));
  return dialog;
}

test.describe('Bibliothèque', () => {
  test('un livre PDF : ajouté par l’enseignant, feuilleté et gardé hors ligne par l’élève', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const title = `Cahier ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;

    await loginAs(page, 'enseignant.demo', '/mon-espace/bibliotheque');
    await page.waitForLoadState('networkidle');
    const dialog = await openAddDialog(page);
    await dialog.getByTestId('book-file').setInputFiles(join(FIXTURES, 'livre-sons.pdf'));
    // Le titre est lu dans le PDF, puis remplacé par un titre unique pour ce test.
    await expect(dialog.getByLabel('Titre')).toHaveValue('Mon cahier de sons');
    await dialog.getByLabel('Titre').fill(title);
    await dialog.getByLabel('Étagère (matière)').fill('Lecture et contes');
    await dialog.getByRole('button', { name: 'Ajouter à l’étagère' }).click();
    await expect(page.getByText('Livre ajouté.')).toBeVisible();

    const learnerContext = await browser.newContext({ ...testInfo.project.use });
    const learner = await learnerContext.newPage();
    await loginAs(learner, 'apprenant.demo', '/mon-espace/bibliotheque');
    await learner.waitForLoadState('networkidle');
    await workerReady(learner);
    const results = await new AxeBuilder({ page: learner })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await learner.getByRole('button', { name: `Ouvrir « ${title} »` }).click();
    const reader = learner.getByTestId('reader');
    await expect(reader.getByRole('img', { name: 'Page 1 sur 7' })).toBeVisible();
    await reader.getByRole('button', { name: 'Page suivante' }).click();
    await expect(reader.getByRole('img', { name: 'Page 2 sur 7' })).toBeVisible();
    await reader.getByTestId('keep-book').click();
    await expect(reader.getByTestId('keep-book')).toHaveText('✓ Hors ligne');
    await reader.getByRole('button', { name: 'Fermer le livre' }).click();

    // Sans réseau : la bibliothèque mène à la page « Hors connexion », où le livre s'ouvre.
    await learnerContext.setOffline(true);
    await learner.goto('/mon-espace/bibliotheque');
    const kept = learner.getByTestId('offline-books');
    await kept.getByRole('button', { name: `Ouvrir « ${title} »` }).click();
    await expect(
      learner.getByTestId('reader').getByRole('img', { name: /Page 2 sur 7/ }),
    ).toBeVisible();
    await learnerContext.setOffline(false);
    await learnerContext.close();

    // Nettoyage : l'enseignant retire le livre.
    await page.reload();
    const card = page.getByTestId('shelf').getByRole('listitem').filter({ hasText: title });
    await card.getByText('Gérer').click();
    await card.getByRole('button', { name: /Retirer de la bibliothèque/ }).click();
    await expect(page.getByText('Livre retiré de la bibliothèque.')).toBeVisible();
  });

  test('un lien internet reste possible, et Word est refusé avec une explication', async ({
    page,
  }, testInfo: TestInfo) => {
    const title = `Lien ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    await loginAs(page, 'enseignant.demo', '/mon-espace/bibliotheque');
    await page.waitForLoadState('networkidle');
    const dialog = await openAddDialog(page);
    await dialog.getByTestId('book-file').setInputFiles({
      name: 'lecon.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK'),
    });
    await expect(dialog.getByRole('alert')).toContainText('Enregistrer sous › PDF');

    await dialog.getByRole('radio', { name: /Un lien internet/ }).click();
    await dialog.getByLabel('Lien (commence par https://)').fill('https://exemple.org/fiche');
    await dialog.getByLabel('Titre').fill(title);
    await dialog.getByRole('button', { name: 'Ajouter à l’étagère' }).click();
    await expect(page.getByText('Livre ajouté.')).toBeVisible();
    const card = page.getByTestId('shelf').getByRole('listitem').filter({ hasText: title });
    await expect(card.getByRole('link')).toHaveAttribute('href', 'https://exemple.org/fiche');
    await card.getByText('Gérer').click();
    await card.getByRole('button', { name: /Retirer de la bibliothèque/ }).click();
    await expect(page.getByText('Livre retiré de la bibliothèque.')).toBeVisible();
  });
});
