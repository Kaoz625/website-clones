import { test, expect } from '@playwright/test';

test.describe('example.com', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    await expect(page.locator('h1')).toHaveText('Example Domain');
  });

  test('page screenshot on demand', async ({ page }, testInfo) => {
    await page.goto('https://example.com');
    const screenshot = await page.screenshot();
    await testInfo.attach('homepage', { body: screenshot, contentType: 'image/png' });
  });

  test('navigation works', async ({ page }) => {
    await page.goto('https://example.com');
    const link = page.getByRole('link', { name: 'Learn more' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).not.toHaveURL('https://example.com');
  });
});
