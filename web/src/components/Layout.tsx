import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useUser } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import { useToast } from './Toast';

const NAV = [
  { to: '/', label: 'Dashboard', end: true, adminOnly: false },
  { to: '/requests', label: 'Requests', end: false, adminOnly: false },
  { to: '/customers', label: 'Customers', end: false, adminOnly: false },
  { to: '/team', label: 'Team', end: false, adminOnly: false },
  { to: '/activity', label: 'Activity log', end: false, adminOnly: true },
];

export function Layout() {
  const user = useUser();
  const { signOut } = useAuth();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="sidebar">
        <div className="sidebar__top">
          <span className="brand">
            <svg viewBox="0 0 32 32" aria-hidden="true" className="brand__mark">
              <rect width="32" height="32" rx="6" />
              <path d="M8 9h16M8 16h11M8 23h6" />
            </svg>
            Fieldline
          </span>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="primary-nav" aria-label="Primary" className={`nav${menuOpen ? ' is-open' : ''}`}>
          <ul>
            {NAV.filter((n) => !n.adminOnly || user.role === 'admin').map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className="nav__link">
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="whoami">
            <p className="whoami__name">{user.fullName}</p>
            <p className="whoami__role">
              <span className={`role-chip role-chip--${user.role}`}>{ROLE_LABEL[user.role]}</span>
            </p>
            <button
              type="button"
              className="btn btn--ghost-dark"
              onClick={() =>
                signOut().catch(() => toast('Signed out locally; the server could not be reached.', 'info'))
              }
            >
              Sign out
            </button>
          </div>
        </nav>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {user.role === 'viewer' && (
          <p className="viewer-banner">
            Read-only demo account: you can browse everything, but contact details are hidden and changes are
            disabled.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
