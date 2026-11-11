import { test, expect } from '@playwright/test';

test.describe('Join page', () => {
  test('opens from the home page and goes back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Join a session' }).click();

    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText('Bring your voice');

    await page.getByRole('button', { name: 'Back to home' }).click();

    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText('Conversations that cross every language');
  });

  test('asks for a display name when it is empty', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Join a session' }).click();

    await page.getByRole('button', { name: /Create conversation/ }).click();

    await expect(
      page.getByText('Enter a display name to continue.'),
    ).toBeVisible();
  });

  test('rejects a session code shorter than 4 characters', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Join a session' }).click();

    await page.getByLabel('Session code').fill('abc');
    await page.getByLabel('Display name').fill('Test User');
    await page.getByRole('button', { name: /Join conversation/ }).click();

    await expect(
      page.getByText('Session codes should contain at least 4 characters.'),
    ).toBeVisible();
  });

  test('turns the session code into uppercase', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Join a session' }).click();

    await page.getByLabel('Session code').fill('abcd');

    await expect(page.getByLabel('Session code')).toHaveValue('ABCD');
  });

  test('changes the button label when a code is typed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Join a session' }).click();

    await expect(
      page.getByRole('button', { name: /Create conversation/ }),
    ).toBeVisible();

    await page.getByLabel('Session code').fill('abcd');

    await expect(
      page.getByRole('button', { name: /Join conversation/ }),
    ).toBeVisible();
  });

  test('opens the join page with the code filled in from a link', async ({
    page,
  }) => {
    await page.goto('/?code=ABCD');

    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText('Bring your voice');
    await expect(page.getByLabel('Session code')).toHaveValue('ABCD');
  });
});