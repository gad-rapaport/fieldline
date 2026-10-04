import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, signIn, trackConsole } from './support.js';

test('phone layout: menu, request cards and detail are usable', async ({ page }) => {
  const errors = trackConsole(page);
  await signIn(page, 'admin');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  const nav = page.getByRole('navigation', { name: 'Primary', includeHidden: true });
  await expect(nav).toBeHidden();
  await menu.click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Requests', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Service requests' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');

  // No horizontal scrolling at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.locator('.row-link').first().click();
  await expect(page.getByRole('heading', { name: 'Actions' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});
