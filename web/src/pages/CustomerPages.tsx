import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../api/client';
import type { Customer, RequestSummary } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { Field } from '../components/Field';
import { Empty, ErrorState, Forbidden, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useResource } from '../hooks/useResource';
import { formatDateTime, formatRelative, ref } from '../lib/format';

interface CustomerDraft {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
}

const emptyDraft: CustomerDraft = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  notes: '',
};

const toDraft = (c: Customer): CustomerDraft => ({
  name: c.name,
  contactName: c.contactName ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  address: c.address ?? '',
  city: c.city,
  notes: c.notes,
});

function CustomerForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CustomerDraft;
  submitLabel: string;
  onSubmit: (d: CustomerDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const set = (k: keyof CustomerDraft, v: string) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      await onSubmit(d);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('Saving failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="row-2">
        <Field label="Name" error={errors.name} required>
          <input value={d.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="City" error={errors.city} required>
          <input value={d.city} maxLength={80} onChange={(e) => set('city', e.target.value)} />
        </Field>
      </div>
      <div className="row-2">
        <Field label="Contact person" error={errors.contactName}>
          <input
            value={d.contactName}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => set('contactName', e.target.value)}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input
            type="tel"
            value={d.phone}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>
      </div>
      <div className="row-2">
        <Field label="Email" error={errors.email}>
          <input
            type="email"
            value={d.email}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Address" error={errors.address}>
          <input
            value={d.address}
            maxLength={240}
            autoComplete="off"
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Site notes" error={errors.notes} hint="Access instructions, opening hours, parking.">
        <textarea rows={3} value={d.notes} maxLength={2000} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NewCustomerPage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  if (user.role === 'viewer') return <Forbidden message="Viewers cannot add customers." />;
  return (
    <div className="page page--narrow">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/customers">Customers</Link> <span aria-hidden="true">/</span> New
      </nav>
      <h1>New customer</h1>
      <div className="panel">
        <CustomerForm
          initial={emptyDraft}
          submitLabel="Create customer"
          onCancel={() => navigate('/customers')}
          onSubmit={async (d) => {
            const c = await api<Customer>('/api/customers', { method: 'POST', body: d });
            toast(`${c.name} added.`);
            navigate(`/customers/${c.id}`);
          }}
        />
      </div>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const toast = useToast();
  const res = useResource(
    (signal) =>
      api<{ customer: Customer; recentRequests: RequestSummary[] }>(`/api/customers/${id}`, { signal }),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState(false);

  if (res.status === 'error' && !res.data) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading label="Loading customer" />;
  const { customer: c, recentRequests } = res.data;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/customers">Customers</Link> <span aria-hidden="true">/</span> {c.name}
      </nav>
      <header className="page__head">
        <div>
          <h1>{c.name}</h1>
          <p className="page__sub">
            {c.city} · {c.openRequests} open of {c.totalRequests} requests
          </p>
        </div>
        <div className="actions">
          {user.role !== 'viewer' && (
            <Link to={`/requests/new?customer=${c.id}`} className="btn btn--primary">
              New request
            </Link>
          )}
          {user.role === 'admin' && !editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit customer
            </button>
          )}
        </div>
      </header>

      <div className="grid-2">
        <section className="panel" aria-labelledby="contact-heading">
          <h2 id="contact-heading">{editing ? 'Edit customer' : 'Contact and site'}</h2>
          {conflict && (
            <div className="conflict" role="alert">
              <p className="conflict__title">This customer was changed by someone else</p>
              <p>
                Your edit was not saved. The form now shows the latest saved details; re-apply your change if
                it is still needed.
              </p>
            </div>
          )}
          {editing ? (
            <CustomerForm
              key={c.version}
              initial={toDraft(c)}
              submitLabel="Save customer"
              onCancel={() => {
                setEditing(false);
                setConflict(false);
              }}
              onSubmit={async (d) => {
                try {
                  const updated = await api<Customer>(`/api/customers/${c.id}`, {
                    method: 'PUT',
                    body: { ...d, expectedVersion: c.version },
                  });
                  res.setData({ customer: updated, recentRequests });
                  setEditing(false);
                  setConflict(false);
                  toast('Customer saved.');
                } catch (err) {
                  if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
                    setConflict(true);
                    res.setData({ customer: err.details?.current as Customer, recentRequests });
                    return;
                  }
                  throw err;
                }
              }}
            />
          ) : c.contactHidden ? (
            <p className="muted">Contact details are hidden for the viewer role.</p>
          ) : (
            <dl className="facts">
              <dt>Contact</dt>
              <dd>{c.contactName || '—'}</dd>
              <dt>Phone</dt>
              <dd className="mono">{c.phone || '—'}</dd>
              <dt>Email</dt>
              <dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Address</dt>
              <dd>
                {c.address || '—'}, {c.city}
              </dd>
              <dt>Site notes</dt>
              <dd>{c.notes || <span className="muted">None</span>}</dd>
              <dt>Last updated</dt>
              <dd>{formatDateTime(c.updatedAt)}</dd>
            </dl>
          )}
        </section>

        <section className="panel" aria-labelledby="history-heading">
          <h2 id="history-heading">Recent requests</h2>
          {recentRequests.length === 0 ? (
            <Empty title="No requests for this customer yet" />
          ) : (
            <ul className="mini-list">
              {recentRequests.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`}>
                    <span className="mono">{ref(r.ref)}</span> {r.title}
                  </Link>
                  <span className="mini-list__meta">
                    <StatusBadge status={r.status} /> <PriorityTag priority={r.priority} />{' '}
                    <span className="muted small">{formatRelative(r.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.totalRequests > recentRequests.length && (
            <p className="small">
              <Link to={`/requests?q=${encodeURIComponent(c.name)}`}>All {c.totalRequests} requests</Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
