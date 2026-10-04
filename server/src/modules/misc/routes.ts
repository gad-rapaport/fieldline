import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Pool } from '../../db/pool.js';
import { forbidden } from '../../domain/errors.js';
import { policy } from '../../domain/permissions.js';
import { requireAuth } from '../../http/auth.js';
import { csvEnum, pagination, parse } from '../../http/validation.js';
import { listActivity } from '../activity/repo.js';
import { loadDashboard } from '../dashboard/repo.js';
import { listTeam } from '../users/repo.js';

const activityQuery = z.object({
  entityType: csvEnum(['customer', 'request', 'task', 'session'] as const),
  actorId: z.uuid().optional(),
  ...pagination,
});

/** Read-only endpoints: dashboard, team, activity log. */
export function miscRoutes(app: FastifyInstance, pool: Pool, config: Config) {
  app.get('/api/dashboard', async (req) => {
    requireAuth(req);
    return loadDashboard(pool, config.APP_TIMEZONE);
  });

  app.get('/api/users', async (req) => {
    const actor = requireAuth(req);
    const team = await listTeam(pool);
    const showEmail = policy.viewUserEmails(actor);
    return { items: team.map((u) => ({ ...u, email: showEmail ? u.email : null })) };
  });

  app.get('/api/activity', async (req) => {
    const actor = requireAuth(req);
    if (!policy.readActivityLog(actor)) throw forbidden('Only admins can view the full activity log.');
    return listActivity(pool, parse(activityQuery, req.query));
  });
}
