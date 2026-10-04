# Slim configuration

The default `docker compose up` **is** the Slim configuration. There is one code base and one image; only
configuration differs between local demo, development and a future public demo.

## What Slim means here

| Setting         | Value                                                        | Effect                            |
| --------------- | ------------------------------------------------------------ | --------------------------------- |
| Runtime image   | distroless Node 24, production dependencies only             | 58 MB compressed, 245 MB unpacked |
| App memory      | 256 MB limit, V8 heap capped at 160 MB, libuv pool 2 threads | Idle RSS about 36 MB              |
| Database        | `shared_buffers=48MB`, `max_connections=20`, 256 MB limit    | Idle about 18 MB                  |
| Connection pool | 5 connections                                                |                                   |
| PIDs            | 100 per container                                            |                                   |
| Logs            | 5 MB x 2 files per container                                 |                                   |
| Demo data       | 36 customers, 150 requests, 379 tasks, 627 activity entries  | Seed takes about 1 s              |
| Polling         | None; the UI fetches on navigation and after actions         | No idle CPU                       |

Measured 2026-10-04 with `docker stats` after the E2E suite: app 36.4 MiB, database 18.5 MiB, CPU 0 % idle.

## Configurations

| Configuration              | Command                                                       | Differences                                                                    |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Local demo (Slim, default) | `./scripts/ops.ps1 start`                                     | As above                                                                       |
| Development                | `./scripts/ops.ps1 dev-db` + `npm run dev:server` / `dev:web` | Database only in Docker, on port 54101, `fsync=off` for speed, separate volume |
| Public demo (prepared)     | `compose.yaml` + `compose.prod.yaml`                          | Pinned registry image, secure cookies, proxy trust                             |

## Optional components

None are needed. The `seed` service sits behind the `tools` profile and runs only on demand.
