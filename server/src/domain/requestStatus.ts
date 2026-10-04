export const STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'on_hold',
  'resolved',
  'closed',
  'cancelled',
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const OPEN_STATUSES: readonly Status[] = ['new', 'assigned', 'in_progress', 'on_hold'];
export const TERMINAL_STATUSES: readonly Status[] = ['closed', 'cancelled'];

/**
 * Legal status transitions. `assigned` and `new` are reached only through the assign/unassign
 * operations because they also change the assignee; every other move goes through `transition`.
 */
const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  new: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'new', 'cancelled'],
  in_progress: ['on_hold', 'resolved'],
  on_hold: ['in_progress', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

export const ASSIGNMENT_DRIVEN: readonly Status[] = ['new', 'assigned'];

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: Status): readonly Status[] {
  return TRANSITIONS[from];
}

/** Statuses the `transition` endpoint may move to from `from` (excludes assignment-driven moves). */
export function manualTransitions(from: Status): Status[] {
  return TRANSITIONS[from].filter((s) => !ASSIGNMENT_DRIVEN.includes(s));
}

/** A transition into these statuses must carry an explanatory note. */
export function noteRequiredFor(to: Status): 'resolution' | 'cancellation' | 'hold' | null {
  switch (to) {
    case 'resolved':
      return 'resolution';
    case 'cancelled':
      return 'cancellation';
    case 'on_hold':
      return 'hold';
    default:
      return null;
  }
}

/** Tasks and request fields can change only while the request is open. */
export function isEditable(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isOpen(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}
