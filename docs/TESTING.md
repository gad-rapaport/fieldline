# Testing

## Strategy

| Layer       | Tool                             | What it proves                                                                                                                                       | Runs against                                        |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Unit        | Vitest                           | Status machine, permission policy, UI/server agreement on allowed actions, input parsing, query building, axis maths                                 | Pure functions                                      |
| Integration | Vitest + Fastify `inject`        | HTTP contract, authentication, CSRF, authorisation per role, business rules, transactions, concurrency, migrations, seed idempotency, static hosting | A real PostgreSQL 18 database created fresh per run |
| E2E         | Playwright (Chromium) + axe-core | Main user journeys, keyboard use, phone layout, no console errors, no serious accessibility violations                                               | The Docker demo stack                               |

Tests assert behaviour through public interfaces (HTTP, the database state) rather than mirroring the
implementation. Concurrency tests run requests in parallel against PostgreSQL because mocks cannot show races.

## Commands

```powershell
./scripts/ops.ps1 test                  # format, lint, types, unit, integration (starts the dev database)
npm run test:unit
$env:TEST_DATABASE_URL = '<from .env>'; npm run test:integration
./scripts/ops.ps1 start; npm run test:e2e
npm run screenshots                     # regenerates docs/screenshots from the running demo
node scripts/measure.mjs                # latency probe of the main read endpoints
```

The integration suite drops and recreates a database named `fieldline_test` on the server in
`TEST_DATABASE_URL`. It never touches the demo stack's database.

## Scenarios

### Integration (49 tests)

- **Auth:** cookie flags; only token hashes stored; same error for unknown account and wrong password;
  inactive users refused; CSRF token and Origin enforced; logout and expiry invalidate the session; sign-ins
  logged; rate limit returns 429 after the configured attempts; CSP and `no-store` headers; malformed JSON
  returns 400 without stack traces.
- **Permissions:** viewer mutations all 403 and nothing changes; viewer never receives contact details;
  technicians work only their own requests, cannot change priority, reassign, close or cancel; claiming only for
  self; customers creatable but not editable by technicians; activity log admin-only; assignment only to
  active technicians.
- **Workflow:** full lifecycle with audit trail order; open tasks block resolve; resolution note required;
  illegal transitions explained; closed requests locked; reopening clears `resolved_at`; field-level validation
  errors; duplicate customer detection.
- **Transactions:** a request whose second task violates a constraint leaves no request, task or log row;
  database invariants hold when the service layer is bypassed.
- **Concurrency:** stale edit returns 409 with the winner's data; of 8 simultaneous edits exactly one wins;
  customers behave the same; task reopen racing a resolve never yields "resolved with an open task" (5 rounds).
- **Listing:** search by title, customer and SR number; LIKE wildcards literal; every filter; stable pagination;
  unknown sort key, oversized page and unknown status rejected.
- **Dashboard:** figures match a constructed data set.
- **Database:** migrations idempotent; edited migration detected; seed run twice creates no duplicates and
  respects all rules.
- **Hosting:** SPA fallback, immutable asset caching, API error format preserved with static hosting enabled.
  This last group exists because a real defect was found here during development: with the static plugin
  registered, API routes used the framework's default error format until handlers were installed earlier.

### E2E (8 tests)

Admin dashboard with axe scan; technician creates, claims, starts, is refused resolution with open tasks,
completes tasks and resolves; viewer sees no actions and no contact data; two browsers editing the same request
show the conflict panel; keyboard-only sign-in, skip link and sortable headers; deep link survives sign-in;
server validation message reaches the field; phone layout menu, card table and no horizontal scroll.

## Results (2026-10-04, local)

| Suite       | Result    | Duration |
| ----------- | --------- | -------- |
| Unit        | 27 passed | 2.3 s    |
| Integration | 49 passed | 7.9 s    |
| E2E         | 8 passed  | 9.3 s    |

Latency probe (`scripts/measure.mjs`, 60 sequential requests each, demo data, Docker Desktop on a 4-core laptop):

| Endpoint                                                         | p50    | p95    |
| ---------------------------------------------------------------- | ------ | ------ |
| `GET /api/requests` (page 1, 25 rows)                            | 4.6 ms | 6.3 ms |
| `GET /api/requests` with search, status filter and priority sort | 3.7 ms | 5.2 ms |
| `GET /api/customers?sort=-open`                                  | 3.5 ms | 4.6 ms |
| `GET /api/dashboard`                                             | 5.2 ms | 6.3 ms |

## Gaps

- No component-level tests for React screens; UI behaviour is covered through E2E only.
- E2E runs in Chromium only. Firefox and WebKit are not part of CI to keep run time down.
- No load test beyond the sequential latency probe.
- E2E signs in several times; running the suite twice within a minute can hit the sign-in rate limit
  (10 per minute per account and address). CI raises the limit through `LOGIN_RATE_LIMIT_PER_MINUTE`.
