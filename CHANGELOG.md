# Changelog

All notable changes to Fieldline. Format based on Keep a Changelog; versions follow SemVer.

## [0.1.0] - 2026-10-04

First complete release.

### Added

- Customers, service requests, tasks, notes and activity log on PostgreSQL 18 with constraints and indexes.
- Status machine with admin-only close and cancel, task and note rules, technician self-claim.
- Server-side sessions with Argon2id, CSRF token and Origin checks, sign-in rate limit.
- Admin, technician and viewer roles enforced on the server; viewer contact masking.
- Optimistic concurrency with 409 responses and a comparison panel in the UI.
- Dashboard computed from live data; search, filters, sorting and pagination.
- React interface with responsive tables, keyboard support and accessible status indicators.
- Deterministic, idempotent demo seed and reset.
- Docker Compose demo stack with resource limits, read-only containers and internal database network.
- `scripts/ops.ps1` for setup, start, stop, status, logs, seed, backup, restore, reset and tests.
- Unit, integration and E2E test suites; GitHub Actions CI; manual, disabled deploy workflow.
