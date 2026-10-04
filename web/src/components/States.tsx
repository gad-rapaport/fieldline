import type { ReactNode } from 'react';
import type { ApiError } from '../api/client';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children && <div className="state__body">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | undefined; onRetry?: () => void }) {
  if (error?.status === 403) return <Forbidden message={error.message} />;
  if (error?.status === 404) {
    return (
      <div className="state state--error" role="alert">
        <p className="state__title">Not found</p>
        <p className="state__body">{error.message} It may have been removed, or the link is wrong.</p>
      </div>
    );
  }
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">This could not be loaded</p>
      <p className="state__body">
        {error?.message ?? 'Unexpected error.'}
        {error?.requestId && <span className="mono muted"> Request id {error.requestId}.</span>}
      </p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="state state--forbidden" role="alert">
      <p className="state__title">Not available for your role</p>
      <p className="state__body">{message ?? 'Ask an admin if you need access to this area.'}</p>
    </div>
  );
}
