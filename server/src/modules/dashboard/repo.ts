import type { Db } from '../../db/pool.js';
import type { Priority, Status } from '../../domain/requestStatus.js';

export interface Dashboard {
  generatedAt: string;
  timezone: string;
  statusCounts: Record<Status, number>;
  openByPriority: Record<Priority, number>;
  openTotal: number;
  unassigned: number;
  overdue: number;
  dueNext48h: number;
  resolvedLast7d: number;
  medianResolutionHours30d: number | null;
  daily: { day: string; created: number; resolved: number }[];
  workload: {
    userId: string;
    name: string;
    assigned: number;
    inProgress: number;
    onHold: number;
    overdue: number;
  }[];
}

/**
 * Every figure is computed from the live tables at request time. Day buckets use the configured business
 * timezone, not UTC, so "today" matches what the team sees on the wall clock.
 */
export async function loadDashboard(db: Db, timezone: string, days = 14): Promise<Dashboard> {
  const statusRes = await db.query<{ status: Status; n: number }>(
    'SELECT status, count(*)::int AS n FROM service_requests GROUP BY status',
  );
  const statusCounts = {
    new: 0,
    assigned: 0,
    in_progress: 0,
    on_hold: 0,
    resolved: 0,
    closed: 0,
    cancelled: 0,
  } satisfies Record<Status, number>;
  for (const r of statusRes.rows) statusCounts[r.status] = r.n;

  const prioRes = await db.query<{ priority: Priority; n: number }>(
    `SELECT priority, count(*)::int AS n FROM service_requests
      WHERE status IN ('new', 'assigned', 'in_progress', 'on_hold') GROUP BY priority`,
  );
  const openByPriority = { low: 0, normal: 0, high: 0, urgent: 0 } satisfies Record<Priority, number>;
  for (const r of prioRes.rows) openByPriority[r.priority] = r.n;

  const kpi = await db.query<{
    unassigned: number;
    overdue: number;
    due_next_48h: number;
    resolved_7d: number;
    median_hours: number | null;
  }>(
    `SELECT
       count(*) FILTER (WHERE status = 'new')::int AS unassigned,
       count(*) FILTER (WHERE status IN ('new', 'assigned', 'in_progress', 'on_hold') AND due_at < now())::int AS overdue,
       count(*) FILTER (WHERE status IN ('new', 'assigned', 'in_progress', 'on_hold')
                          AND due_at >= now() AND due_at < now() + interval '48 hours')::int AS due_next_48h,
       count(*) FILTER (WHERE resolved_at >= now() - interval '7 days')::int AS resolved_7d,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at) / 3600)
          FILTER (WHERE resolved_at >= now() - interval '30 days'))::float8 AS median_hours
     FROM service_requests`,
  );
  const k = kpi.rows[0]!;

  const dailyRes = await db.query<{ day: string; created: number; resolved: number }>(
    `WITH days AS (
       SELECT generate_series(
                ((now() AT TIME ZONE $1)::date - ($2::int - 1))::timestamp,
                (now() AT TIME ZONE $1)::date::timestamp,
                interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            (SELECT count(*) FROM service_requests r WHERE (r.created_at AT TIME ZONE $1)::date = d.day)::int AS created,
            (SELECT count(*) FROM service_requests r WHERE (r.resolved_at AT TIME ZONE $1)::date = d.day)::int AS resolved
       FROM days d ORDER BY d.day`,
    [timezone, days],
  );

  const workloadRes = await db.query<Dashboard['workload'][number]>(
    `SELECT u.id AS "userId", u.full_name AS name,
            count(r.id) FILTER (WHERE r.status = 'assigned')::int AS assigned,
            count(r.id) FILTER (WHERE r.status = 'in_progress')::int AS "inProgress",
            count(r.id) FILTER (WHERE r.status = 'on_hold')::int AS "onHold",
            count(r.id) FILTER (WHERE r.status IN ('assigned', 'in_progress', 'on_hold') AND r.due_at < now())::int
              AS overdue
       FROM users u
       LEFT JOIN service_requests r ON r.assignee_id = u.id
      WHERE u.role = 'technician' AND u.is_active
      GROUP BY u.id
      ORDER BY u.full_name`,
  );

  return {
    generatedAt: new Date().toISOString(),
    timezone,
    statusCounts,
    openByPriority,
    openTotal: statusCounts.new + statusCounts.assigned + statusCounts.in_progress + statusCounts.on_hold,
    unassigned: k.unassigned,
    overdue: k.overdue,
    dueNext48h: k.due_next_48h,
    resolvedLast7d: k.resolved_7d,
    medianResolutionHours30d: k.median_hours === null ? null : Math.round(k.median_hours * 10) / 10,
    daily: dailyRes.rows,
    workload: workloadRes.rows,
  };
}
