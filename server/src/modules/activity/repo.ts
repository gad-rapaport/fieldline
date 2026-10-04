import type { Db } from '../../db/pool.js';

export type EntityType = 'customer' | 'request' | 'task' | 'session';

export interface ActivityInput {
  actorId: string | null;
  entityType: EntityType;
  entityId: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}

/** Always called with the same client as the change it describes, so the log commits or rolls back with it. */
export async function recordActivity(db: Db, input: ActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO activity_log (actor_id, entity_type, entity_id, action, summary, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.actorId, input.entityType, input.entityId, input.action, input.summary, input.details ?? {}],
  );
}

export interface ActivityRow {
  id: number;
  actorId: string | null;
  actorName: string | null;
  entityType: EntityType;
  entityId: string | null;
  action: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const SELECT = `
  SELECT a.id, a.actor_id AS "actorId", u.full_name AS "actorName", a.entity_type AS "entityType",
         a.entity_id AS "entityId", a.action, a.summary, a.details, a.created_at AS "createdAt"
    FROM activity_log a
    LEFT JOIN users u ON u.id = a.actor_id`;

export async function listForEntity(db: Db, entityType: EntityType, entityId: string, limit = 50) {
  const { rows } = await db.query<ActivityRow>(
    `${SELECT} WHERE a.entity_type = $1 AND a.entity_id = $2 ORDER BY a.id DESC LIMIT $3`,
    [entityType, entityId, limit],
  );
  return rows;
}

/** Request timeline also includes events on the request's tasks. */
export async function listForRequest(db: Db, requestId: string, limit = 100) {
  const { rows } = await db.query<ActivityRow>(
    `${SELECT}
      WHERE (a.entity_type = 'request' AND a.entity_id = $1)
         OR (a.entity_type = 'task' AND a.entity_id IN (SELECT id FROM tasks WHERE request_id = $1))
      ORDER BY a.id DESC
      LIMIT $2`,
    [requestId, limit],
  );
  return rows;
}

export interface ActivityFilter {
  entityType?: EntityType[] | undefined;
  actorId?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listActivity(db: Db, f: ActivityFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.entityType?.length) {
    params.push(f.entityType);
    where.push(`a.entity_type = ANY($${params.length})`);
  }
  if (f.actorId) {
    params.push(f.actorId);
    where.push(`a.actor_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM activity_log a ${whereSql}`,
    params,
  );
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const { rows } = await db.query<ActivityRow>(
    `${SELECT} ${whereSql} ORDER BY a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows, total: countRes.rows[0]!.total, page: f.page, pageSize: f.pageSize };
}
