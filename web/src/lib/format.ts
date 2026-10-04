import type { Priority, Role, Status } from '../api/types';

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  technician: 'Technician',
  viewer: 'Viewer',
};

/** Button wording for each target status, phrased as the action the user takes. */
export const TRANSITION_VERB: Partial<Record<Status, string>> = {
  in_progress: 'Start work',
  on_hold: 'Put on hold',
  resolved: 'Resolve',
  closed: 'Close',
  cancelled: 'Cancel request',
};

export const ref = (n: number) => `SR-${n}`;

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatDay(isoDay: string): string {
  return dateOnly.format(new Date(`${isoDay}T12:00:00`));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < hour) return relative.format(Math.round(diff / minute), 'minute');
  if (abs < day) return relative.format(Math.round(diff / hour), 'hour');
  return relative.format(Math.round(diff / day), 'day');
}

/** `datetime-local` value (browser wall clock) to an ISO instant with offset, and back. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}
