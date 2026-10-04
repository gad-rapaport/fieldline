# Deployment

## Local Docker (current)

[compose.yaml](../compose.yaml) is a production build of the app with Slim resource settings:

- Multi-stage [Dockerfile](../Dockerfile): dependencies → build (tsc + Vite) → production-only `node_modules`
  → `gcr.io/distroless/nodejs24-debian12:nonroot` runtime. No build tools, tests or dev dependencies in the
  final image.
- App port published on `127.0.0.1:8101` only; database not published.
- Limits: app 1 CPU / 256 MB / 100 PIDs, database 1 CPU / 256 MB / 100 PIDs (verified with `docker inspect`).

## Production configuration (prepared, not active)

[compose.prod.yaml](../compose.prod.yaml) overrides the local file for a single host behind a TLS-terminating
reverse proxy:

- `image` must be a pinned registry reference (`...@sha256:<digest>`), never `latest`.
- `COOKIE_SECURE=true`, `TRUST_PROXY=true`, HSTS enabled by the app when cookies are secure.
- The app still binds to `127.0.0.1`; only the proxy listens publicly.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) on every push to `main` and every pull request:

| Job         | Steps                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| quality     | `npm ci`, Prettier check, ESLint, type check (server, web, tests), unit tests, build                                                                                           |
| integration | PostgreSQL 18 service container, migrations on an empty database, integration suite                                                                                            |
| e2e         | Buildx image build with GitHub cache, Compose stack, seed, Playwright desktop + phone, image size, Trivy report, logs on failure, report artefact (7 days), teardown with `-v` |
| security    | gitleaks over full history, `npm audit --omit=dev --audit-level=high`                                                                                                          |

Workflow permissions are `contents: read`; older runs on the same ref are cancelled; actions are pinned to
commit SHAs; checkout does not persist credentials.

## CD (prepared, disabled)

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs only when started by hand:

1. **publish** builds and pushes `ghcr.io/<owner>/fieldline:<commit-sha>` and records the digest.
2. **deploy** runs only if the `deploy` input is ticked **and** the repository variable `DEPLOY_ENABLED` is
   `true` **and** the `demo` environment approves. None of these are configured, so this job is skipped.
   When enabled it SSHes to the host and runs [deploy/deploy.sh](../deploy/deploy.sh) with the pinned digest,
   then smoke-tests `/readyz`.

What has been verified: the production Compose override resolves (`docker compose -f compose.yaml -f
compose.prod.yaml config`). What has **not** been verified: publishing to GHCR, the SSH deploy and the remote
smoke test. No deployment has been performed.

## Rollback

- `deploy.sh` keeps every deployed image reference in `.deploy-history`. If the new container does not become
  healthy within 90 s it starts the previous image automatically; `deploy.sh --rollback` does it on demand.
- Data is in the `db-data` volume and is not touched by deploys.
- **Limitation:** migrations run forward on start-up. A rollback across a migration works only if the migration
  was additive (new tables, nullable columns, new indexes). Destructive schema changes must be split into an
  expand release and a later contract release. Take `ops.ps1 backup` (or the server equivalent) before any
  deploy that includes a migration.

## Enabling a future deploy (checklist)

1. Create the `demo` environment with required reviewers.
2. Add environment secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` and variable `DEMO_URL`.
3. On the host: a `deploy` user without sudo, `/srv/fieldline` with `compose.yaml`, `compose.prod.yaml`,
   `deploy.sh` and a `.env` created on the host.
4. Set `DEPLOY_ENABLED=true`. Remove it again after the demo.

The portfolio-level remote demo plan is in the portfolio hub (`docs/REMOTE-DEMO.md`).
