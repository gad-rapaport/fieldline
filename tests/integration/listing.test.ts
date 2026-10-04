import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtures, createRequest, login, resetData, startApp } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let admin: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool);
  admin = await login(ctx.app, 'admin@test.example');
});

describe('request listing', () => {
  it('searches by title, customer name and SR number', async () => {
    const a = await createRequest(admin, fx.customer, { title: 'Freezer alarm' });
    await createRequest(admin, fx.customer, { title: 'Door closer loose' });
    const byTitle = await admin.call('GET', '/api/requests?q=freez');
    expect(byTitle.json().items.map((r: { id: string }) => r.id)).toEqual([a.id]);
    const byRef = await admin.call('GET', `/api/requests?q=SR-${a.ref}`);
    expect(byRef.json().items.map((r: { id: string }) => r.id)).toEqual([a.id]);
    const byCustomer = await admin.call('GET', '/api/requests?q=acme');
    expect(byCustomer.json().total).toBe(2);
  });

  it('treats LIKE wildcards in search terms literally', async () => {
    await createRequest(admin, fx.customer, { title: 'Normal title' });
    const res = await admin.call('GET', '/api/requests?q=%25');
    expect(res.json().total).toBe(0);
  });

  it('filters by status, priority, assignee and overdue', async () => {
    const urgent = await createRequest(admin, fx.customer, {
      priority: 'urgent',
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await createRequest(admin, fx.customer, { priority: 'low' });
    const assigned = await admin.call('POST', `/api/requests/${urgent.id}/assign`, {
      expectedVersion: urgent.version,
      assigneeId: fx.tech1,
    });
    expect(assigned.statusCode).toBe(200);

    const q = async (qs: string) => (await admin.call('GET', `/api/requests?${qs}`)).json().total as number;
    expect(await q('status=new')).toBe(1);
    expect(await q('status=new,assigned')).toBe(2);
    expect(await q('priority=urgent')).toBe(1);
    expect(await q(`assignee=${fx.tech1}`)).toBe(1);
    expect(await q('assignee=unassigned')).toBe(1);
    expect(await q('overdue=true')).toBe(1);
  });

  it('paginates with a stable total', async () => {
    for (let i = 0; i < 7; i++) await createRequest(admin, fx.customer, { title: `Request number ${i}` });
    const p1 = (await admin.call('GET', '/api/requests?pageSize=3&page=1&sort=ref')).json();
    const p3 = (await admin.call('GET', '/api/requests?pageSize=3&page=3&sort=ref')).json();
    expect(p1.total).toBe(7);
    expect(p1.items).toHaveLength(3);
    expect(p3.items).toHaveLength(1);
    expect(p1.items[0].ref).toBeLessThan(p3.items[0].ref);
  });

  it('rejects unknown sort keys and oversized pages instead of passing them to SQL', async () => {
    expect((await admin.call('GET', '/api/requests?sort=title;DROP TABLE users')).statusCode).toBe(400);
    expect((await admin.call('GET', '/api/requests?pageSize=500')).statusCode).toBe(400);
    expect((await admin.call('GET', '/api/requests?status=bogus')).statusCode).toBe(400);
  });
});

describe('dashboard', () => {
  it('computes figures from the stored data', async () => {
    const past = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const a = await createRequest(admin, fx.customer, { priority: 'urgent', dueAt: past });
    await createRequest(admin, fx.customer, { priority: 'high' });
    const c = await createRequest(admin, fx.customer);
    await admin.call('POST', `/api/requests/${c.id}/transition`, {
      expectedVersion: c.version,
      to: 'cancelled',
      note: 'dup',
    });
    await admin.call('POST', `/api/requests/${a.id}/assign`, {
      expectedVersion: a.version,
      assigneeId: fx.tech1,
    });

    const d = (await admin.call('GET', '/api/dashboard')).json();
    expect(d.statusCounts).toMatchObject({ new: 1, assigned: 1, cancelled: 1 });
    expect(d.openTotal).toBe(2);
    expect(d.unassigned).toBe(1);
    expect(d.overdue).toBe(1);
    expect(d.openByPriority).toEqual({ low: 0, normal: 0, high: 1, urgent: 1 });
    expect(d.daily).toHaveLength(14);
    expect(d.daily.at(-1).created).toBe(3);
    const tom = d.workload.find((w: { name: string }) => w.name === 'Tom Tech');
    expect(tom).toMatchObject({ assigned: 1, overdue: 1 });
  });
});
