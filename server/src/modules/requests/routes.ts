import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { requireAuth } from '../../http/auth.js';
import {
  csvEnum,
  expectedVersion,
  optionalText,
  pagination,
  parse,
  uuidParam,
} from '../../http/validation.js';
import { PRIORITIES, STATUSES } from '../../domain/requestStatus.js';
import { listForRequest } from '../activity/repo.js';
import { REQUEST_SORTS } from './repo.js';
import type { RequestSort } from './repo.js';
import * as service from './service.js';

const listQuery = z.object({
  q: optionalText(100),
  status: csvEnum(STATUSES),
  priority: csvEnum(PRIORITIES),
  assignee: z.union([z.literal('me'), z.literal('unassigned'), z.uuid()]).optional(),
  customerId: z.uuid().optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(Object.keys(REQUEST_SORTS) as [RequestSort, ...RequestSort[]]).default('-created'),
  ...pagination,
});

// Full ISO timestamp with offset only: the client decides the wall-clock meaning, the server stores an instant.
const dueAt = z.iso.datetime({ offset: true, message: 'Use a full date and time.' }).nullable();

const title = z.string().trim().min(3, 'Enter at least 3 characters.').max(160);
const taskTitle = z.string().trim().min(2, 'Enter at least 2 characters.').max(160);

const createBody = z.object({
  customerId: z.uuid('Choose a customer.'),
  title,
  description: z.string().trim().max(5000).default(''),
  priority: z.enum(PRIORITIES).default('normal'),
  dueAt: dueAt.default(null),
  tasks: z.array(taskTitle).max(20, 'At most 20 tasks can be added at once.').default([]),
});

const updateBody = z
  .object({
    expectedVersion,
    title: title.optional(),
    description: z.string().trim().max(5000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueAt: dueAt.optional(),
  })
  .strict();

const assignBody = z.object({ expectedVersion, assigneeId: z.uuid().nullable() });
const transitionBody = z.object({
  expectedVersion,
  to: z.enum(STATUSES),
  note: optionalText(2000),
});
const noteBody = z.object({ body: z.string().trim().min(1, 'Write something first.').max(2000) });
const taskBody = z.object({ title: taskTitle });
const taskPatchBody = z
  .object({ expectedVersion, title: taskTitle.optional(), isDone: z.boolean().optional() })
  .strict();

export function requestRoutes(app: FastifyInstance, pool: Pool) {
  app.get('/api/requests', async (req) => {
    const actor = requireAuth(req);
    const { assignee, ...q } = parse(listQuery, req.query);
    return service.listRequests(pool, {
      ...q,
      unassigned: assignee === 'unassigned',
      assigneeId: assignee === 'me' ? actor.id : assignee === 'unassigned' ? undefined : assignee,
    });
  });

  app.post('/api/requests', async (req, reply) => {
    const actor = requireAuth(req);
    const detail = await service.createRequest(pool, actor, parse(createBody, req.body));
    return reply.code(201).send(detail);
  });

  app.get('/api/requests/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    return service.getRequestDetail(pool, actor, id);
  });

  app.patch('/api/requests/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const { expectedVersion: v, ...patch } = parse(updateBody, req.body);
    return service.updateRequest(pool, actor, id, v, patch);
  });

  app.post('/api/requests/:id/assign', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const body = parse(assignBody, req.body);
    return service.assignRequest(pool, actor, id, body.expectedVersion, body.assigneeId);
  });

  app.post('/api/requests/:id/transition', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const body = parse(transitionBody, req.body);
    return service.transitionRequest(pool, actor, id, body.expectedVersion, body.to, body.note);
  });

  app.get('/api/requests/:id/activity', async (req) => {
    requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    return { items: await listForRequest(pool, id) };
  });

  app.post('/api/requests/:id/notes', async (req, reply) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const items = await service.addNote(pool, actor, id, parse(noteBody, req.body).body);
    return reply.code(201).send({ items });
  });

  app.post('/api/requests/:id/tasks', async (req, reply) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const task = await service.addTask(pool, actor, id, parse(taskBody, req.body).title);
    return reply.code(201).send(task);
  });

  app.patch('/api/tasks/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const { expectedVersion: v, ...patch } = parse(taskPatchBody, req.body);
    return service.updateTask(pool, actor, id, v, patch);
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    await service.deleteTask(pool, actor, id);
    return reply.code(204).send();
  });
}
