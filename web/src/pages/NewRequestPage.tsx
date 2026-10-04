import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../api/client';
import type { Customer, Page, Priority, RequestBundle } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Field } from '../components/Field';
import { ErrorState, Forbidden, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useResource } from '../hooks/useResource';
import { localInputToIso, PRIORITY_LABEL, ref } from '../lib/format';

export function NewRequestPage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const customers = useResource(
    (signal) => api<Page<Customer>>('/api/customers', { signal, query: { pageSize: 100, sort: 'name' } }),
    [],
  );
  const [form, setForm] = useState({
    customerId: params.get('customer') ?? '',
    title: '',
    description: '',
    priority: 'normal' as Priority,
    due: '',
    tasks: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (user.role === 'viewer') return <Forbidden message="Viewers cannot create requests." />;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.customerId) local.customerId = 'Choose a customer.';
    if (form.title.trim().length < 3) local.title = 'Enter at least 3 characters.';
    setErrors(local);
    if (Object.keys(local).length) {
      setFormError('Some fields need attention.');
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      const b = await api<RequestBundle>('/api/requests', {
        method: 'POST',
        body: {
          customerId: form.customerId,
          title: form.title,
          description: form.description,
          priority: form.priority,
          dueAt: localInputToIso(form.due),
          tasks: form.tasks
            .split('\n')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast(`${ref(b.request.ref)} created.`);
      navigate(`/requests/${b.request.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // Server field keys like "tasks.2" are folded into the tasks field.
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) fields[k.split('.')[0]!] ??= v;
        setErrors(fields);
        setFormError(err.message);
      } else setFormError('Could not create the request. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="page page--narrow">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/requests">Requests</Link> <span aria-hidden="true">/</span> New
      </nav>
      <h1>New service request</h1>
      {customers.status === 'error' && <ErrorState error={customers.error} onRetry={customers.reload} />}
      {customers.status === 'loading' && !customers.data && <Loading label="Loading customers" />}
      {customers.data && (
        <form className="panel stack" onSubmit={onSubmit} noValidate>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <Field
            label="Customer"
            error={errors.customerId}
            required
            hint={
              <>
                Not listed? <Link to="/customers/new">Add a customer</Link> first.
              </>
            }
          >
            <select value={form.customerId} onChange={(e) => set('customerId', e.target.value)}>
              <option value="">Choose a customer</option>
              {customers.data.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.city})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" error={errors.title} required hint="What is wrong, in a few words.">
            <input value={form.title} maxLength={160} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Description" error={errors.description}>
            <textarea
              rows={5}
              value={form.description}
              maxLength={5000}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="row-2">
            <Field label="Priority" error={errors.priority}>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due" error={errors.dueAt} hint="Optional, your local time">
              <input type="datetime-local" value={form.due} onChange={(e) => set('due', e.target.value)} />
            </Field>
          </div>
          <Field label="Initial tasks" error={errors.tasks} hint="Optional. One task per line, up to 20.">
            <textarea rows={4} value={form.tasks} onChange={(e) => set('tasks', e.target.value)} />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create request'}
            </button>
            <Link to="/requests" className="btn btn--quiet">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
