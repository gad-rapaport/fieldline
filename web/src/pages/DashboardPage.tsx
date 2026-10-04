import { Link } from 'react-router';
import { api } from '../api/client';
import type { Dashboard, Status } from '../api/types';
import { ErrorState, Loading } from '../components/States';
import { useResource } from '../hooks/useResource';
import { niceMax } from '../lib/chart';
import { formatDateTime, formatDay, formatHours, STATUS_LABEL } from '../lib/format';

export function DashboardPage() {
  const res = useResource((signal) => api<Dashboard>('/api/dashboard', { signal }), []);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Dashboard</h1>
          {res.data && (
            <p className="page__sub">
              Live figures computed {formatDateTime(res.data.generatedAt)}. Days are counted in{' '}
              {res.data.timezone}.
            </p>
          )}
        </div>
        <button type="button" className="btn" onClick={res.reload} disabled={res.status === 'loading'}>
          Refresh
        </button>
      </header>
      {res.status === 'error' && !res.data && <ErrorState error={res.error} onRetry={res.reload} />}
      {!res.data && res.status === 'loading' && <Loading label="Loading dashboard" />}
      {res.data && <DashboardBody d={res.data} />}
    </div>
  );
}

function DashboardBody({ d }: { d: Dashboard }) {
  const kpis = [
    { label: 'Open requests', value: d.openTotal, to: '/requests?status=new,assigned,in_progress,on_hold' },
    {
      label: 'Unassigned',
      value: d.unassigned,
      to: '/requests?assignee=unassigned&status=new',
      warn: d.unassigned > 0,
    },
    { label: 'Overdue', value: d.overdue, to: '/requests?overdue=true&sort=due', warn: d.overdue > 0 },
    {
      label: 'Due in next 48 h',
      value: d.dueNext48h,
      to: '/requests?status=new,assigned,in_progress,on_hold&sort=due',
    },
    {
      label: 'Resolved in last 7 days',
      value: d.resolvedLast7d,
      to: '/requests?status=resolved,closed&sort=-updated',
    },
    { label: 'Median time to resolve (30 days)', value: formatHours(d.medianResolutionHours30d) },
  ];
  return (
    <>
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="visually-hidden">
          Key figures
        </h2>
        <ul className="kpis">
          {kpis.map((k) => (
            <li key={k.label} className={`kpi${k.warn ? ' kpi--warn' : ''}`}>
              {k.to ? (
                <Link to={k.to} className="kpi__link">
                  <span className="kpi__value">{k.value}</span>
                  <span className="kpi__label">{k.label}</span>
                </Link>
              ) : (
                <>
                  <span className="kpi__value">{k.value}</span>
                  <span className="kpi__label">{k.label}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="flow-heading">
          <h2 id="flow-heading">Created and resolved per day</h2>
          <FlowChart daily={d.daily} />
        </section>
        <section className="panel" aria-labelledby="status-heading">
          <h2 id="status-heading">Requests by status</h2>
          <StatusBreakdown counts={d.statusCounts} />
        </section>
      </div>

      <section className="panel" aria-labelledby="workload-heading">
        <h2 id="workload-heading">Technician workload</h2>
        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th scope="col">Technician</th>
                <th scope="col" className="num">
                  Assigned
                </th>
                <th scope="col" className="num">
                  In progress
                </th>
                <th scope="col" className="num">
                  On hold
                </th>
                <th scope="col" className="num">
                  Overdue
                </th>
              </tr>
            </thead>
            <tbody>
              {d.workload.map((w) => (
                <tr key={w.userId}>
                  <th scope="row">
                    <Link to={`/requests?assignee=${w.userId}&status=assigned,in_progress,on_hold`}>
                      {w.name}
                    </Link>
                  </th>
                  <td className="num" data-label="Assigned">
                    {w.assigned}
                  </td>
                  <td className="num" data-label="In progress">
                    {w.inProgress}
                  </td>
                  <td className="num" data-label="On hold">
                    {w.onHold}
                  </td>
                  <td className={`num${w.overdue ? ' text-warn' : ''}`} data-label="Overdue">
                    {w.overdue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const ORDER: Status[] = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'cancelled'];

function StatusBreakdown({ counts }: { counts: Record<Status, number> }) {
  const max = Math.max(1, ...ORDER.map((s) => counts[s]));
  return (
    <ul className="bars">
      {ORDER.map((s) => (
        <li key={s} className="bars__row">
          <Link to={`/requests?status=${s}`} className="bars__label">
            {STATUS_LABEL[s]}
          </Link>
          <span className="bars__track" aria-hidden="true">
            <span
              className={`bars__fill bars__fill--${s}`}
              style={{ width: `${(counts[s] / max) * 100}%` }}
            />
          </span>
          <span className="bars__value">{counts[s]}</span>
        </li>
      ))}
    </ul>
  );
}

function FlowChart({ daily }: { daily: Dashboard['daily'] }) {
  const W = 640;
  const H = 230;
  const pad = { l: 34, r: 8, t: 12, b: 34 };
  const max = niceMax(Math.max(...daily.map((d) => Math.max(d.created, d.resolved)), 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / daily.length;
  const barW = Math.min(14, slot / 2 - 3);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const totalCreated = daily.reduce((s, d) => s + d.created, 0);
  const totalResolved = daily.reduce((s, d) => s + d.resolved, 0);

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--created" />
          Created ({totalCreated})
        </span>
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--resolved" />
          Resolved ({totalResolved})
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="flow-desc" className="chart__svg">
        <desc id="flow-desc">
          Bar chart of requests created and resolved per day over the last {daily.length} days: {totalCreated}{' '}
          created, {totalResolved} resolved. The same data is available as a table below.
        </desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={pad.l - 6} y={y(t)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={d.day}>
              <rect
                x={cx - barW - 1}
                y={y(d.created)}
                width={barW}
                height={pad.t + innerH - y(d.created)}
                className="chart__bar--created"
              />
              <rect
                x={cx + 1}
                y={y(d.resolved)}
                width={barW}
                height={pad.t + innerH - y(d.resolved)}
                className="chart__bar--resolved"
              />
              {i % 2 === daily.length % 2 ? null : (
                <text x={cx} y={H - pad.b + 16} textAnchor="middle" className="chart__tick">
                  {formatDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} className="chart__axis" />
      </svg>
      <details className="chart__table">
        <summary>Show as table</summary>
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className="num">
                Created
              </th>
              <th scope="col" className="num">
                Resolved
              </th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{formatDay(d.day)}</th>
                <td className="num">{d.created}</td>
                <td className="num">{d.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
