export type Role = 'admin' | 'technician' | 'viewer';
export type Status = 'new' | 'assigned' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Customer {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  openRequests: number;
  totalRequests: number;
  contactHidden: boolean;
}

export interface RequestSummary {
  id: string;
  ref: number;
  title: string;
  status: Status;
  priority: Priority;
  customerId: string;
  customerName: string;
  customerCity: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: number;
  overdue: boolean;
  openTasks: number;
  totalTasks: number;
}

export interface RequestDetail extends RequestSummary {
  description: string;
  createdById: string;
  createdByName: string;
}

export interface Task {
  id: string;
  requestId: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
  isDone: boolean;
  doneAt: string | null;
  position: number;
  version: number;
}

export interface Note {
  id: string;
  kind: 'comment' | 'resolution' | 'cancellation' | 'hold';
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

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

export interface RequestBundle {
  request: RequestDetail;
  tasks: Task[];
  notes: Note[];
  allowed: AllowedActions;
}

export interface ActivityEntry {
  id: number;
  actorId: string | null;
  actorName: string | null;
  entityType: 'customer' | 'request' | 'task' | 'session';
  entityId: string | null;
  action: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  openRequests: number;
  inProgress: number;
  overdue: number;
}

export interface Dashboard {
  generatedAt: string;
  timezone: string;
  statusCounts: Record<Status, number>;
  openByPriority: Record<Priority, number>;
  openTotal: number;
  unassigned: number;
  overdue: number;
  dueNext48h: number;
  resolvedLast7d: number;
  medianResolutionHours30d: number | null;
  daily: { day: string; created: number; resolved: number }[];
  workload: {
    userId: string;
    name: string;
    assigned: number;
    inProgress: number;
    onHold: number;
    overdue: number;
  }[];
}
