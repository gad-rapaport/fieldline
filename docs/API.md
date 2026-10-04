# API

JSON over HTTP, same origin as the web app. All endpoints except sign-in, the session probe and health checks
require the `fl_session` cookie. State-changing requests (POST, PUT, PATCH, DELETE) also require
`X-CSRF-Token` with the token returned by sign-in or the session probe.

## Conventions

- **Errors** always have this shape, with a stable `code` for programs and a `message` for people:

  ```json
  {
    "error": { "code": "VERSION_CONFLICT", "message": "...", "details": { "current": {} } },
    "requestId": "..."
  }
  ```

  | Status | Codes                                                                                     |
  | ------ | ----------------------------------------------------------------------------------------- |
  | 400    | `VALIDATION_FAILED` (with `details.fields`)                                               |
  | 401    | `UNAUTHENTICATED`                                                                         |
  | 403    | `FORBIDDEN`, `CSRF_REJECTED`                                                              |
  | 404    | `NOT_FOUND`                                                                               |
  | 409    | `VERSION_CONFLICT` (with `details.current`), `DUPLICATE`                                  |
  | 422    | `ILLEGAL_TRANSITION`, `TASKS_OPEN`, `NOTE_REQUIRED`, `REQUEST_LOCKED`, `INVALID_ASSIGNEE` |
  | 429    | `RATE_LIMITED`                                                                            |
  | 500    | `INTERNAL` (no internals, quote `requestId`)                                              |

- **Optimistic concurrency:** updates send `expectedVersion`. A mismatch returns 409 and the current record.
- **Lists** accept `page` (1-10000) and `pageSize` (1-100) and return `{ items, total, page, pageSize }`.
- **Times** are ISO 8601 instants with offset. `dueAt` must include an offset.
- Every response carries `X-Request-Id`; API responses are `Cache-Control: no-store`.

## Auth

| Method | Path                | Body                  | Notes                                                                             |
| ------ | ------------------- | --------------------- | --------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`   | `{ email, password }` | Sets cookie, returns `{ user, csrfToken }`. Rate limited per address and account. |
| POST   | `/api/auth/logout`  |                       | Deletes the session. 204.                                                         |
| GET    | `/api/auth/session` |                       | `{ user, csrfToken }` or `{ user: null, csrfToken: null }`. Always 200.           |

## Requests

| Method | Path                           | Who                                               | Notes                                                                                                                                                                                                                                                   |
| ------ | ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/requests`                | all                                               | Query: `q` (title, customer, `SR-1042`), `status` and `priority` (comma lists), `assignee` (`me`, `unassigned`, user id), `customerId`, `overdue=true`, `sort` (`created`, `updated`, `due`, `priority`, `ref`, `customer`, prefix `-` for descending). |
| POST   | `/api/requests`                | admin, technician                                 | `{ customerId, title, description?, priority?, dueAt?, tasks?: string[] }`. 201 with the bundle.                                                                                                                                                        |
| GET    | `/api/requests/:id`            | all                                               | Bundle: `{ request, tasks, notes, allowed }`. `allowed` lists what the caller may do.                                                                                                                                                                   |
| PATCH  | `/api/requests/:id`            | admin, assigned technician                        | `{ expectedVersion, title?, description?, priority? (admin), dueAt? }`. Unknown fields rejected.                                                                                                                                                        |
| POST   | `/api/requests/:id/assign`     | admin; technician for self-claim of a new request | `{ expectedVersion, assigneeId \| null }`. `null` unassigns (admin, from `assigned` only).                                                                                                                                                              |
| POST   | `/api/requests/:id/transition` | see policy                                        | `{ expectedVersion, to, note? }`. `note` required for `resolved`, `on_hold`, `cancelled`.                                                                                                                                                               |
| GET    | `/api/requests/:id/activity`   | all                                               | Timeline including task events.                                                                                                                                                                                                                         |
| POST   | `/api/requests/:id/notes`      | admin, technician                                 | `{ body }`.                                                                                                                                                                                                                                             |
| POST   | `/api/requests/:id/tasks`      | admin, assigned technician                        | `{ title }`.                                                                                                                                                                                                                                            |
| PATCH  | `/api/tasks/:id`               | admin, assigned technician                        | `{ expectedVersion, title?, isDone? }`.                                                                                                                                                                                                                 |
| DELETE | `/api/tasks/:id`               | admin, assigned technician                        | 204.                                                                                                                                                                                                                                                    |

### Status transitions

| From              | Allowed targets             | Through                                  |
| ----------------- | --------------------------- | ---------------------------------------- |
| new               | assigned, cancelled         | assign; transition (admin)               |
| assigned          | in_progress, new, cancelled | transition; unassign; transition (admin) |
| in_progress       | on_hold, resolved           | transition                               |
| on_hold           | in_progress, cancelled      | transition; transition (admin)           |
| resolved          | closed (admin), in_progress | transition                               |
| closed, cancelled | none                        |                                          |

## Customers

| Method | Path                    | Who               | Notes                                                                                                                                        |
| ------ | ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/customers`        | all               | Query: `q`, `city`, `sort` (`name`, `city`, `open`, `created`, `-` prefix). Contact fields are `null` and `contactHidden: true` for viewers. |
| GET    | `/api/customers/cities` | all               | Distinct cities for the filter.                                                                                                              |
| GET    | `/api/customers/:id`    | all               | `{ customer, recentRequests }`.                                                                                                              |
| POST   | `/api/customers`        | admin, technician | `{ name, city, contactName?, email?, phone?, address?, notes? }`. 409 `DUPLICATE` for the same name and city.                                |
| PUT    | `/api/customers/:id`    | admin             | Full replacement plus `expectedVersion`.                                                                                                     |

## Other

| Method | Path             | Who    | Notes                                                                     |
| ------ | ---------------- | ------ | ------------------------------------------------------------------------- |
| GET    | `/api/dashboard` | all    | Computed figures; see [ARCHITECTURE.md](ARCHITECTURE.md).                 |
| GET    | `/api/users`     | all    | Active users with workload. `email` is `null` unless the caller is admin. |
| GET    | `/api/activity`  | admin  | Query: `entityType` (comma list), `actorId`, paging.                      |
| GET    | `/healthz`       | public | Process is up.                                                            |
| GET    | `/readyz`        | public | Database reachable; 503 otherwise.                                        |

## Example

```bash
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"admin@fieldline.test","password":"<from .env>"}' http://127.0.0.1:8101/api/auth/login
# take csrfToken from the response
curl -b jar -H 'content-type: application/json' -H 'x-csrf-token: <token>' \
  -d '{"customerId":"<id>","title":"Boiler pressure low","priority":"high"}' http://127.0.0.1:8101/api/requests
```
