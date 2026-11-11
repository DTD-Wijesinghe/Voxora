import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the main heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText('Conversations that cross every language');
  });

  test('shows the join and start buttons', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Join a session' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Start a conversation/ }),
    ).toBeVisible();
  });

  test('shows the privacy note', async ({ page }) => {
    await expect(
      page.getByText('No audio stored by default'),
    ).toBeVisible();
  });
});