import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, toApiError } from '../api/client';
import type { ActivityEntry, RequestBundle, RequestDetail, Status, Task, TeamMember } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { PriorityTag, StatusBadge } from '../components/Badges';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useResource } from '../hooks/useResource';
import {
  formatDateTime,
  formatRelative,
  isoToLocalInput,
  localInputToIso,
  PRIORITY_LABEL,
  ref,
  STATUS_LABEL,
  TRANSITION_VERB,
} from '../lib/format';

const NOTE_PROMPT: Partial<Record<Status, string>> = {
  resolved: 'Resolution summary',
  cancelled: 'Reason for cancelling',
  on_hold: 'What is the request waiting for?',
};

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const toast = useToast();
  const bundle = useResource((signal) => api<RequestBundle>(`/api/requests/${id}`, { signal }), [id]);
  const [activityKey, setActivityKey] = useState(0);
  const activity = useResource(
    (signal) => api<{ items: ActivityEntry[] }>(`/api/requests/${id}/activity`, { signal }),
    [id, activityKey],
  );
  const team = useResource((signal) => api<{ items: TeamMember[] }>('/api/users', { signal }), []);
  const [busy, setBusy] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);

  if (bundle.status === 'error' && !bundle.data)
    return <ErrorState error={bundle.error} onRetry={bundle.reload} />;
  if (!bundle.data) return <Loading label="Loading request" />;
  const { request, tasks, notes, allowed } = bundle.data;

  /** Runs a mutation with consistent busy, success and conflict handling. */
  async function mutate<T>(fn: () => Promise<T>, success: string, apply?: (result: T) => void) {
    setBusy(true);
    try {
      const result = await fn();
      if (apply) apply(result);
      setActivityKey((k) => k + 1);
      toast(success);
      return true;
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'VERSION_CONFLICT') {
        toast(
          'Someone else changed this request a moment ago. The latest version is now shown; check it and try again.',
          'error',
        );
        bundle.reload();
        setActivityKey((k) => k + 1);
      } else {
        toast(e.message, 'error');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const applyBundle = (b: RequestBundle) => bundle.setData(b);

  const transition = (to: Status, note?: string) =>
    mutate(
      () =>
        api<RequestBundle>(`/api/requests/${id}/transition`, {
          method: 'POST',
          body: { expectedVersion: request.version, to, note },
        }),
      `Status changed to ${STATUS_LABEL[to]}.`,
      applyBundle,
    );

  const assign = (assigneeId: string | null, success: string) =>
    mutate(
      () =>
        api<RequestBundle>(`/api/requests/${id}/assign`, {
          method: 'POST',
          body: { expectedVersion: request.version, assigneeId },
        }),
      success,
      applyBundle,
    );

  const replaceTask = (task: Task) =>
    bundle.setData({ ...bundle.data!, tasks: tasks.map((t) => (t.id === task.id ? task : t)) });

  const technicians = (team.data?.items ?? []).filter((m) => m.role === 'technician');

  return (
    <div className="page page--detail">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/requests">Requests</Link> <span aria-hidden="true">/</span>{' '}
        <span className="mono">{ref(request.ref)}</span>
      </nav>

      <header className="detail-head">
        <div>
          <p className="detail-head__ref mono">{ref(request.ref)}</p>
          <h1>{request.title}</h1>
          <div className="detail-head__tags">
            <StatusBadge status={request.status} />
            <PriorityTag priority={request.priority} />
            {request.overdue && <span className="flag flag--overdue">Overdue</span>}
          </div>
        </div>
        {allowed.edit && !editing && (
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Edit details
          </button>
        )}
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          {editing ? (
            <EditRequestForm
              request={request}
              canChangePriority={allowed.changePriority}
              onCancel={() => setEditing(false)}
              onSaved={(b) => {
                applyBundle(b);
                setEditing(false);
                setActivityKey((k) => k + 1);
                toast('Request updated.');
              }}
              onReload={() => bundle.reload()}
            />
          ) : (
            <section className="panel" aria-labelledby="desc-heading">
              <h2 id="desc-heading">Description</h2>
              <p className="prose">{request.description || <span className="muted">No description.</span>}</p>
            </section>
          )}

          <TasksPanel
            requestId={id}
            tasks={tasks}
            canManage={allowed.manageTasks}
            busy={busy}
            onChanged={(t) => {
              replaceTask(t);
              setActivityKey((k) => k + 1);
            }}
            onAdded={(t) => {
              bundle.setData({ ...bundle.data!, tasks: [...tasks, t] });
              setActivityKey((k) => k + 1);
            }}
            onRemoved={(taskId) => {
              bundle.setData({ ...bundle.data!, tasks: tasks.filter((t) => t.id !== taskId) });
              setActivityKey((k) => k + 1);
            }}
            onConflict={() => bundle.reload()}
          />

          <NotesPanel
            requestId={id}
            notes={notes}
            canAdd={allowed.addNote}
            onAdded={(items) => {
              bundle.setData({ ...bundle.data!, notes: items });
              setActivityKey((k) => k + 1);
            }}
          />
        </div>

        <aside className="detail-side" aria-label="Request facts and actions">
          <section className="panel" aria-labelledby="actions-heading">
            <h2 id="actions-heading">Actions</h2>
            {allowed.transitions.length === 0 && !allowed.assign && !allowed.claim && !allowed.unassign ? (
              <p className="muted small">
                {user.role === 'viewer'
                  ? 'Your role is read-only.'
                  : request.status === 'closed' || request.status === 'cancelled'
                    ? `This request is ${STATUS_LABEL[request.status].toLowerCase()}; no further changes are possible.`
                    : 'No actions available to you for this request.'}
              </p>
            ) : (
              <div className="actions">
                {allowed.transitions.map((to) => (
                  <button
                    key={to}
                    type="button"
                    className={`btn${to === 'resolved' || to === 'in_progress' ? ' btn--primary' : ''}${to === 'cancelled' ? ' btn--danger' : ''}`}
                    disabled={busy}
                    onClick={() => (NOTE_PROMPT[to] ? setPendingTransition(to) : void transition(to))}
                  >
                    {request.status === 'resolved' && to === 'in_progress'
                      ? 'Reopen'
                      : request.status === 'on_hold' && to === 'in_progress'
                        ? 'Resume work'
                        : TRANSITION_VERB[to]}
                  </button>
                ))}
                {allowed.claim && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void assign(user.id, 'You claimed this request.')}
                  >
                    Claim this request
                  </button>
                )}
                {allowed.assign && (
                  <AssignControl
                    current={request.assigneeId}
                    technicians={technicians}
                    busy={busy}
                    onAssign={(techId) => {
                      const name = technicians.find((t) => t.id === techId)?.fullName ?? 'technician';
                      void assign(techId, `Assigned to ${name}.`);
                    }}
                  />
                )}
                {allowed.unassign && (
                  <button
                    type="button"
                    className="btn btn--quiet"
                    disabled={busy}
                    onClick={() => void assign(null, 'Returned to the unassigned queue.')}
                  >
                    Unassign
                  </button>
                )}
              </div>
            )}
            {request.status === 'in_progress' &&
              tasks.some((t) => !t.isDone) &&
              allowed.transitions.includes('resolved') && (
                <p className="hint-line">Resolving requires all tasks to be done.</p>
              )}
          </section>

          <section className="panel" aria-labelledby="facts-heading">
            <h2 id="facts-heading">Details</h2>
            <dl className="facts">
              <dt>Customer</dt>
              <dd>
                <Link to={`/customers/${request.customerId}`}>{request.customerName}</Link>
                <span className="muted small block">{request.customerCity}</span>
              </dd>
              <dt>Assignee</dt>
              <dd>{request.assigneeName ?? <span className="muted">Unassigned</span>}</dd>
              <dt>Priority</dt>
              <dd>{PRIORITY_LABEL[request.priority]}</dd>
              <dt>Due</dt>
              <dd>
                {request.dueAt ? (
                  <>
                    {formatDateTime(request.dueAt)}
                    <span className={`small block${request.overdue ? ' text-warn' : ' muted'}`}>
                      {formatRelative(request.dueAt)}
                    </span>
                  </>
                ) : (
                  <span className="muted">No due date</span>
                )}
              </dd>
              <dt>Opened</dt>
              <dd>
                {formatDateTime(request.createdAt)}
                <span className="muted small block">by {request.createdByName}</span>
              </dd>
              {request.resolvedAt && (
                <>
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(request.resolvedAt)}</dd>
                </>
              )}
              <dt>Last change</dt>
              <dd>
                {formatRelative(request.updatedAt)}
                <span className="muted small block mono">version {request.version}</span>
              </dd>
            </dl>
          </section>

          <section className="panel" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading">Activity</h2>
            {activity.status === 'error' && <ErrorState error={activity.error} onRetry={activity.reload} />}
            {!activity.data && activity.status === 'loading' && <Loading label="Loading activity" />}
            {activity.data && (
              <ol className="timeline">
                {activity.data.items.map((a) => (
                  <li key={a.id}>
                    <p className="timeline__summary">{a.summary}</p>
                    <p className="timeline__meta">
                      {a.actorName ?? 'System'} ·{' '}
                      <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <TransitionDialog
        to={pendingTransition}
        busy={busy}
        onClose={() => setPendingTransition(null)}
        onConfirm={async (note) => {
          const ok = await transition(pendingTransition!, note);
          if (ok) setPendingTransition(null);
        }}
      />
    </div>
  );
}

function AssignControl({
  current,
  technicians,
  busy,
  onAssign,
}: {
  current: string | null;
  technicians: TeamMember[];
  busy: boolean;
  onAssign: (id: string) => void;
}) {
  const [choice, setChoice] = useState(current ?? '');
  return (
    <form
      className="assign"
      onSubmit={(e) => {
        e.preventDefault();
        if (choice) onAssign(choice);
      }}
    >
      <label className="inline-field inline-field--stack">
        <span>{current ? 'Reassign to' : 'Assign to'}</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose technician</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName} ({t.openRequests} open)
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn" disabled={busy || !choice || choice === current}>
        Assign
      </button>
    </form>
  );
}

function TransitionDialog({
  to,
  busy,
  onClose,
  onConfirm,
}: {
  to: Status | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open={to !== null}
      title={to ? `${TRANSITION_VERB[to]}: ${STATUS_LABEL[to]}` : ''}
      onClose={() => {
        setNote('');
        setError(undefined);
        onClose();
      }}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) {
            setError('A short note is required for this change.');
            return;
          }
          await onConfirm(note.trim());
          setNote('');
          setError(undefined);
        }}
      >
        <Field label={to ? (NOTE_PROMPT[to] ?? 'Note') : 'Note'} error={error} required>
          <textarea rows={4} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="form-actions">
          <button
            type="submit"
            className={`btn ${to === 'cancelled' ? 'btn--danger' : 'btn--primary'}`}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface Draft {
  title: string;
  description: string;
  priority: RequestDetail['priority'];
  due: string;
}

const draftOf = (r: RequestDetail): Draft => ({
  title: r.title,
  description: r.description,
  priority: r.priority,
  due: isoToLocalInput(r.dueAt),
});

function EditRequestForm({
  request,
  canChangePriority,
  onCancel,
  onSaved,
  onReload,
}: {
  request: RequestDetail;
  canChangePriority: boolean;
  onCancel: () => void;
  onSaved: (b: RequestBundle) => void;
  onReload: () => void;
}) {
  const [base, setBase] = useState(request);
  const [draft, setDraft] = useState<Draft>(() => draftOf(request));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<RequestDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(expectedVersion: number) {
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      const b = await api<RequestBundle>(`/api/requests/${request.id}`, {
        method: 'PATCH',
        body: {
          expectedVersion,
          title: draft.title,
          description: draft.description,
          ...(canChangePriority ? { priority: draft.priority } : {}),
          dueAt: localInputToIso(draft.due),
        },
      });
      onSaved(b);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setConflict(err.details?.current as RequestDetail);
      } else if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError('Saving failed. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(base.version);
  };

  const theirs = conflict ? draftOf(conflict) : null;
  const mine = draftOf(base);
  const fieldsInConflict = theirs
    ? (Object.keys(draft) as (keyof Draft)[]).filter((k) => theirs[k] !== mine[k] || draft[k] !== mine[k])
    : [];

  return (
    <section className="panel" aria-labelledby="edit-heading">
      <h2 id="edit-heading">Edit request</h2>
      {conflict && theirs && (
        <div className="conflict" role="alert">
          <p className="conflict__title">This request changed while you were editing</p>
          <p>
            Your changes have <strong>not</strong> been saved. Compare the versions, then keep yours or start
            again from the latest.
          </p>
          <table className="table table--compact conflict__table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Latest saved</th>
                <th scope="col">Your edit</th>
              </tr>
            </thead>
            <tbody>
              {fieldsInConflict.map((k) => (
                <tr key={k}>
                  <th scope="row">{k === 'due' ? 'Due' : k[0]!.toUpperCase() + k.slice(1)}</th>
                  <td>{theirs[k] || '—'}</td>
                  <td>{draft[k] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={() => {
                setBase(conflict);
                setConflict(null);
                void save(conflict.version);
              }}
            >
              Save my version over theirs
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setBase(conflict);
                setDraft(draftOf(conflict));
                setConflict(null);
                onReload();
              }}
            >
              Discard mine, edit the latest
            </button>
          </div>
        </div>
      )}
      <form className="stack" onSubmit={onSubmit} noValidate>
        {formError && !conflict && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <Field label="Title" error={errors.title} required>
          <input value={draft.title} maxLength={160} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea
            rows={5}
            value={draft.description}
            maxLength={5000}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <div className="row-2">
          <Field
            label="Priority"
            error={errors.priority}
            hint={canChangePriority ? undefined : 'Only admins can change priority.'}
          >
            <select
              value={draft.priority}
              disabled={!canChangePriority}
              onChange={(e) => set('priority', e.target.value as Draft['priority'])}
            >
              {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due" error={errors.dueAt} hint="Your local time">
            <input type="datetime-local" value={draft.due} onChange={(e) => set('due', e.target.value)} />
          </Field>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving || Boolean(conflict)}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function TasksPanel({
  requestId,
  tasks,
  canManage,
  busy,
  onChanged,
  onAdded,
  onRemoved,
  onConflict,
}: {
  requestId: string;
  tasks: Task[];
  canManage: boolean;
  busy: boolean;
  onChanged: (t: Task) => void;
  onAdded: (t: Task) => void;
  onRemoved: (id: string) => void;
  onConflict: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const done = tasks.filter((t) => t.isDone).length;

  async function call<T>(taskId: string, fn: () => Promise<T>, then: (r: T) => void) {
    setPending(taskId);
    try {
      then(await fn());
    } catch (err) {
      const e = toApiError(err);
      toast(
        e.code === 'VERSION_CONFLICT'
          ? 'That task was changed by someone else; the list has been refreshed.'
          : e.message,
        'error',
      );
      if (e.code === 'VERSION_CONFLICT') onConflict();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="tasks-heading">
      <div className="panel__head">
        <h2 id="tasks-heading">Tasks</h2>
        <p className="muted small" aria-live="polite">
          {tasks.length ? `${done} of ${tasks.length} done` : 'No tasks'}
        </p>
      </div>
      {tasks.length > 0 && (
        <ul className="tasks">
          {tasks.map((t) => (
            <li key={t.id} className={t.isDone ? 'is-done' : undefined}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={optimistic[t.id] ?? t.isDone}
                  disabled={!canManage || busy || pending === t.id}
                  onChange={(e) => {
                    const isDone = e.target.checked;
                    // Show the new state immediately; it reverts if the server refuses the change.
                    setOptimistic((o) => ({ ...o, [t.id]: isDone }));
                    void call(
                      t.id,
                      () =>
                        api<Task>(`/api/tasks/${t.id}`, {
                          method: 'PATCH',
                          body: { expectedVersion: t.version, isDone },
                        }),
                      onChanged,
                    ).finally(() =>
                      setOptimistic((o) => {
                        const { [t.id]: _, ...rest } = o;
                        return rest;
                      }),
                    );
                  }}
                />
                <span>{t.title}</span>
              </label>
              {t.doneAt && <span className="muted small">done {formatRelative(t.doneAt)}</span>}
              {canManage &&
                (confirmRemove === t.id ? (
                  <span className="tasks__confirm">
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      disabled={pending === t.id}
                      onClick={() =>
                        void call(
                          t.id,
                          () => api<void>(`/api/tasks/${t.id}`, { method: 'DELETE' }),
                          () => {
                            onRemoved(t.id);
                            setConfirmRemove(null);
                          },
                        )
                      }
                    >
                      Confirm remove
                    </button>
                    <button
                      type="button"
                      className="btn btn--quiet btn--small"
                      onClick={() => setConfirmRemove(null)}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => setConfirmRemove(t.id)}
                    aria-label={`Remove task ${t.title}`}
                  >
                    Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2) {
              setError('Enter at least 2 characters.');
              return;
            }
            setError(undefined);
            void call(
              'new',
              () =>
                api<Task>(`/api/requests/${requestId}/tasks`, {
                  method: 'POST',
                  body: { title: title.trim() },
                }),
              (t) => {
                onAdded(t);
                setTitle('');
              },
            );
          }}
        >
          <Field label="New task" error={error}>
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <button type="submit" className="btn" disabled={pending === 'new'}>
            Add task
          </button>
        </form>
      )}
    </section>
  );
}

const NOTE_KIND_LABEL = {
  comment: 'Note',
  resolution: 'Resolution',
  cancellation: 'Cancellation',
  hold: 'On hold',
} as const;

function NotesPanel({
  requestId,
  notes,
  canAdd,
  onAdded,
}: {
  requestId: string;
  notes: RequestBundle['notes'];
  canAdd: boolean;
  onAdded: (notes: RequestBundle['notes']) => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <section className="panel" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes</h2>
      {notes.length === 0 ? (
        <p className="muted small">No notes yet.</p>
      ) : (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n.id} className={`note note--${n.kind}`}>
              <p className="note__meta">
                <span className="note__kind">{NOTE_KIND_LABEL[n.kind]}</span> {n.authorName} ·{' '}
                <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
              </p>
              <p className="prose">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            setSaving(true);
            try {
              const r = await api<{ items: RequestBundle['notes'] }>(`/api/requests/${requestId}/notes`, {
                method: 'POST',
                body: { body: body.trim() },
              });
              onAdded(r.items);
              setBody('');
              toast('Note added.');
            } catch (err) {
              toast(toApiError(err).message, 'error');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label="Add a note">
            <textarea rows={3} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving || !body.trim()}>
              {saving ? 'Adding…' : 'Add note'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
