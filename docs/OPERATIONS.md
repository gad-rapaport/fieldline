# Operations

## Health checks

| Endpoint       | Meaning                                    | Used by                                                                          |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `GET /healthz` | Process is serving HTTP                    | Manual checks                                                                    |
| `GET /readyz`  | Database answers `SELECT 1`; 503 otherwise | Container healthcheck (`cli.js healthcheck`), `ops.ps1 start`, deploy smoke test |

The distroless image has no shell or curl, so the container healthcheck runs a small Node script that calls
`/readyz` with a 3 s timeout. PostgreSQL uses `pg_isready`.

## Logs

- Structured JSON (pino) on stdout. Each request logs method, URL, status and duration with a request id.
- The request id is returned in `X-Request-Id` and shown to users in error messages, so a report can be matched
  to a log line.
- Cookie, authorization and CSRF headers are removed from logs.
- Docker `json-file` driver with rotation: 5 MB x 2 files per container.
- `./scripts/ops.ps1 logs app` shows the last 200 lines with timestamps.

## Background jobs

| Job                   | Schedule                   | Effect                                           |
| --------------------- | -------------------------- | ------------------------------------------------ |
| Expired session purge | Hourly, in the app process | `DELETE FROM sessions WHERE expires_at <= now()` |

## Backup and restore

```powershell
./scripts/ops.ps1 backup                                   # backups/fieldline-YYYYMMDD-HHMMSS.dump
./scripts/ops.ps1 restore backups/fieldline-....dump -Yes  # stops app, pg_restore --clean, starts app
```

- Backups are `pg_dump` custom-format files written by a throwaway `postgres:18` container on the internal
  network. They are git-ignored.
- Restore runs in a single transaction and only accepts files from `./backups`.
- **Drill performed 2026-10-04:** backup (76 KB) → inserted a row (36 → 37 customers) → restore → 36 customers,
  app healthy.

## Retention

| Data           | Retention                                                              |
| -------------- | ---------------------------------------------------------------------- |
| Activity log   | Kept indefinitely (audit). At demo volume this is a few thousand rows. |
| Sessions       | Deleted at expiry (12 h) by the purge job                              |
| Container logs | 10 MB per container (rotation)                                         |
| Backups        | Manual; delete old files from `./backups`                              |

## Restart and persistence

- `restart: on-failure:3`: containers restart after a crash but do not start automatically when Docker starts,
  so the portfolio does not consume resources after a reboot.
- `./scripts/ops.ps1 stop` runs `docker compose down` without `-v`; the `fieldline_db-data` volume survives.
- **Verified 2026-10-04:** stop → start kept all 36 customers; `docker compose restart app` returned healthy.

## Troubleshooting

| Symptom                                             | Check                                  | Fix                                                                              |
| --------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `ops.ps1 start` times out                           | `./scripts/ops.ps1 logs app`           | Usually `.env` missing a value; the app prints which variable failed validation. |
| Port 8101 in use                                    | `Get-NetTCPConnection -LocalPort 8101` | Stop the other process, or change the published port in `compose.yaml`.          |
| Sign-in always fails                                | Was `.env` regenerated after seeding?  | `./scripts/ops.ps1 seed` refreshes the demo password hashes.                     |
| "Too many attempts"                                 | Rate limit, 10 per minute              | Wait a minute.                                                                   |
| Migration error "was modified after it was applied" | Someone edited an applied migration    | Revert the file and add a new migration.                                         |
| `restore` refuses the file                          | File not in `./backups`                | Copy it there first.                                                             |
