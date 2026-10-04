export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_REJECTED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE'
  | 'ILLEGAL_TRANSITION'
  | 'TASKS_OPEN'
  | 'NOTE_REQUIRED'
  | 'REQUEST_LOCKED'
  | 'INVALID_ASSIGNEE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} was not found.`);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, 'FORBIDDEN', message);

/** Thrown when the client's expectedVersion no longer matches. Carries the current record so the UI can merge. */
export const versionConflict = (current: unknown) =>
  new AppError(
    409,
    'VERSION_CONFLICT',
    'This record was changed by someone else after you opened it. Review the latest version and apply your change again.',
    { current },
  );
