import { readFileSync, existsSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Demo passwords come from the environment (CI) or the local, git-ignored .env file. */
function readEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  if (existsSync('.env')) {
    const m = new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync('.env', 'utf8'));
    if (m?.[1]) return m[1].trim();
  }
  throw new Error(`${key} is not set (environment or .env)`);
}

export const ACCOUNTS = {
  admin: { email: 'admin@fieldline.test', password: () => readEnv('SEED_ADMIN_PASSWORD') },
  tech: { email: 'noa@fieldline.test', password: () => readEnv('SEED_TECHNICIAN_PASSWORD') },
  viewer: { email: 'viewer@fieldline.test', password: () => readEnv('SEED_VIEWER_PASSWORD') },
} as const;

export async function signIn(page: Page, who: keyof typeof ACCOUNTS) {
  const account = ACCOUNTS[who];
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#main')).toBeVisible();
}

/** Clicks a primary navigation entry (desktop layout). */
export async function navTo(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true }).click();
}

/** Collects console errors and uncaught exceptions; assert it is empty at the end of a flow. */
export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
