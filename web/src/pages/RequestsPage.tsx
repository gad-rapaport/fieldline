import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import type { Page, RequestSummary, Status, TeamMember } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { Pagination } from '../components/Pagination';
import { SortHeader } from '../components/SortHeader';
import { Empty, ErrorState, Loading } from '../components/States';
import { useDebounced } from '../hooks/useDebounced';
import { useResource } from '../hooks/useResource';
import { formatDateTime, formatRelative, ref } from '../lib/format';

const OPEN: Status[] = ['new', 'assigned', 'in_progress', 'on_hold'];

const STATUS_PRESETS = [
  { value: '', label: 'Any status' },
  { value: 'new,assigned,in_progress,on_hold', label: 'Open (all)' },
  { value: 'new', label: 'New' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'resolved,closed', label: 'Resolved or closed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function RequestsPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const assignee = params.get('assignee') ?? '';
  const overdue = params.get('overdue') === 'true';
  const sort = params.get('sort') ?? '-created';
  const page = Number(params.get('page') ?? '1') || 1;
  const pageSize = Number(params.get('pageSize') ?? '25') || 25;

  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search, 300);

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debounced !== q) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const team = useResource((signal) => api<{ items: TeamMember[] }>('/api/users', { signal }), []);
  const res = useResource(
    (signal) =>
      api<Page<RequestSummary>>('/api/requests', {
        signal,
        query: { q, status, priority, assignee, overdue: overdue || undefined, sort, page, pageSize },
      }),
    [q, status, priority, assignee, overdue, sort, page, pageSize],
  );

  const technicians = team.data?.items.filter((m) => m.role === 'technician') ?? [];
  const filtersActive = Boolean(q || status || priority || assignee || overdue);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Service requests</h1>
          <p className="page__sub">
            Search, filter and sort. The address bar keeps your view, so it can be shared.
          </p>
        </div>
        {user.role !== 'viewer' && (
          <Link to="/requests/new" className="btn btn--primary">
            New request
          </Link>
        )}
      </header>

      <form
        className="filters"
        role="search"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filter requests"
      >
        <label className="filters__search">
          <span className="visually-hidden">Search requests</span>
          <input
            type="search"
            placeholder="Search title, customer or SR number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="inline-field">
          <span>Status</span>
          <select value={status} onChange={(e) => update({ status: e.target.value || undefined })}>
            {[
              ...STATUS_PRESETS,
              ...(STATUS_PRESETS.some((p) => p.value === status)
                ? []
                : [{ value: status, label: 'Custom selection' }]),
            ].map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => update({ priority: e.target.value || undefined })}>
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high,urgent">High or urgent</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="inline-field">
          <span>Assignee</span>
          <select value={assignee} onChange={(e) => update({ assignee: e.target.value || undefined })}>
            <option value="">Anyone</option>
            {user.role === 'technician' && <option value="me">Me</option>}
            <option value="unassigned">Unassigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => update({ overdue: e.target.checked ? 'true' : undefined })}
          />
          <span>Overdue only</span>
        </label>
        {filtersActive && (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setSearch('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Clear filters
          </button>
        )}
      </form>

      {res.status === 'error' && <ErrorState error={res.error} onRetry={res.reload} />}
      {res.status === 'loading' && !res.data && <Loading label="Loading requests" />}
      {res.data && res.status !== 'error' && (
        <>
          {res.data.items.length === 0 ? (
            <Empty title={filtersActive ? 'No requests match these filters' : 'No service requests yet'}>
              {filtersActive
                ? 'Try removing a filter or searching for a shorter term.'
                : 'Create the first request to get started.'}
            </Empty>
          ) : (
            <div className="table-wrap" aria-busy={res.status === 'loading'}>
              <table className="table table--responsive">
                <caption className="visually-hidden">
                  Service requests, sorted by {sort.replace('-', '')}
                </caption>
                <thead>
                  <tr>
                    <SortHeader
                      label="Ref"
                      field="ref"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                      descFirst
                    />
                    <th scope="col">Request</th>
                    <SortHeader
                      label="Customer"
                      field="customer"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                    />
                    <th scope="col">Status</th>
                    <SortHeader
                      label="Priority"
                      field="priority"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                      descFirst
                    />
                    <th scope="col">Assignee</th>
                    <SortHeader label="Due" field="due" sort={sort} onSort={(s) => update({ sort: s })} />
                    <SortHeader
                      label="Created"
                      field="created"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                      descFirst
                    />
                  </tr>
                </thead>
                <tbody>
                  {res.data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="mono nowrap" data-label="Ref">
                        {ref(r.ref)}
                      </td>
                      <td data-label="Request">
                        <Link to={`/requests/${r.id}`} className="row-link">
                          {r.title}
                        </Link>
                        {r.totalTasks > 0 && (
                          <span className="muted small block">
                            {r.totalTasks - r.openTasks}/{r.totalTasks} tasks done
                          </span>
                        )}
                      </td>
                      <td data-label="Customer">
                        {r.customerName}
                        <span className="muted small block">{r.customerCity}</span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={r.status} />
                      </td>
                      <td data-label="Priority">
                        <PriorityTag priority={r.priority} />
                      </td>
                      <td data-label="Assignee">
                        {r.assigneeName ?? <span className="muted">Unassigned</span>}
                      </td>
                      <td data-label="Due">
                        {r.dueAt && OPEN.includes(r.status) ? (
                          <span
                            className={r.overdue ? 'due due--overdue' : 'due'}
                            title={formatDateTime(r.dueAt)}
                          >
                            {r.overdue && <span className="due__flag">Overdue</span>}
                            {formatRelative(r.dueAt)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-label="Created" title={formatDateTime(r.createdAt)}>
                        {formatRelative(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            label="Requests"
            page={res.data.page}
            pageSize={res.data.pageSize}
            total={res.data.total}
            onPage={(p) => update({ page: String(p) }, false)}
            onPageSize={(s) => update({ pageSize: String(s) })}
          />
        </>
      )}
    </div>
  );
}
