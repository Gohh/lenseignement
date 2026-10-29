import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Aide et tutorat', () => {
  test('l’apprenant pose une question, son enseignant répond, la cloche suit', async ({
    browser,
    page,
  }, testInfo: TestInfo) => {
    const question = `Je ne comprends pas la moitié (${Date.now()}-${testInfo.project.name}-${testInfo.retry})`;
    await loginAs(page, 'apprenant.demo', '/mon-espace/aide');
    await expect(page.getByRole('heading', { level: 1, name: 'Aide et tutorat' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Ta question').fill(question);
    const send = page.getByRole('button', { name: 'Envoyer ma question' });
    await send.click({ timeout: 8000 }).catch(async (error) => {
      // DIAGNOSTIC TEMPORAIRE
      const info = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
        const b = [...document.querySelectorAll('button')].find((x) =>
          x.textContent?.includes('Envoyer ma question'),
        );
        return JSON.stringify({
          viewport: [innerWidth, innerHeight],
          scrollY,
          docHeight: document.documentElement.scrollHeight,
          button: b?.getBoundingClientRect(),
          nav: box('nav'),
          form: box('form'),
          forms: document.querySelectorAll('form').length,
          html: b?.parentElement?.outerHTML.slice(0, 400),
        });
      });
      throw new Error(`DIAG ${info} :: ${String(error).slice(0, 200)}`);
    });
    await expect(page.getByText('Ta question est envoyée.')).toBeVisible();
    await expect(page.getByTestId('my-questions')).toContainText(question);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);

    // L'enseignant de la classe voit la question et y répond.
    const teacherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const teacher = await teacherContext.newPage();
    await loginAs(teacher, 'enseignant.demo', '/mon-espace/questions');
    await teacher.waitForLoadState('networkidle');
    const item = teacher.getByRole('listitem').filter({ hasText: question });
    await expect(item).toBeVisible();
    await item.getByLabel('Votre réponse').fill('Partager en deux parts égales.');
    await item.getByRole('button', { name: 'Répondre' }).click();
    await expect(teacher.getByText('Réponse envoyée.')).toBeVisible();
    await teacherContext.close();

    // L'apprenant voit la réponse dans sa liste.
    await page.goto('/mon-espace/aide');
    const mine = page
      .getByTestId('my-questions')
      .getByRole('listitem')
      .filter({ hasText: question });
    await expect(mine).toContainText('Réponse reçue');
    await expect(mine).toContainText('Partager en deux parts égales.');
  });
});
