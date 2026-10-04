import { expect, test } from '@playwright/test';
import { ACCOUNTS, expectNoSeriousA11yViolations, navTo, signIn, trackConsole, unique } from './support.js';

test('admin dashboard shows computed figures without console errors', async ({ page }) => {
  const errors = trackConsole(page);
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('Open requests')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technician workload' })).toBeVisible();
  await page.getByText('Show as table').click();
  await expect(page.getByRole('table').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});

test('technician takes a request from creation to resolution', async ({ page }) => {
  const errors = trackConsole(page);
  const title = `E2E boiler check ${unique()}`;
  await signIn(page, 'tech');

  await navTo(page, 'Requests');
  await page.getByRole('link', { name: 'New request' }).click();
  await page.getByLabel('Customer').selectOption({ index: 1 });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Initial tasks').fill('Read pressure gauge\nBleed radiators');
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'created' })).toBeVisible();

  await page.getByRole('button', { name: 'Claim this request' }).click();
  await expect(page.locator('.detail-head').getByText('Assigned')).toBeVisible();
  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.locator('.detail-head').getByText('In progress')).toBeVisible();

  // Resolving with open tasks is refused by the server with a helpful message.
  await page.getByRole('button', { name: 'Resolve' }).click();
  await page.getByLabel('Resolution summary').fill('Pressure restored.');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Complete or remove the 2 open tasks' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  for (const task of ['Read pressure gauge', 'Bleed radiators']) {
    await page.getByRole('checkbox', { name: task }).check();
    await expect(page.getByRole('checkbox', { name: task })).toBeChecked();
  }
  await expect(page.getByText('2 of 2 done')).toBeVisible();

  await page.getByRole('button', { name: 'Resolve' }).click();
  await page.getByLabel('Resolution summary').fill('Pressure restored, radiators bled.');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.detail-head').getByText('Resolved')).toBeVisible();
  await expect(page.getByText('Pressure restored, radiators bled.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0); // admin-only
  await expect(page.locator('.timeline')).toContainText('Status In progress → Resolved');
  // The only expected browser error is the deliberate 422 from resolving with open tasks.
  expect(errors.filter((e) => !e.includes('status of 422'))).toEqual([]);
});

test('viewer can browse but sees no actions and no contact details', async ({ page }) => {
  await signIn(page, 'viewer');
  await expect(page.getByText('Read-only demo account')).toBeVisible();
  await navTo(page, 'Requests');
  await expect(page.getByRole('link', { name: 'New request' })).toHaveCount(0);
  await page.locator('.row-link').first().click();
  await expect(page.getByText('Your role is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
  await navTo(page, 'Customers');
  await expect(page.getByText('Hidden for your role').first()).toBeVisible();
  await page.goto('/activity');
  await expect(page.getByText('Not available for your role')).toBeVisible();
});

test('a stale edit is stopped and both versions are shown', async ({ browser }) => {
  const one = await browser.newPage();
  const two = await browser.newPage();
  await signIn(one, 'admin');
  await signIn(two, 'admin');
  await one.goto('/requests?status=new');
  await one.locator('.row-link').first().click();
  const url = one.url();
  await two.goto(url);

  await one.getByRole('button', { name: 'Edit details' }).click();
  await two.getByRole('button', { name: 'Edit details' }).click();

  const first = `First editor ${unique()}`;
  await one.getByLabel('Title').fill(first);
  await one.getByRole('button', { name: 'Save changes' }).click();
  await expect(one.getByRole('heading', { name: first, level: 1 })).toBeVisible();

  await two.getByLabel('Title').fill('Second editor wins?');
  await two.getByRole('button', { name: 'Save changes' }).click();
  const conflict = two.getByRole('alert').filter({ hasText: 'changed while you were editing' });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole('cell', { name: first })).toBeVisible();
  await expect(conflict.getByRole('cell', { name: 'Second editor wins?' })).toBeVisible();

  await two.getByRole('button', { name: 'Discard mine, edit the latest' }).click();
  await expect(two.getByLabel('Title')).toHaveValue(first);
});

test('the app is usable with the keyboard alone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').focus();
  await page.keyboard.type('admin@fieldline.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type(ACCOUNTS.admin.password());
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.goto('/requests');
  const sortRef = page.getByRole('button', { name: 'Ref' });
  await sortRef.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sort=-ref/);
  await expect(page.getByRole('columnheader', { name: 'Ref' })).toHaveAttribute('aria-sort', 'descending');
});

test('a deep link survives sign-in', async ({ page }) => {
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(ACCOUNTS.admin.email);
  await page.getByLabel('Password').fill(ACCOUNTS.admin.password());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
});

test('server-side validation messages reach the form', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/customers/new');
  await page.getByLabel('Name').fill('Harbor Bakery');
  await page.getByLabel('City').fill('Haifa');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
});
