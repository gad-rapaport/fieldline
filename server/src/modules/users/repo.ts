import type { Db } from '../../db/pool.js';
import type { Role } from '../../domain/permissions.js';

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export async function findUserForLogin(db: Db, email: string) {
  const { rows } = await db.query<UserRow & { passwordHash: string }>(
    `SELECT id, email, full_name AS "fullName", role, is_active AS "isActive", password_hash AS "passwordHash"
       FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT id, email, full_name AS "fullName", role, is_active AS "isActive" FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface TeamMemberRow extends UserRow {
  openRequests: number;
  inProgress: number;
  overdue: number;
}

export async function listTeam(db: Db): Promise<TeamMemberRow[]> {
  const { rows } = await db.query<TeamMemberRow>(
    `SELECT u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive",
            count(r.id) FILTER (WHERE r.status IN ('assigned', 'in_progress', 'on_hold'))::int AS "openRequests",
            count(r.id) FILTER (WHERE r.status = 'in_progress')::int AS "inProgress",
            count(r.id) FILTER (WHERE r.status IN ('assigned', 'in_progress', 'on_hold') AND r.due_at < now())::int
              AS overdue
       FROM users u
       LEFT JOIN service_requests r ON r.assignee_id = u.id
      WHERE u.is_active
      GROUP BY u.id
      ORDER BY u.role, u.full_name`,
  );
  return rows;
}
