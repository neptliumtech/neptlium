import { expect, test } from '@playwright/test';
import { INDEXABLE_ROUTES } from '../../lib/content/public-architecture';

const publicAccountRoutes = [
  '/auth/access-denied',
  '/auth/create-account',
  '/auth/forgot-password',
  '/auth/loading',
  '/auth/reset-password',
  '/auth/session-expired',
  '/auth/sign-in',
  '/auth/verify-email',
] as const;

for (const route of publicAccountRoutes) {
  test(`${route} retains one main landmark and delegates account access`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    const main = page.getByRole('main');
    await expect(main).toHaveCount(1);
    await expect(main).toHaveAttribute('id', 'main-content');
    await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(main.locator('input[type="password"]')).toHaveCount(0);
    await expect(main.locator('form')).toHaveCount(0);
    // Inspect the destination; do not create sessions in another application.
    for (const link of await main.locator('a[href^="https://app.neptlium.com"]').all()) {
      expect(new URL((await link.getAttribute('href'))!).origin).toBe('https://app.neptlium.com');
    }
  });
}

for (const preference of ['light', 'dark', 'system'] as const) {
  for (const route of INDEXABLE_ROUTES) {
    test(`${route} respects ${preference} appearance without overflow`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.addInitScript((value) => {
        window.localStorage.setItem('neptlium-theme', value);
      }, preference);
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      const root = page.locator('html');
      await expect(root).toHaveAttribute('data-theme-preference', preference);
      const initialTheme = preference === 'dark' ? 'dark' : 'light';
      await expect(root).toHaveAttribute('data-theme', initialTheme);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('banner')).toBeVisible();
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
      )).toBe(true);

      // OS changes affect System; explicit preferences must remain authoritative.
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(root).toHaveAttribute('data-theme', preference === 'system' ? 'dark' : initialTheme);
      if (preference === 'system') {
        await page.emulateMedia({ colorScheme: 'light' });
        await expect(root).toHaveAttribute('data-theme', 'light');
      }
      if (route === '/' || route === '/infrastructure') {
        await page.screenshot({
          path: testInfo.outputPath(`css-baseline-appearance-${route === '/' ? 'home' : 'infrastructure'}-${preference}-${testInfo.project.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    });
  }
}


test('indexable routes fit the additional certification widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440', 'Additional viewport matrix runs once per route');
  const widths = [320, 375, 412, 430, 1024, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
    for (const route of INDEXABLE_ROUTES) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} at ${width}px`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2),
        `Horizontal overflow at ${width}px on ${route}`,
      ).toBe(true);
    }
  }
});

test('public navigation remains available in forced-colors mode', async ({ page }, testInfo) => {
  test.skip(!['desktop-1440', 'mobile-390'].includes(testInfo.project.name), 'Forced-colors coverage');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main')).toBeVisible();
  if (testInfo.project.name === 'desktop-1440') {
    const trigger = page.getByRole('button', { name: 'Open Solutions menu' });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(page.getByRole('link', { name: 'Capital visibility', exact: true })).toBeVisible();
  } else {
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Talk to Neptlium' })).toBeVisible();
  }
});
