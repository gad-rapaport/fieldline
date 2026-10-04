import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/Field';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login__brand" aria-label="About Fieldline">
        <span className="brand brand--large">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="brand__mark">
            <rect width="32" height="32" rx="6" />
            <path d="M8 9h16M8 16h11M8 23h6" />
          </svg>
          Fieldline
        </span>
        <p className="login__tagline">
          Service requests, field tasks and team workload in one operational view.
        </p>
        <ul className="login__facts">
          <li>Role-based access enforced on the server</li>
          <li>Status rules with an audit trail</li>
          <li>Safe concurrent editing</li>
        </ul>
      </section>
      <main className="login__panel">
        <form
          className="login__form"
          onSubmit={onSubmit}
          noValidate
          aria-describedby={error ? 'login-error' : undefined}
        >
          <h1>Sign in</h1>
          {error && (
            <p id="login-error" className="form-error" role="alert">
              {error}
            </p>
          )}
          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={busy || !email || !password}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="login__demo">
            <p className="login__demo-title">Demo accounts</p>
            <dl>
              <dt>Admin</dt>
              <dd className="mono">admin@fieldline.test</dd>
              <dt>Technician</dt>
              <dd className="mono">noa@fieldline.test</dd>
              <dt>Viewer</dt>
              <dd className="mono">viewer@fieldline.test</dd>
            </dl>
            <p className="muted small">
              Passwords are generated per installation and stored in the local .env file.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
