import { type ReactNode, useEffect } from 'react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { PageLoader, Spinner } from '@/components/portal-ui';
import { usePortalUser } from '@/lib/hooks';
import { LandingPage } from '@/pages/landing';
import { AuthPage } from '@/pages/auth';
import { DashboardPage } from '@/pages/dashboard';
import { SubmitPage } from '@/pages/submit';
import { MyReportsPage } from '@/pages/my-reports';
import { ReportDetailPage } from '@/pages/report-detail';
import { InboxPage } from '@/pages/inbox';
import { AdminPage } from '@/pages/admin';
import { SettingsPage } from '@/pages/settings';
import { NotificationsPage } from '@/pages/notifications';
import NotFound from '@/pages/not-found';

function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return <PageLoader />;
}

function AccessDenied({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="noise flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f7f5f0] px-6 text-center">
      <div className="max-w-md rounded-3xl border border-[#e6e2d9] bg-white p-8 shadow-[0_20px_60px_rgba(35,53,68,.1)]">
        <h1 className="font-display text-2xl font-bold tracking-[-.04em] text-[#202f46]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#6e7887]">{detail}</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-[#202f46] px-5 py-2.5 text-xs font-bold text-white">
          Back to overview
        </Link>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();

  if (!isLoaded) return <PageLoader />;
  if (!isSignedIn) {
    return <RedirectTo to={`/auth?returnTo=${encodeURIComponent(location)}`} />;
  }
  return <>{children}</>;
}

function RequireStaff({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  const { user, isLoading } = usePortalUser();

  if (!isLoaded) return <PageLoader />;
  if (!isSignedIn) {
    return <RedirectTo to={`/auth?returnTo=${encodeURIComponent(location)}`} />;
  }
  if (isLoading || !user) {
    return (
      <div className="noise flex min-h-[100dvh] items-center justify-center bg-[#f7f5f0]">
        <Spinner label="Checking access…" />
      </div>
    );
  }
  if (user.role === 'user') {
    return (
      <AccessDenied
        title="Staff access required"
        detail="The moderation inbox is available to moderators and administrators only. Your reports are still visible under My reports."
      />
    );
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  const { user, isLoading } = usePortalUser();

  if (!isLoaded) return <PageLoader />;
  if (!isSignedIn) {
    return <RedirectTo to={`/auth?returnTo=${encodeURIComponent(location)}`} />;
  }
  if (isLoading || !user) {
    return (
      <div className="noise flex min-h-[100dvh] items-center justify-center bg-[#f7f5f0]">
        <Spinner label="Checking access…" />
      </div>
    );
  }
  if (user.role !== 'administrator') {
    return (
      <AccessDenied
        title="Administrator access required"
        detail="Only administrators can manage users and portal permissions."
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/">
          <LandingPage />
        </Route>
        <Route path="/auth">
          <AuthPage />
        </Route>
        <Route path="/dashboard">
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        </Route>
        <Route path="/submit">
          <RequireAuth>
            <SubmitPage />
          </RequireAuth>
        </Route>
        <Route path="/my-reports">
          <RequireAuth>
            <MyReportsPage />
          </RequireAuth>
        </Route>
        <Route path="/reports/:id">
          <RequireAuth>
            <ReportDetailPage />
          </RequireAuth>
        </Route>
        <Route path="/inbox">
          <RequireStaff>
            <InboxPage />
          </RequireStaff>
        </Route>
        <Route path="/admin">
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        </Route>
        <Route path="/settings">
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        </Route>
        <Route path="/notifications">
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Router>
  );
}
