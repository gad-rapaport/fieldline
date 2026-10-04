import { describe, expect, it } from 'vitest';
import { allowedActionsFor, policy } from '../../server/src/domain/permissions.js';
import type { Actor, RequestFacts } from '../../server/src/domain/permissions.js';
import {
  canTransition,
  isEditable,
  manualTransitions,
  noteRequiredFor,
  STATUSES,
} from '../../server/src/domain/requestStatus.js';

const admin: Actor = { id: 'a', role: 'admin' };
const tech: Actor = { id: 't1', role: 'technician' };
const otherTech: Actor = { id: 't2', role: 'technician' };
const viewer: Actor = { id: 'v', role: 'viewer' };
const inProgressForTech: RequestFacts = { status: 'in_progress', assigneeId: 't1' };

describe('status machine', () => {
  it('has no way out of terminal states', () => {
    for (const to of STATUSES) {
      expect(canTransition('closed', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });

  it('cannot skip work: new requests are never resolved or closed directly', () => {
    expect(canTransition('new', 'resolved')).toBe(false);
    expect(canTransition('new', 'closed')).toBe(false);
    expect(canTransition('assigned', 'resolved')).toBe(false);
  });

  it('allows reopening a resolved request but not a closed one', () => {
    expect(canTransition('resolved', 'in_progress')).toBe(true);
    expect(canTransition('closed', 'in_progress')).toBe(false);
  });

  it('never offers assignment-driven statuses as manual transitions', () => {
    for (const from of STATUSES) {
      expect(manualTransitions(from)).not.toContain('new');
      expect(manualTransitions(from)).not.toContain('assigned');
    }
  });

  it('requires notes exactly for resolve, cancel and hold', () => {
    expect(STATUSES.filter((s) => noteRequiredFor(s) !== null).sort()).toEqual([
      'cancelled',
      'on_hold',
      'resolved',
    ]);
  });

  it('treats only open statuses as editable', () => {
    expect(STATUSES.filter(isEditable)).toEqual(['new', 'assigned', 'in_progress', 'on_hold']);
  });
});

describe('permission policy', () => {
  it('lets the assigned technician progress their own work only', () => {
    expect(policy.transition(tech, inProgressForTech, 'resolved')).toBe(true);
    expect(policy.transition(otherTech, inProgressForTech, 'resolved')).toBe(false);
  });

  it('reserves closing and cancelling for admins', () => {
    const resolved: RequestFacts = { status: 'resolved', assigneeId: 't1' };
    expect(policy.transition(tech, resolved, 'closed')).toBe(false);
    expect(policy.transition(admin, resolved, 'closed')).toBe(true);
    expect(policy.transition(tech, { status: 'on_hold', assigneeId: 't1' }, 'cancelled')).toBe(false);
  });

  it('never grants a policy decision for an illegal transition, even to admins', () => {
    expect(policy.transition(admin, { status: 'new', assigneeId: null }, 'resolved')).toBe(false);
  });

  it('allows claiming only unassigned new requests', () => {
    expect(policy.claimRequest(tech, { status: 'new', assigneeId: null })).toBe(true);
    expect(policy.claimRequest(tech, { status: 'assigned', assigneeId: 't2' })).toBe(false);
    expect(policy.claimRequest(admin, { status: 'new', assigneeId: null })).toBe(false);
  });

  it('gives viewers nothing to do', () => {
    const actions = allowedActionsFor(viewer, inProgressForTech, true);
    expect(Object.values(actions).every((v) => v === false || (Array.isArray(v) && v.length === 0))).toBe(
      true,
    );
  });

  it('exposes the same transitions to the UI that the server will accept', () => {
    for (const from of STATUSES) {
      const facts: RequestFacts = { status: from, assigneeId: from === 'new' ? null : 't1' };
      for (const actor of [admin, tech, otherTech, viewer]) {
        const offered = allowedActionsFor(actor, facts, isEditable(from)).transitions;
        for (const to of offered) expect(policy.transition(actor, facts, to)).toBe(true);
      }
    }
  });
});
