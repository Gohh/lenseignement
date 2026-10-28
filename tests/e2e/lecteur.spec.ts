import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Cours fictif publié « Les nombres jusqu'à 50 » : apps/api/src/courses/demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000003';
const DRAFT = '50000000-0000-4000-8000-000000000001';

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Lecteur de leçons (ticket 11)', () => {
  test('un visiteur lit la leçon 1, puis le compte est demandé pour continuer', async ({
    page,
  }) => {
    await page.goto(`/catalogue/${COURSE}`);
    await page.getByRole('link', { name: 'Commencer le cours' }).click();
    await expect(page.getByTestId('lesson-position')).toContainText('Leçon 1 sur 2');
    await expect(page.getByRole('heading', { name: 'Garde ta progression' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute(
      'href',
      /inscription=1/,
    );

    // La suite est réservée aux comptes ; la leçon 1 reste relisible.
    await page.getByRole('link', { name: 'Leçon suivante →' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Crée ton compte pour continuer' }),
    ).toBeVisible();
    await page.getByRole('link', { name: '← Revoir la leçon 1' }).click();
    await expect(page.getByTestId('lesson-position')).toContainText('Leçon 1 sur 2');
  });

  test('un compte lit le cours leçon par leçon', async ({ page }) => {
    await loginAs(page, 'apprenant.demo', `/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compter de 10 en 10');
    await expect(page.getByTestId('lesson-position')).toContainText('Leçon 1 sur 2');
    await expect(page.getByText(/bâtonnets groupés par dix/)).toBeVisible();

    await page.getByRole('link', { name: 'Leçon suivante →' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Additionner deux petits nombres',
    );
    await expect(page.getByRole('link', { name: 'Fin du cours : retour au plan' })).toBeVisible();
    await page.getByRole('link', { name: '← Leçon précédente' }).click();
    await expect(page.getByTestId('lesson-position')).toContainText('Leçon 1 sur 2');
  });

  test('écoute par la voix de l’appareil, phrase par phrase', async ({ page }) => {
    // Voix de synthèse simulée : on enregistre ce qui est lu, sans son.
    await page.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { spoken: string[] }).spoken = spoken;
      const synth = {
        speak(u: SpeechSynthesisUtterance) {
          spoken.push(`${u.lang}|${u.text}`);
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 10);
        },
        cancel() {},
        pause() {},
        resume() {},
        getVoices: () => [],
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth });
    });
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await page.getByRole('button', { name: 'Écouter' }).click();
    await expect(page.getByTestId('audio-status')).toHaveText('Lecture terminée.');
    const spoken = await page.evaluate(() => (window as unknown as { spoken: string[] }).spoken);
    expect(spoken[0]).toBe('fr-FR|Compter de 10 en 10.');
    expect(spoken.length).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('button', { name: 'Réécouter' })).toBeVisible();
  });

  test('sans voix sur l’appareil, la leçon reste lisible', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    });
    await loginAs(page, 'apprenant.demo', `/catalogue/${COURSE}/lecons/2`);
    await expect(page.getByText('La lecture à voix haute n’est pas disponible')).toBeVisible();
    await expect(page.getByText(/Trois cailloux/)).toBeVisible();
  });

  test('leçon inconnue ou cours non publié : page introuvable', async ({ page }) => {
    expect((await page.goto(`/catalogue/${COURSE}/lecons/9`))?.status()).toBe(404);
    expect((await page.goto(`/catalogue/${DRAFT}/lecons/1`))?.status()).toBe(404);
  });

  test('E2E-16 : lecteur sans violation axe WCAG A/AA', async ({ page }) => {
    await page.goto(`/catalogue/${COURSE}/lecons/1`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
