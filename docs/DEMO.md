# Demo script (4 minutes)

Before: `./scripts/ops.ps1 reset-demo -Yes`, then open http://127.0.0.1:8101 in two browser windows
(one normal, one private). Keep `.env` open for the passwords.

## 1. The problem (20 s)

"A maintenance team gets service calls from customers. Admins triage and assign, technicians do the work in the
field, and someone outside the team sometimes needs read-only visibility. Fieldline covers that flow end to end."

## 2. Dashboard (40 s) - admin

- Sign in as `admin@fieldline.test`.
- Point at overdue and unassigned tiles: "Every number here is a live query; click Overdue and you land on the
  filtered list." Click it.
- Back, open **Show as table** under the chart: "Charts always have a table alternative."

## 3. A request through its life (90 s) - technician

- In the private window sign in as `noa@fieldline.test`.
- Requests → New request, pick a customer, two tasks → Create. Claim it, Start work.
- Click Resolve with open tasks: "The server refuses with a clear reason. The rule lives in the service layer and
  the UI only displays the server's answer."
- Tick both tasks, Resolve with a note. Show the activity timeline: "Each entry is written in the same database
  transaction as the change."
- Note that there is no Close button for a technician: closing is an admin decision.

## 4. Concurrent editing (45 s)

- In both windows (admin and admin, or admin and the assigned technician), open the same request and click
  Edit details.
- Save in window one. Save in window two: "No silent overwrite. The server rejects the stale version and the UI
  shows both values side by side; the user decides."

## 5. Permissions (30 s)

- Sign in as `viewer@fieldline.test`: banner, no actions, contact details hidden.
- "Hiding buttons is cosmetic. The integration tests call every mutation as a viewer and expect 403, and check
  that contact fields are never in the JSON."

## 6. Engineering close (15 s)

Open [ARCHITECTURE.md](ARCHITECTURE.md#indexes) or [service.ts](../server/src/modules/requests/service.ts)
depending on the audience.

## Decisions worth presenting

| Decision                                      | Alternative                             | Why                                                 |
| --------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Optimistic versions + 409 with current record | Last write wins; pessimistic edit locks | Users are informed, never blocked; no lock cleanup. |
| `FOR UPDATE` / `FOR SHARE` for the task rule  | `SERIALIZABLE` with retries             | Serialises only the one request; no retry loops.    |
| Server-computed `allowed` actions             | Duplicate rules in the UI               | One policy; a unit test proves UI and server agree. |
| Server-side sessions                          | JWT                                     | Instant revocation and role changes.                |

## Limitations to mention honestly

No notifications, no user management UI, offset pagination, Chromium-only E2E.

## Next improvements

Email notifications through an outbox table; SLA policies per customer; keyset pagination; component tests for
the request detail screen.
