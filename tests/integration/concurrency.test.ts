import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtures, createRequest, login, resetData, startApp } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let admin: Session;
let admin2: Session;
let tech: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool);
  admin = await login(ctx.app, 'admin@test.example');
  admin2 = await login(ctx.app, 'admin@test.example'); // a second browser tab / device
  tech = await login(ctx.app, 'tech1@test.example');
});

describe('optimistic concurrency', () => {
  it('refuses a stale edit instead of silently overwriting, and returns the current record', async () => {
    const r = await createRequest(admin, fx.customer);
    const first = await admin.call('PATCH', `/api/requests/${r.id}`, {
      expectedVersion: r.version,
      title: 'Edited in tab one',
    });
    expect(first.statusCode).toBe(200);

    const stale = await admin2.call('PATCH', `/api/requests/${r.id}`, {
      expectedVersion: r.version,
      title: 'Edited in tab two',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');
    expect(stale.json().error.details.current).toMatchObject({
      title: 'Edited in tab one',
      version: r.version + 1,
    });

    const stored = await admin.call('GET', `/api/requests/${r.id}`);
    expect(stored.json().request.title).toBe('Edited in tab one');
  });

  it('lets exactly one of many simultaneous edits win', async () => {
    const r = await createRequest(admin, fx.customer);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        admin.call('PATCH', `/api/requests/${r.id}`, {
          expectedVersion: r.version,
          title: `Parallel edit ${i}`,
        }),
      ),
    );
    const codes = results.map((x) => x.statusCode).sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    const { rows } = await ctx.pool.query('SELECT version FROM service_requests WHERE id = $1', [r.id]);
    expect(rows[0].version).toBe(r.version + 1);
  });

  it('protects customers the same way', async () => {
    const one = await admin.call('PUT', `/api/customers/${fx.customer}`, {
      expectedVersion: 1,
      name: 'Acme Renamed',
      city: 'Haifa',
    });
    expect(one.statusCode).toBe(200);
    const two = await admin2.call('PUT', `/api/customers/${fx.customer}`, {
      expectedVersion: 1,
      name: 'Acme Other',
      city: 'Haifa',
    });
    expect(two.statusCode).toBe(409);
    expect(two.json().error.details.current.name).toBe('Acme Renamed');
  });

  it('serialises task completion against resolution, so no request is resolved with an open task', async () => {
    // Repeat to give a race a real chance to show up.
    for (let round = 0; round < 5; round++) {
      const r = await createRequest(admin, fx.customer, { tasks: ['Only task'] });
      let res = await admin.call('POST', `/api/requests/${r.id}/assign`, {
        expectedVersion: r.version,
        assigneeId: fx.tech1,
      });
      res = await tech.call('POST', `/api/requests/${r.id}/transition`, {
        expectedVersion: res.json().request.version,
        to: 'in_progress',
      });
      const b = res.json();
      const task = b.tasks[0];
      await tech.call('PATCH', `/api/tasks/${task.id}`, { expectedVersion: task.version, isDone: true });

      // Reopen the task and resolve at the same moment.
      const [reopen, resolve] = await Promise.all([
        tech.call('PATCH', `/api/tasks/${task.id}`, { expectedVersion: task.version + 1, isDone: false }),
        tech.call('POST', `/api/requests/${r.id}/transition`, {
          expectedVersion: b.request.version,
          to: 'resolved',
          note: 'Done',
        }),
      ]);
      const { rows } = await ctx.pool.query(
        `SELECT r.status, bool_and(t.is_done) AS all_done FROM service_requests r JOIN tasks t ON t.request_id = r.id
          WHERE r.id = $1 GROUP BY r.status`,
        [r.id],
      );
      // Either order is acceptable; the forbidden outcome is "resolved with an open task".
      expect(rows[0].status === 'resolved' && rows[0].all_done === false).toBe(false);
      expect([reopen.statusCode, resolve.statusCode]).toContain(200);
    }
  });
});
