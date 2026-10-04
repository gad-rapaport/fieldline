# Security

## Threat model

| Asset          | Threat                      | Mitigation                                                                                                                                                             | Residual risk                                                                           |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Accounts       | Password guessing           | Argon2id (OWASP parameters), rate limit per address and account, identical response for unknown account and wrong password, dummy hash verification to equalise timing | Distributed guessing across many addresses is only slowed, not stopped. No MFA.         |
| Sessions       | Theft through XSS           | `HttpOnly` cookie, strict CSP (`script-src 'self'`, no inline scripts), React escaping, no `dangerouslySetInnerHTML`                                                   | A compromised dependency in the web bundle would run as same-origin script.             |
| Sessions       | Database leak               | Only SHA-256 digests of tokens are stored                                                                                                                              | Password hashes leak with the database; Argon2id makes cracking costly, not impossible. |
| Sessions       | Fixation, long-lived tokens | New random token per sign-in, fixed 12 h expiry, deleted on sign-out, hourly purge                                                                                     | No idle timeout separate from absolute expiry.                                          |
| State changes  | CSRF                        | `SameSite=Lax`, per-session `X-CSRF-Token`, Origin check                                                                                                               |                                                                                         |
| Data           | Privilege escalation        | Every mutation checks role and ownership in the service layer; viewer role blocked by a coarse gate before any other logic                                             |                                                                                         |
| Data           | Contact detail exposure     | Masked in the service layer for viewers; admin-only user emails                                                                                                        |                                                                                         |
| Data           | SQL injection               | Bind parameters only; sort keys chosen from a server-side whitelist; LIKE wildcards escaped                                                                            |                                                                                         |
| Data           | Lost updates                | Optimistic versions, row locks for cross-row rules                                                                                                                     |                                                                                         |
| Availability   | Large or abusive requests   | 64 KB body limit, page size max 100, statement timeout 5 s, connection pool max 5, container CPU, memory and PID limits                                                | No global request rate limit; only sign-in is limited.                                  |
| Infrastructure | Container breakout impact   | Distroless non-root image, read-only root filesystem, all capabilities dropped (database keeps the five it needs), `no-new-privileges`, no Docker socket               |                                                                                         |
| Infrastructure | Network exposure            | Only the app port is published, bound to `127.0.0.1`; the database network is `internal`                                                                               |                                                                                         |
| Secrets        | Leak through Git or logs    | `.env` ignored, generated locally; logs redact cookie, authorization and CSRF headers; gitleaks scans full history in CI                                               |                                                                                         |

## Roles

| Capability                                | Admin | Technician                  | Viewer |
| ----------------------------------------- | ----- | --------------------------- | ------ |
| Read requests, customers, dashboard, team | yes   | yes                         | yes    |
| See customer contact details              | yes   | yes                         | no     |
| Create customers                          | yes   | yes                         | no     |
| Edit customers                            | yes   | no                          | no     |
| Create requests, add notes                | yes   | yes                         | no     |
| Edit request fields, manage tasks         | yes   | assigned only               | no     |
| Change priority, assign, unassign         | yes   | no (may claim new requests) | no     |
| Start, hold, resolve, reopen              | yes   | assigned only               | no     |
| Close, cancel                             | yes   | no                          | no     |
| Activity log, user emails                 | yes   | no                          | no     |

## Configuration profiles

- **Local demo (default):** HTTP on `127.0.0.1:8101`, `COOKIE_SECURE=false` because browsers drop Secure
  cookies on plain HTTP. HSTS is off.
- **Public demo ([compose.prod.yaml](../compose.prod.yaml)):** behind a TLS-terminating proxy,
  `COOKIE_SECURE=true`, `TRUST_PROXY=true` (correct client IP for the rate limiter, `https` for the Origin
  check), HSTS on. The local profile never weakens these values because they are separate files.

## Secrets

- `POSTGRES_PASSWORD` and the three seed passwords exist only in `.env` (local) or are generated per CI run.
- The running app container does not receive the seed passwords; only the one-shot `seed` service does.
- The future deploy workflow reads SSH material from GitHub environment secrets that do not exist yet.

## Scanning

- **Secrets:** gitleaks over the full Git history on every CI run.
- **Dependencies:** `npm audit --omit=dev --audit-level=high` fails CI. Development-only advisories are
  reported by `npm audit` locally but do not ship in the image.
- **Image:** Trivy reports HIGH and CRITICAL fixed vulnerabilities in the CI summary. It is report-only on
  purpose: base-image findings are fixed by rebuilding on a newer base, which should not block unrelated changes.
  Findings at the time of writing: see the latest CI run summary.

## Known limitations

- No MFA, password reset or account lockout UI.
- No audit of read access (only changes are logged).
- Activity log is append-only by convention, not enforced with database permissions; the app uses one role.
- Absolute security is not claimed; this is a demo with a documented model.
