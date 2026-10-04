# Storage

Measurements taken on 2026-10-04 on the development laptop. Portfolio-wide totals and the cleanup command are
in the portfolio hub (`docs/STORAGE.md`).

| Item                            | Size                               | Notes                                                      |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `fieldline:local` image         | 245 MB unpacked, 58 MB compressed  | Shares distroless base layers with the other Node projects |
| `postgres:18` image             | 650 MB unpacked, 162 MB compressed | Shared with Slotkeeper                                     |
| `fieldline_db-data` volume      | 67 MB                              | PostgreSQL 18 cluster with the demo data                   |
| `fieldline-dev_dev-data` volume | 76 MB                              | Development and test database                              |
| `node_modules`                  | 176 MB                             | Development only, not in any image                         |
| `dist/`                         | 0.65 MB                            | Build output                                               |
| A backup file                   | 76 KB                              | `pg_dump` custom format                                    |

## Data retention

- Demo and development data live in named volumes and survive `stop`.
- `./scripts/ops.ps1 reset-demo -Yes` replaces the data in place; it does not delete the volume.
- To remove everything Fieldline stored (irreversible):
  `docker compose down -v` and `docker compose -f compose.dev.yaml down -v`, then delete `./backups`.

## Cleanup of rebuildable artefacts

Safe to delete at any time; they are recreated by `npm ci` and `npm run build`: `node_modules/`, `dist/`,
`playwright-report/`, `test-results/`. Superseded `fieldline:<tag>` images can be removed with
`docker image rm`, keeping the one in use and the previous one for rollback.
