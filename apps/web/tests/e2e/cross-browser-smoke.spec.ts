import { expect, test } from '@playwright/test';

test('public pages follow system appearance and render without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('neptlium-theme', 'system'));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/infrastructure', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build on Neptlium.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
});

test('desktop dropdowns and mobile drill-down preserve keyboard and overview access', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  if (testInfo.project.name === 'webkit-mobile') {
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Explore Products' }).click();
    await expect(dialog.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/platform');
    await dialog.getByRole('button', { name: 'Back to main navigation' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  } else {
    const trigger = page.getByRole('button', { name: 'Open Solutions menu' });
    await trigger.focus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  }
});
