import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

// Image PNG de 1 pixel : suffisante pour vérifier le trajet complet de la photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

// Micro simulé par Chromium : l'enregistrement se teste sans matériel.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe('Aide : photo jointe', () => {
  test('l’élève joint une photo, son enseignant la voit', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const text = `Exercice photo ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    await loginAs(page, 'apprenant.demo', '/mon-espace/aide');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Ta question').fill(text);
    await page
      .getByLabel('Ajouter une photo (facultatif)')
      .setInputFiles({ name: 'exercice.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo prête : exercice.png')).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer ma question' }).click();
    await expect(page.getByText('Ta question est envoyée.')).toBeVisible();
    const mine = page.getByTestId('my-questions').getByRole('listitem').filter({ hasText: text });
    await expect(mine.getByAltText('Photo jointe à la question')).toBeVisible();

    const teacherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const teacher = await teacherContext.newPage();
    await loginAs(teacher, 'enseignant.demo', '/mon-espace/questions');
    await teacher.waitForLoadState('networkidle');
    const asked = teacher
      .getByTestId('open-questions')
      .getByRole('listitem')
      .filter({ hasText: text });
    const image = asked.getByAltText('Photo jointe à la question');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await teacherContext.close();
  });
});

test.describe('Aide : message vocal', () => {
  test('l’élève enregistre sa voix et l’envoie avec sa question', async ({ page }, testInfo) => {
    const text = `Question vocale ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;
    await loginAs(page, 'apprenant.demo', '/mon-espace/aide');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Ta question').fill(text);
    await page.getByRole('button', { name: 'Enregistrer ma voix' }).click();
    await expect(page.getByText('Enregistrement en cours…')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
    await expect(page.getByRole('button', { name: 'Recommencer' })).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer ma question' }).click();
    await expect(page.getByText('Ta question est envoyée.')).toBeVisible();
    const mine = page.getByTestId('my-questions').getByRole('listitem').filter({ hasText: text });
    await expect(mine.locator('audio')).toHaveCount(1);
  });
});
