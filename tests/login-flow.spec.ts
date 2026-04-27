import { test, expect } from '@playwright/test';

test.describe('login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://the-internet.herokuapp.com/login');
  });

  test('successful login', async ({ page }) => {
    await page.fill('#username', 'tomsmith');
    await page.fill('#password', 'SuperSecretPassword!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.flash.success')).toBeVisible();
    await expect(page.locator('.flash.success')).toContainText('You logged into a secure area!');
    await expect(page).toHaveURL(/secure/);
  });

  test('failed login shows error', async ({ page }) => {
    await page.fill('#username', 'wronguser');
    await page.fill('#password', 'wrongpass');
    await page.click('button[type="submit"]');

    await expect(page.locator('.flash.error')).toBeVisible();
    await expect(page.locator('.flash.error')).toContainText('Your username is invalid!');
    await expect(page).toHaveURL(/login/);
  });
});
