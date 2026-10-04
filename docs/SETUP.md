# Setup

## Requirements

| Purpose          | Requirement                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Run the demo     | Docker with Compose v2. PowerShell 7 for `scripts/ops.ps1` (optional, plain commands below). |
| Develop and test | Node.js 24 and npm 11, plus Docker for the development database.                             |
| E2E tests        | `npx playwright install chromium` once.                                                      |

Free ports needed: **8101** (demo) and **54101** (development database). Both bind to `127.0.0.1` only.

## Environment variables

`.env` is created from [.env.example](../.env.example) and never committed.

| Variable                                                                  | Used by                | Meaning                                                               |
| ------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                       | db, app, seed          | Database password. Letters and digits only (it is embedded in a URL). |
| `SEED_ADMIN_PASSWORD`, `SEED_TECHNICIAN_PASSWORD`, `SEED_VIEWER_PASSWORD` | seed                   | Demo account passwords, at least 12 characters.                       |
| `APP_TIMEZONE`                                                            | app                    | IANA zone for dashboard day buckets (default `Asia/Jerusalem`).       |
| `LOGIN_RATE_LIMIT_PER_MINUTE`                                             | app                    | Sign-in attempts per address and account per minute (default 10).     |
| `COOKIE_SECURE`                                                           | app                    | `true` behind HTTPS. Must stay `false` for plain-HTTP localhost.      |
| `DATABASE_URL`, `DEV_ORIGIN`, `TEST_DATABASE_URL`                         | local development only | See below.                                                            |

The app validates its configuration at start-up and refuses to run with a missing or malformed value.

## Demo stack

With PowerShell:

```powershell
./scripts/ops.ps1 setup
```

Plain Docker equivalent:

```bash
cp .env.example .env            # then replace every replace-with-random-value
docker compose build
docker compose up -d --wait
docker compose --profile tools run --rm seed
```

Migrations run automatically when the app starts (`MIGRATE_ON_START=true`), guarded by an advisory lock.
The seed is idempotent: running it again inserts nothing new.

## Local development

```powershell
npm ci
./scripts/ops.ps1 dev-db              # PostgreSQL on 127.0.0.1:54101, separate volume from the demo
```

Add to `.env` (replace the password with your `POSTGRES_PASSWORD`):

```
DATABASE_URL=postgres://fieldline:<password>@127.0.0.1:54101/fieldline
DEV_ORIGIN=http://127.0.0.1:5181
TEST_DATABASE_URL=postgres://fieldline:<password>@127.0.0.1:54101/postgres
```

Then, in two terminals:

```powershell
npm run db:seed        # migrate + seed the development database
npm run dev:server     # API on 127.0.0.1:3101 with reload
npm run dev:web        # Vite on 127.0.0.1:5181, proxies /api to the server
```

## Migrations

- Files live in [server/migrations](../server/migrations) as `NNN_description.sql` and run in order, each in its
  own transaction.
- Applied files are recorded with a SHA-256 checksum. Editing an applied file stops start-up with an error;
  add a new migration instead.
- Manual run: `npm run db:migrate` (development) or `docker compose exec app /nodejs/bin/node dist/server/cli.js migrate`.

## Verifying a fresh install

```powershell
./scripts/ops.ps1 status          # both containers healthy
curl http://127.0.0.1:8101/readyz # {"status":"ready"}
```

Sign in as `admin@fieldline.test` with `SEED_ADMIN_PASSWORD` from `.env`.
