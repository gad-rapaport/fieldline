import type { ReactNode } from 'react';
import type { Priority, Status } from '../api/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format';

/** Each status has a distinct glyph as well as a colour and a text label, so colour is never the only cue. */
const STATUS_GLYPH: Record<Status, ReactNode> = {
  new: <circle cx="8" cy="8" r="5" fill="none" strokeWidth="2" />,
  assigned: (
    <>
      <circle cx="8" cy="8" r="5" fill="none" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2" strokeWidth="0" />
    </>
  ),
  in_progress: <path d="M5 4l7 4-7 4z" strokeWidth="0" />,
  on_hold: <path d="M5 4v8M11 4v8" strokeWidth="2.4" fill="none" />,
  resolved: <path d="M3.5 8.5l3 3 6-7" strokeWidth="2.2" fill="none" />,
  closed: <rect x="3.5" y="3.5" width="9" height="9" rx="1" strokeWidth="0" />,
  cancelled: <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2.2" fill="none" />,
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge--${status}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="badge__glyph">
        {STATUS_GLYPH[status]}
      </svg>
      {STATUS_LABEL[status]}
    </span>
  );
}

const LEVEL: Record<Priority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };

export function PriorityTag({ priority }: { priority: Priority }) {
  const level = LEVEL[priority];
  return (
    <span className={`priority priority--${priority}`}>
      <span className="priority__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= level ? 'on' : undefined} />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
