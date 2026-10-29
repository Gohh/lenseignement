import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const loginAs = (page: Page, username: string, returnTo = '/mon-espace') =>
  page.goto(`/auth/login?returnTo=${encodeURIComponent(returnTo)}&login_hint=${username}`);

test.describe('Messages parent ↔ enseignant', () => {
  test('la mère écrit à l’enseignant, il répond', async ({ browser, page }, testInfo: TestInfo) => {
    const text = `Question ${Date.now() % 100000}-${testInfo.project.name}-${testInfo.retry}`;

    await loginAs(page, 'parent.demo', '/mon-espace/messages');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '+ Nouveau message' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Message').fill(text);
    await dialog.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText('Message envoyé.')).toBeVisible();
    await expect(page.getByTestId('chat')).toContainText(text);

    const teacherContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const teacher = await teacherContext.newPage();
    await loginAs(teacher, 'enseignant.demo', '/mon-espace/messages');
    await teacher.waitForLoadState('networkidle');
    await teacher
      .getByTestId('conversations')
      .getByRole('listitem')
      .filter({ hasText: text })
      .getByRole('link')
      .click();
    await expect(teacher.getByTestId('chat')).toContainText(text);
    await teacher.getByLabel('Ma réponse').fill('Bien reçu, merci.');
    await teacher.getByRole('button', { name: 'Envoyer' }).click();
    await expect(teacher.getByText('Message envoyé.')).toBeVisible();
    const results = await new AxeBuilder({ page: teacher })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await teacherContext.close();

    await page.reload();
    await expect(page.getByTestId('chat')).toContainText('Bien reçu, merci.');
  });
});
