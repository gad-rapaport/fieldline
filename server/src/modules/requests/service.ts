import type { Pool, PoolClient } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { AppError, forbidden, notFound, versionConflict } from '../../domain/errors.js';
import type { Actor } from '../../domain/permissions.js';
import { allowedActionsFor, policy } from '../../domain/permissions.js';
import type { Priority, Status } from '../../domain/requestStatus.js';
import { ASSIGNMENT_DRIVEN, canTransition, isEditable, noteRequiredFor } from '../../domain/requestStatus.js';
import { recordActivity } from '../activity/repo.js';
import { getCustomer } from '../customers/repo.js';
import { getUser } from '../users/repo.js';
import * as repo from './repo.js';
import type { LockedRequest, RequestFilter } from './repo.js';
import * as tasksRepo from './tasksRepo.js';

export const STATUS_LABELS: Record<Status, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function listRequests(pool: Pool, filter: RequestFilter) {
  return repo.listRequests(pool, filter);
}

export async function getRequestDetail(db: Pool | PoolClient, actor: Actor, id: string) {
  const request = await repo.getRequest(db, id);
  if (!request) throw notFound('Service request');
  const [tasks, notes] = await Promise.all([tasksRepo.listTasks(db, id), repo.listNotes(db, id)]);
  const allowed = allowedActionsFor(actor, request, isEditable(request.status));
  return { request, tasks, notes, allowed };
}

/** Lock, then run the coarse role gate and the optimistic version check in a fixed order. */
async function lockForMutation(tx: PoolClient, actor: Actor, id: string, expectedVersion: number) {
  const locked = await repo.lockRequest(tx, id, 'update');
  if (!locked) throw notFound('Service request');
  if (!policy.mutateRequests(actor)) throw forbidden();
  if (locked.version !== expectedVersion) {
    throw versionConflict((await getRequestDetail(tx, actor, id)).request);
  }
  return locked;
}

async function applyPatch(tx: PoolClient, locked: LockedRequest, patch: repo.RequestPatch) {
  const version = await repo.patchRequest(tx, locked.id, locked.version, patch);
  // The row is locked FOR UPDATE, so a mismatch here would mean a bug rather than a race.
  if (version === null) throw new Error(`Request ${locked.id} changed while locked`);
  return version;
}

export interface CreateRequestInput {
  customerId: string;
  title: string;
  description: string;
  priority: Priority;
  dueAt: string | null;
  tasks: string[];
}

export async function createRequest(pool: Pool, actor: Actor, input: CreateRequestInput) {
  if (!policy.createRequest(actor)) throw forbidden();
  const id = await withTransaction(pool, async (tx) => {
    const customer = await getCustomer(tx, input.customerId);
    if (!customer) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Choose an existing customer.', {
        fields: { customerId: 'Choose an existing customer.' },
      });
    }
    const created = await repo.insertRequest(tx, { ...input, createdBy: actor.id });
    for (const title of input.tasks) {
      await tasksRepo.insertTask(tx, { requestId: created.id, title, assigneeId: null });
    }
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: created.id,
      action: 'request.created',
      summary: `Opened SR-${created.ref} for ${customer.name}`,
      details: { priority: input.priority, tasks: input.tasks.length },
    });
    return created.id;
  });
  return getRequestDetail(pool, actor, id);
}

export interface UpdateRequestInput {
  title?: string | undefined;
  description?: string | undefined;
  priority?: Priority | undefined;
  dueAt?: string | null | undefined;
}

export async function updateRequest(
  pool: Pool,
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: UpdateRequestInput,
) {
  await withTransaction(pool, async (tx) => {
    const locked = await lockForMutation(tx, actor, id, expectedVersion);
    if (!isEditable(locked.status)) {
      throw new AppError(
        422,
        'REQUEST_LOCKED',
        `A ${STATUS_LABELS[locked.status].toLowerCase()} request cannot be edited.`,
      );
    }
    if (!policy.updateRequest(actor, locked))
      throw forbidden('Only the assigned technician or an admin can edit this request.');
    const current = (await repo.getRequest(tx, id))!;
    if (
      input.priority !== undefined &&
      input.priority !== current.priority &&
      !policy.changePriority(actor)
    ) {
      throw forbidden('Only an admin can change priority.');
    }
    const changed = (['title', 'description', 'priority', 'dueAt'] as const).filter((k) => {
      if (input[k] === undefined) return false;
      if (k === 'dueAt') return normaliseDate(input.dueAt) !== normaliseDate(current.dueAt);
      return input[k] !== current[k];
    });
    if (changed.length === 0) return;
    await applyPatch(tx, locked, input);
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: id,
      action: 'request.updated',
      summary: `Updated ${changed.map((c) => (c === 'dueAt' ? 'due date' : c)).join(', ')}`,
      details: {
        changed,
        ...(changed.includes('priority') ? { priority: { from: current.priority, to: input.priority } } : {}),
      },
    });
  });
  return getRequestDetail(pool, actor, id);
}

function normaliseDate(v: string | Date | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return new Date(v).getTime();
}

export async function assignRequest(
  pool: Pool,
  actor: Actor,
  id: string,
  expectedVersion: number,
  assigneeId: string | null,
) {
  await withTransaction(pool, async (tx) => {
    const locked = await lockForMutation(tx, actor, id, expectedVersion);

    if (assigneeId === null) {
      if (!policy.assignRequest(actor)) throw forbidden('Only an admin can unassign a request.');
      if (locked.status !== 'assigned') {
        throw new AppError(
          422,
          'ILLEGAL_TRANSITION',
          'Only a request that has not been started can be unassigned.',
        );
      }
      await applyPatch(tx, locked, { assigneeId: null, status: 'new' });
      await recordActivity(tx, {
        actorId: actor.id,
        entityType: 'request',
        entityId: id,
        action: 'request.unassigned',
        summary: 'Returned to the unassigned queue',
        details: { from: locked.assigneeId },
      });
      return;
    }

    const isClaim = assigneeId === actor.id && policy.claimRequest(actor, locked);
    if (!policy.assignRequest(actor) && !isClaim) {
      throw forbidden('Technicians can only claim unassigned new requests for themselves.');
    }
    const assignee = await getUser(tx, assigneeId);
    if (!assignee || !assignee.isActive || assignee.role !== 'technician') {
      throw new AppError(422, 'INVALID_ASSIGNEE', 'Requests can be assigned only to active technicians.', {
        fields: { assigneeId: 'Choose an active technician.' },
      });
    }
    if (!['new', 'assigned', 'in_progress', 'on_hold'].includes(locked.status)) {
      throw new AppError(
        422,
        'ILLEGAL_TRANSITION',
        `A ${STATUS_LABELS[locked.status].toLowerCase()} request cannot be reassigned.`,
      );
    }
    if (locked.assigneeId === assigneeId) return;
    const status: Status = locked.status === 'new' ? 'assigned' : locked.status;
    await applyPatch(tx, locked, { assigneeId, status });
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: id,
      action: isClaim ? 'request.claimed' : 'request.assigned',
      summary: isClaim ? `${assignee.fullName} claimed the request` : `Assigned to ${assignee.fullName}`,
      details: { from: locked.assigneeId, to: assigneeId },
    });
  });
  return getRequestDetail(pool, actor, id);
}

export async function transitionRequest(
  pool: Pool,
  actor: Actor,
  id: string,
  expectedVersion: number,
  to: Status,
  note: string | undefined,
) {
  await withTransaction(pool, async (tx) => {
    const locked = await lockForMutation(tx, actor, id, expectedVersion);
    if (ASSIGNMENT_DRIVEN.includes(to)) {
      throw new AppError(422, 'ILLEGAL_TRANSITION', 'Use assignment to move a request to New or Assigned.');
    }
    if (!canTransition(locked.status, to)) {
      throw new AppError(
        422,
        'ILLEGAL_TRANSITION',
        `A request cannot move from ${STATUS_LABELS[locked.status]} to ${STATUS_LABELS[to]}.`,
        { from: locked.status, to },
      );
    }
    if (!policy.transition(actor, locked, to)) {
      throw forbidden(
        to === 'closed' || to === 'cancelled'
          ? `Only an admin can mark a request ${STATUS_LABELS[to].toLowerCase()}.`
          : 'Only the assigned technician or an admin can change this status.',
      );
    }
    const noteKind = noteRequiredFor(to);
    if (noteKind && !note) {
      throw new AppError(422, 'NOTE_REQUIRED', `Add a ${noteKind} note to explain this change.`, {
        fields: { note: `A ${noteKind} note is required.` },
      });
    }
    if (to === 'resolved') {
      // Safe against concurrent task edits: they hold FOR SHARE on this row, which conflicts with our FOR UPDATE.
      const open = await repo.countOpenTasks(tx, id);
      if (open > 0) {
        throw new AppError(
          422,
          'TASKS_OPEN',
          `Complete or remove the ${open} open task${open === 1 ? '' : 's'} before resolving.`,
          { openTasks: open },
        );
      }
    }
    await applyPatch(tx, locked, {
      status: to,
      resolvedAt:
        to === 'resolved' ? 'now' : locked.status === 'resolved' && to === 'in_progress' ? null : undefined,
    });
    if (note) {
      await repo.insertNote(tx, {
        requestId: id,
        authorId: actor.id,
        kind: noteKind ?? 'comment',
        body: note,
      });
    }
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: id,
      action: 'request.status_changed',
      summary: `Status ${STATUS_LABELS[locked.status]} → ${STATUS_LABELS[to]}`,
      details: { from: locked.status, to },
    });
  });
  return getRequestDetail(pool, actor, id);
}

export async function addNote(pool: Pool, actor: Actor, requestId: string, body: string) {
  if (!policy.addNote(actor)) throw forbidden();
  await withTransaction(pool, async (tx) => {
    const locked = await repo.lockRequest(tx, requestId, 'share');
    if (!locked) throw notFound('Service request');
    if (locked.status === 'closed' || locked.status === 'cancelled') {
      throw new AppError(422, 'REQUEST_LOCKED', 'Notes cannot be added to a closed or cancelled request.');
    }
    await repo.insertNote(tx, { requestId, authorId: actor.id, kind: 'comment', body });
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: requestId,
      action: 'request.note_added',
      summary: 'Added a note',
    });
  });
  return repo.listNotes(pool, requestId);
}

/** Shared guard for task changes: holds FOR SHARE on the parent so a concurrent resolve waits. */
async function lockForTaskChange(tx: PoolClient, actor: Actor, requestId: string) {
  const locked = await repo.lockRequest(tx, requestId, 'share');
  if (!locked) throw notFound('Service request');
  if (!policy.mutateRequests(actor)) throw forbidden();
  if (!isEditable(locked.status)) {
    throw new AppError(
      422,
      'REQUEST_LOCKED',
      `Tasks of a ${STATUS_LABELS[locked.status].toLowerCase()} request are read-only.`,
    );
  }
  if (!policy.manageTasks(actor, locked))
    throw forbidden('Only the assigned technician or an admin can change tasks.');
  return locked;
}

export async function addTask(pool: Pool, actor: Actor, requestId: string, title: string) {
  return withTransaction(pool, async (tx) => {
    const locked = await lockForTaskChange(tx, actor, requestId);
    const taskId = await tasksRepo.insertTask(tx, { requestId, title, assigneeId: locked.assigneeId });
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'task',
      entityId: taskId,
      action: 'task.created',
      summary: `Added task "${title}"`,
    });
    return (await tasksRepo.getTask(tx, taskId))!;
  });
}

export async function updateTask(
  pool: Pool,
  actor: Actor,
  taskId: string,
  expectedVersion: number,
  patch: { title?: string | undefined; isDone?: boolean | undefined },
) {
  return withTransaction(pool, async (tx) => {
    const task = await tasksRepo.getTask(tx, taskId);
    if (!task) throw notFound('Task');
    await lockForTaskChange(tx, actor, task.requestId);
    const ok = await tasksRepo.updateTask(tx, taskId, expectedVersion, patch);
    if (!ok) throw versionConflict(await tasksRepo.getTask(tx, taskId));
    const action =
      patch.isDone === undefined || patch.isDone === task.isDone
        ? 'task.renamed'
        : patch.isDone
          ? 'task.completed'
          : 'task.reopened';
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'task',
      entityId: taskId,
      action,
      summary:
        action === 'task.completed'
          ? `Completed "${task.title}"`
          : action === 'task.reopened'
            ? `Reopened "${task.title}"`
            : `Renamed task to "${patch.title ?? task.title}"`,
    });
    return (await tasksRepo.getTask(tx, taskId))!;
  });
}

export async function deleteTask(pool: Pool, actor: Actor, taskId: string) {
  await withTransaction(pool, async (tx) => {
    const task = await tasksRepo.getTask(tx, taskId);
    if (!task) throw notFound('Task');
    await lockForTaskChange(tx, actor, task.requestId);
    await tasksRepo.deleteTask(tx, taskId);
    // Logged against the request: the task row no longer exists to anchor a timeline entry.
    await recordActivity(tx, {
      actorId: actor.id,
      entityType: 'request',
      entityId: task.requestId,
      action: 'task.deleted',
      summary: `Removed task "${task.title}"`,
    });
  });
}
