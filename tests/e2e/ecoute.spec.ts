import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Cours fictif « Marché-école » (alphabétisation) : apps/api/src/courses/demo-courses.ts.
const COURSE = '50000000-0000-4000-8000-000000000007';

const freshLearner = (testInfo: TestInfo) =>
  `nouveau.e${Date.now()}-${testInfo.project.name}-${testInfo.retry}`.toLowerCase();

const loginAs = (page: Page, username: string, returnTo: string) =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

/** Voix de synthèse simulée : on enregistre ce qui est lu, sans son. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { spoken: string[] }).spoken = spoken;
    const synth = {
      speak(u: SpeechSynthesisUtterance) {
        spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 10);
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices: () => [],
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
  });
}

/** Ce qui a été lu (sans l'effacer). */
const heard = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { spoken: string[] }).spoken]);

/** Repart d'une écoute vide avant l'action suivante. */
const forget = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { spoken: string[] }).spoken.length = 0;
  });

test.describe('Alphabétisation : écouter d’abord (ticket 19)', () => {
  test('E2E-06 : un adulte suit la leçon et le quiz en écoutant chaque texte', async ({
    page,
  }, testInfo) => {
    await recordSpeech(page);
    await loginAs(page, freshLearner(testInfo), `/catalogue/${COURSE}`);

    // Présentation du cours, à écouter.
    await forget(page);
    await page.getByRole('button', { name: 'Écouter la présentation du cours' }).click();
    await expect.poll(() => heard(page)).toContain('Rendre la monnaie.');
    await page.getByRole('button', { name: 'Suivre ce cours' }).click();
    await page.goto(`/catalogue/${COURSE}/lecons/1`);

    // « Écouter d'abord » : l'écoute passe avant le titre ; les pictogrammes ne sont pas lus.
    const listen = page.getByRole('button', { name: 'Écouter', exact: true });
    const title = page.getByRole('heading', { level: 1 });
    expect((await listen.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
    await forget(page);
    await listen.click();
    await expect(page.getByTestId('audio-status')).toHaveText('Lecture terminée.');
    const lesson = await heard(page);
    expect(lesson).toContain('La pièce de 100 francs est petite et ronde.');
    expect(lesson.join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);

    // Quiz : la question et chaque réponse s'écoutent avant de choisir.
    await forget(page);
    await page.getByRole('button', { name: 'Écouter la question 1' }).click();
    await expect
      .poll(() => heard(page))
      .toEqual([
        'Combien de pièces de 100 francs font 1 000 francs ?',
        '5 pièces.',
        '10 pièces.',
        '20 pièces.',
      ]);
    await forget(page);
    await page.getByRole('button', { name: 'Écouter la réponse : 10 pièces' }).click();
    await expect.poll(() => heard(page)).toEqual(['10 pièces']);
    await page.getByLabel('10 pièces', { exact: true }).check();
    await page.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(page.getByTestId('quiz-score')).toHaveText('Résultat : 1 sur 1. Bravo !');

    // Résultat et correction, à écouter aussi.
    await forget(page);
    await page.getByRole('button', { name: 'Écouter le résultat' }).click();
    await expect.poll(() => heard(page)).toEqual(['Résultat :', '1 sur 1.', 'Bravo !']);
    await forget(page);
    await page.getByRole('button', { name: 'Écouter la correction de la question 1' }).click();
    await expect
      .poll(() => heard(page))
      .toEqual(['Bonne réponse.', '100, 200, 300…', 'jusqu’à 1 000 :', 'il faut dix pièces.']);
  });

  test('sans voix sur l’appareil, la leçon et le quiz restent lisibles', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    });
    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await expect(page.getByText('La lecture à voix haute n’est pas disponible')).toBeVisible();
    await expect(page.getByRole('button', { name: /Écouter la question/ })).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Question 1/ })).toBeVisible();
  });

  test('E2E-16 : leçon « écouter d’abord » sans violation axe WCAG A/AA', async ({ page }) => {
    await recordSpeech(page);
    await page.goto(`/catalogue/${COURSE}/lecons/2`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rendre la monnaie');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
  });
});
