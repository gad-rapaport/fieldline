# Exercises

Small, self-contained changes for practice. Each lists where to work and how to verify. Run
`./scripts/ops.ps1 test` after each one.

## 1. Let technicians close their own low-priority requests

- **Change:** `policy.transition` in [server/src/domain/permissions.ts](../server/src/domain/permissions.ts)
  needs the request priority, so extend `RequestFacts` and `lockRequest` in
  [repo.ts](../server/src/modules/requests/repo.ts).
- **Verify:** a new unit test in [tests/unit/domain.test.ts](../tests/unit/domain.test.ts); update the
  "cannot close" case in [permissions.test.ts](../tests/integration/permissions.test.ts) so it uses a high
  priority request; the UI shows "Close" for the technician without any UI change, because it reads `allowed`.

## 2. New business rule: urgent requests need a due date

- **Change:** validate in `createRequest` and `updateRequest` in
  [service.ts](../server/src/modules/requests/service.ts) (not only in Zod, since priority and due date may
  arrive in separate updates). Return 422 with `fields.dueAt`.
- **Verify:** integration tests for create and for changing priority to urgent on a request without a due date;
  the New request form shows the message under the Due field.

## 3. Add a "waiting for customer" reason list to On hold

- **Change:** migration `002_hold_reason.sql` adding a nullable enum column; include it in the transition body
  schema in [routes.ts](../server/src/modules/requests/routes.ts); show a select in the transition dialog in
  [RequestDetailPage.tsx](../web/src/pages/RequestDetailPage.tsx).
- **Verify:** migration test still passes on an existing database (`npm run db:migrate` against the dev DB with
  data); the reason appears in the activity details.

## 4. Sign out everywhere

- **Change:** `POST /api/auth/logout-all` deleting all sessions of the caller in
  [auth/routes.ts](../server/src/modules/auth/routes.ts) and a button in the sidebar.
- **Verify:** integration test with two sessions for the same user; both are rejected afterwards.

## 5. Keyset pagination for the activity log

- **Change:** accept `before=<id>` in `listActivity` ([activity/repo.ts](../server/src/modules/activity/repo.ts))
  using the existing `id DESC` order; return `nextBefore`.
- **Verify:** `EXPLAIN` shows an index scan on the primary key; a test inserts 120 rows and pages through them
  without duplicates or gaps.

## 6. CI: fail on new Trivy findings

- **Change:** in [.github/workflows/ci.yml](../.github/workflows/ci.yml) add `--exit-code 1` to the Trivy step
  and a `.trivyignore` file with justified entries.
- **Verify:** a pull request shows the job failing when an ignore entry is removed; document the policy in
  [SECURITY.md](SECURITY.md#scanning).
