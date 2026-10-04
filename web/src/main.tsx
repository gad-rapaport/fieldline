import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider, useLocation } from 'react-router';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/app.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Loading } from './components/States';
import { ToastProvider } from './components/Toast';
import {
  CustomerDetailPage,
  CustomersPage,
  DashboardPage,
  LoginPage,
  NewCustomerPage,
  NewRequestPage,
  RequestDetailPage,
  RequestsPage,
  ActivityPage,
  TeamPage,
} from './pages';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/requests\/new$/, 'New request'],
  [/^\/requests\/.+/, 'Request'],
  [/^\/requests/, 'Requests'],
  [/^\/customers\/new$/, 'New customer'],
  [/^\/customers\/.+/, 'Customer'],
  [/^\/customers/, 'Customers'],
  [/^\/team/, 'Team'],
  [/^\/activity/, 'Activity log'],
];

/** Keeps the document title in sync and moves focus to <main> on navigation for screen reader users. */
function RouteEffects() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Not found';
    document.title = `${title} · Fieldline`;
    // Not on the first render: the skip link should stay the first Tab stop after a page load.
    if (first.current) first.current = false;
    else document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function Shell() {
  return (
    <>
      <RouteEffects />
      <Layout />
    </>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>
        That address does not exist. Go to the <Link to="/">dashboard</Link>.
      </p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'requests', element: <RequestsPage /> },
      { path: 'requests/new', element: <NewRequestPage /> },
      { path: 'requests/:id', element: <RequestDetailPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/new', element: <NewCustomerPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'team', element: <TeamPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function AuthGate() {
  const { status, retry } = useAuth();
  if (status === 'checking') return <Loading label="Starting Fieldline" />;
  if (status === 'unreachable') {
    return (
      <div className="state state--error page--narrow" role="alert">
        <p className="state__title">Fieldline is not reachable</p>
        <p className="state__body">
          The server did not respond. Check that the service is running, then try again.
        </p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (status === 'signed-out') {
    document.title = 'Sign in · Fieldline';
    return <LoginPage />;
  }
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
