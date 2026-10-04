import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import type { ActivityEntry, Page, TeamMember } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Pagination } from '../components/Pagination';
import { Empty, ErrorState, Forbidden, Loading } from '../components/States';
import { useResource } from '../hooks/useResource';
import { formatDateTime, ROLE_LABEL } from '../lib/format';

export function TeamPage() {
  const res = useResource((signal) => api<{ items: TeamMember[] }>('/api/users', { signal }), []);
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Team</h1>
          <p className="page__sub">Active accounts and their current request load.</p>
        </div>
      </header>
      {res.status === 'error' && <ErrorState error={res.error} onRetry={res.reload} />}
      {!res.data && res.status === 'loading' && <Loading label="Loading team" />}
      {res.data && (
        <div className="table-wrap">
          <table className="table table--responsive">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Email</th>
                <th scope="col" className="num">
                  Open
                </th>
                <th scope="col" className="num">
                  In progress
                </th>
                <th scope="col" className="num">
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((m) => (
                <tr key={m.id}>
                  <td data-label="Name">
                    {m.role === 'technician' ? (
                      <Link to={`/requests?assignee=${m.id}`}>{m.fullName}</Link>
                    ) : (
                      m.fullName
                    )}
                  </td>
                  <td data-label="Role">
                    <span className={`role-chip role-chip--${m.role}`}>{ROLE_LABEL[m.role]}</span>
                  </td>
                  <td data-label="Email">
                    {m.email ?? <span className="muted small">Visible to admins</span>}
                  </td>
                  <td className="num" data-label="Open">
                    {m.openRequests}
                  </td>
                  <td className="num" data-label="In progress">
                    {m.inProgress}
                  </td>
                  <td className={`num${m.overdue ? ' text-warn' : ''}`} data-label="Overdue">
                    {m.overdue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ENTITY_FILTERS = [
  { value: '', label: 'All events' },
  { value: 'request,task', label: 'Requests and tasks' },
  { value: 'customer', label: 'Customers' },
  { value: 'session', label: 'Sign-ins' },
];

export function ActivityPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const entityType = params.get('entityType') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const pageSize = Number(params.get('pageSize') ?? '50') || 50;
  const allowed = user.role === 'admin';
  const res = useResource(
    (signal) =>
      allowed
        ? api<Page<ActivityEntry>>('/api/activity', { signal, query: { entityType, page, pageSize } })
        : Promise.resolve(null),
    [entityType, page, pageSize, allowed],
  );
  if (!allowed) return <Forbidden message="The full activity log is available to admins." />;

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Activity log</h1>
          <p className="page__sub">
            Every meaningful change, written in the same transaction as the change itself.
          </p>
        </div>
      </header>
      <div className="filters">
        <label className="inline-field">
          <span>Show</span>
          <select
            value={entityType}
            onChange={(e) => set({ entityType: e.target.value || undefined, page: undefined })}
          >
            {ENTITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {res.status === 'error' && <ErrorState error={res.error} onRetry={res.reload} />}
      {!res.data && res.status === 'loading' && <Loading label="Loading activity" />}
      {res.data &&
        (res.data.items.length === 0 ? (
          <Empty title="No activity recorded" />
        ) : (
          <>
            <div className="table-wrap" aria-busy={res.status === 'loading'}>
              <table className="table table--responsive table--compact">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                    <th scope="col">Event</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.items.map((a) => (
                    <tr key={a.id}>
                      <td data-label="When" className="nowrap">
                        <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time>
                      </td>
                      <td data-label="Who">{a.actorName ?? 'System'}</td>
                      <td data-label="What">
                        {a.entityType === 'request' && a.entityId ? (
                          <Link to={`/requests/${a.entityId}`}>{a.summary}</Link>
                        ) : (
                          a.summary
                        )}
                      </td>
                      <td data-label="Event" className="mono small">
                        {a.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Activity"
              page={res.data.page}
              pageSize={res.data.pageSize}
              total={res.data.total}
              onPage={(p) => set({ page: String(p) })}
              onPageSize={(s) => set({ pageSize: String(s), page: undefined })}
            />
          </>
        ))}
    </div>
  );
}
