import type { Status } from './requestStatus.js';
import { canTransition, manualTransitions } from './requestStatus.js';

export const ROLES = ['admin', 'technician', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  id: string;
  role: Role;
}

/** The parts of a request that authorisation decisions depend on. */
export interface RequestFacts {
  status: Status;
  assigneeId: string | null;
}

const isAdmin = (a: Actor) => a.role === 'admin';
const isTechnician = (a: Actor) => a.role === 'technician';
const isAssignee = (a: Actor, r: RequestFacts) => r.assigneeId !== null && r.assigneeId === a.id;

/**
 * Central authorisation policy. Routes call these functions; the UI receives their results through
 * `allowedActions` so that it never has to re-implement the rules.
 */
export const policy = {
  /** Coarse gate checked before any request mutation; finer rules follow per operation. */
  mutateRequests: (a: Actor) => isAdmin(a) || isTechnician(a),
  viewContactDetails: (a: Actor) => a.role !== 'viewer',
  createCustomer: (a: Actor) => isAdmin(a) || isTechnician(a),
  updateCustomer: (a: Actor) => isAdmin(a),
  createRequest: (a: Actor) => isAdmin(a) || isTechnician(a),
  /** Title, description, priority and due date. */
  updateRequest: (a: Actor, r: RequestFacts) => isAdmin(a) || (isTechnician(a) && isAssignee(a, r)),
  changePriority: (a: Actor) => isAdmin(a),
  /** Assign or reassign to anyone. */
  assignRequest: (a: Actor) => isAdmin(a),
  /** A technician may take an unassigned new request for themselves. */
  claimRequest: (a: Actor, r: RequestFacts) => isTechnician(a) && r.status === 'new' && r.assigneeId === null,
  transition: (a: Actor, r: RequestFacts, to: Status) => {
    if (!canTransition(r.status, to)) return false;
    if (isAdmin(a)) return true;
    if (!isTechnician(a) || !isAssignee(a, r)) return false;
    // Closing confirms the customer accepted the work; cancelling drops a commitment. Both are admin decisions.
    return to !== 'closed' && to !== 'cancelled';
  },
  manageTasks: (a: Actor, r: RequestFacts) => isAdmin(a) || (isTechnician(a) && isAssignee(a, r)),
  addNote: (a: Actor) => isAdmin(a) || isTechnician(a),
  readActivityLog: (a: Actor) => isAdmin(a),
  viewUserEmails: (a: Actor) => isAdmin(a),
};

export interface AllowedActions {
  edit: boolean;
  changePriority: boolean;
  assign: boolean;
  claim: boolean;
  unassign: boolean;
  transitions: Status[];
  manageTasks: boolean;
  addNote: boolean;
}

export function allowedActionsFor(actor: Actor, r: RequestFacts, editable: boolean): AllowedActions {
  return {
    edit: editable && policy.updateRequest(actor, r),
    changePriority: editable && policy.changePriority(actor),
    assign: policy.assignRequest(actor) && ['new', 'assigned', 'in_progress', 'on_hold'].includes(r.status),
    claim: policy.claimRequest(actor, r),
    unassign: policy.assignRequest(actor) && r.status === 'assigned',
    transitions: manualTransitions(r.status).filter((to) => policy.transition(actor, r, to)),
    manageTasks: editable && policy.manageTasks(actor, r),
    addNote: policy.addNote(actor) && r.status !== 'closed' && r.status !== 'cancelled',
  };
}
