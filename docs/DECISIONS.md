# Decisions

Portfolio-wide choices (language, framework, base images) are explained in the portfolio hub. This file covers
Fieldline-specific decisions.

## Server-side sessions instead of JWT

- **Chosen:** random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 digest is stored.
- **Alternatives:** JWT in a cookie or in `localStorage`.
- **Why:** a single server and a single database make revocation trivial with sessions (delete the row), and
  role changes or deactivation take effect on the next request. JWTs would need a denylist to match that.
- **Trade-off:** one indexed lookup per API request. Measured p50 for list endpoints stays under 5 ms locally.

## CSRF: per-session token plus Origin check

- SameSite=Lax already blocks cross-site POSTs in current browsers. A synchronizer token in `X-CSRF-Token` and an
  Origin check are cheap extra layers that do not depend on browser behaviour.

## No ORM

- **Why:** the interesting parts (partial indexes, enum ordering for priority sort, `FOR UPDATE` vs `FOR SHARE`,
  conditional `done_at` update) are clearer as SQL. Repositories are small and every value is a bind parameter.
- **Trade-off:** no generated types from the schema; row types are written by hand next to the queries and
  covered by integration tests.

## Concurrency

Optimistic versions for edits, row locks for rules.

- Users editing the same record should be told, not blocked: a `version` column and 409 with the current record
  give the UI what it needs to show both versions.
- Rules spanning rows (all tasks done before resolve) need serialisation. `SERIALIZABLE` would also work but
  forces retry loops in every caller; explicit `FOR UPDATE` / `FOR SHARE` locks scope the serialisation to the
  one request involved.

## Status machine in code, invariants in the database

- Transition rules are a small table in `domain/requestStatus.ts`, unit tested and shared with the UI via
  `allowed` actions.
- The database cannot express "legal transition" without triggers, but it does hold the invariants that would be
  harmful if broken (assignee present for working statuses, `resolved_at` consistency).

## Assignment is not a status transition

- Moving to `assigned` always needs an assignee, and unassigning returns to `new`. Modelling these as separate
  operations (`/assign`) keeps the transition endpoint simple and makes the "claim" rule for technicians explicit.

## Viewer role sees no contact details

- The viewer account exists for demos shown to third parties. Masking happens in the service layer
  (`presentCustomer`), so no endpoint can leak contact fields by accident.

## Offset pagination

- **Chosen:** `page` / `pageSize` with a total count.
- **Alternative:** keyset (cursor) pagination.
- **Why:** users jump to pages and want "1-25 of 150". At thousands of rows the cost is negligible.
- **Revisit when:** tables reach hundreds of thousands of rows or deep pages become common.

## Dashboard computed on request

- Every figure is a live query (about 5 ms at demo size). Materialised views or cached snapshots would add
  staleness and invalidation logic without measurable benefit here.

## One container for API and web

- Same origin removes CORS, keeps cookies simple and halves the number of images. A CDN or separate static
  host would matter at scale, not for this product.

## Seed passwords from the environment

- No password appears in Git. `ops.ps1 setup` generates them into `.env`; CI generates throwaway ones.
- The seed refreshes password hashes on every run so a regenerated `.env` always matches.
