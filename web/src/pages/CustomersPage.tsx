import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import type { Customer, Page } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Pagination } from '../components/Pagination';
import { SortHeader } from '../components/SortHeader';
import { Empty, ErrorState, Loading } from '../components/States';
import { useDebounced } from '../hooks/useDebounced';
import { useResource } from '../hooks/useResource';

export function CustomersPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const sort = params.get('sort') ?? 'name';
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

  const cities = useResource((signal) => api<{ items: string[] }>('/api/customers/cities', { signal }), []);
  const res = useResource(
    (signal) => api<Page<Customer>>('/api/customers', { signal, query: { q, city, sort, page, pageSize } }),
    [q, city, sort, page, pageSize],
  );

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Customers</h1>
          <p className="page__sub">Sites the team services, with their open workload.</p>
        </div>
        {user.role !== 'viewer' && (
          <Link to="/customers/new" className="btn btn--primary">
            New customer
          </Link>
        )}
      </header>
      <form
        className="filters"
        role="search"
        aria-label="Filter customers"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="filters__search">
          <span className="visually-hidden">Search customers</span>
          <input
            type="search"
            placeholder="Search name or contact"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="inline-field">
          <span>City</span>
          <select value={city} onChange={(e) => update({ city: e.target.value || undefined })}>
            <option value="">All cities</option>
            {cities.data?.items.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </form>

      {res.status === 'error' && <ErrorState error={res.error} onRetry={res.reload} />}
      {res.status === 'loading' && !res.data && <Loading label="Loading customers" />}
      {res.data && res.status !== 'error' && (
        <>
          {res.data.items.length === 0 ? (
            <Empty title="No customers match">Try a different search or city.</Empty>
          ) : (
            <div className="table-wrap" aria-busy={res.status === 'loading'}>
              <table className="table table--responsive">
                <thead>
                  <tr>
                    <SortHeader
                      label="Customer"
                      field="name"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                    />
                    <SortHeader label="City" field="city" sort={sort} onSort={(s) => update({ sort: s })} />
                    <th scope="col">Contact</th>
                    <SortHeader
                      label="Open requests"
                      field="open"
                      sort={sort}
                      onSort={(s) => update({ sort: s })}
                      className="num"
                      descFirst
                    />
                    <th scope="col" className="num">
                      All requests
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.items.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Customer">
                        <Link to={`/customers/${c.id}`} className="row-link">
                          {c.name}
                        </Link>
                      </td>
                      <td data-label="City">{c.city}</td>
                      <td data-label="Contact">
                        {c.contactHidden ? (
                          <span className="muted small">Hidden for your role</span>
                        ) : (
                          <>
                            {c.contactName || <span className="muted">—</span>}
                            {c.phone && <span className="muted small block mono">{c.phone}</span>}
                          </>
                        )}
                      </td>
                      <td className="num" data-label="Open requests">
                        {c.openRequests}
                      </td>
                      <td className="num" data-label="All requests">
                        {c.totalRequests}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            label="Customers"
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
