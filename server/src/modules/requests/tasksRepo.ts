import type { Db } from '../../db/pool.js';

export interface TaskRow {
  id: string;
  requestId: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
  isDone: boolean;
  doneAt: string | null;
  position: number;
  version: number;
  createdAt: string;
}

const SELECT = `
  SELECT t.id, t.request_id AS "requestId", t.title, t.assignee_id AS "assigneeId", u.full_name AS "assigneeName",
         t.is_done AS "isDone", t.done_at AS "doneAt", t.position, t.version, t.created_at AS "createdAt"
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

export async function listTasks(db: Db, requestId: string): Promise<TaskRow[]> {
  const { rows } = await db.query<TaskRow>(
    `${SELECT} WHERE t.request_id = $1 ORDER BY t.position, t.created_at`,
    [requestId],
  );
  return rows;
}

export async function getTask(db: Db, id: string): Promise<TaskRow | null> {
  const { rows } = await db.query<TaskRow>(`${SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertTask(
  db: Db,
  v: { requestId: string; title: string; assigneeId: string | null },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tasks (request_id, title, assignee_id, position)
     VALUES ($1, $2, $3, (SELECT coalesce(max(position), 0) + 1 FROM tasks WHERE request_id = $1))
     RETURNING id`,
    [v.requestId, v.title, v.assigneeId],
  );
  return rows[0]!.id;
}

export async function updateTask(
  db: Db,
  id: string,
  expectedVersion: number,
  patch: { title?: string | undefined; isDone?: boolean | undefined },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE tasks
        SET title = coalesce($3, title),
            is_done = coalesce($4, is_done),
            done_at = CASE
                        WHEN $4::boolean IS NULL THEN done_at
                        WHEN $4::boolean AND NOT is_done THEN now()
                        WHEN $4::boolean THEN done_at
                        ELSE NULL
                      END,
            version = version + 1
      WHERE id = $1 AND version = $2`,
    [id, expectedVersion, patch.title ?? null, patch.isDone ?? null],
  );
  return rowCount === 1;
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  await db.query('DELETE FROM tasks WHERE id = $1', [id]);
}
