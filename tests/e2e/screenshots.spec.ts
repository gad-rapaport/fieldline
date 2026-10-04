import { expect, test } from '@playwright/test';
import { signIn } from './support.js';

// Regenerates the README screenshots from the running demo: npm run screenshots
const out = (name: string) => `docs/screenshots/${name}.png`;

test('capture README screenshots', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.screenshot({ path: out('login') });

  await signIn(page, 'admin');
  await expect(page.getByText('Open requests')).toBeVisible();
  await page.screenshot({ path: out('dashboard') });

  await page.goto('/requests?status=new,assigned,in_progress,on_hold&sort=-priority');
  await expect(page.locator('.row-link').first()).toBeVisible();
  await page.screenshot({ path: out('requests') });

  await page.goto('/requests?status=in_progress&sort=-priority');
  await page.locator('.row-link').first().click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await page.screenshot({ path: out('request-detail'), fullPage: true });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await signIn(phone, 'viewer');
  await phone.goto('/requests');
  await expect(phone.locator('.row-link').first()).toBeVisible();
  await phone.screenshot({ path: out('mobile-requests') });
});
