import { type ReactNode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { queryClient } from '@/lib/api';
import { portalConfig, type PortalConfig } from '@/lib/config';
import { usePortalUser } from '@/lib/hooks';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';

import './index.css';

function Splash({ detail, onRetry }: { detail: ReactNode; onRetry?: () => void }) {
  return (
    <div className="noise flex min-h-[100dvh] items-center justify-center bg-[#f7f5f0] p-6">
      <div className="max-w-md rounded-3xl border border-[#e6e2d9] bg-white p-8 text-center shadow-[0_20px_60px_rgba(35,53,68,.1)]">
        <img src="/assets/nulls-logo.png" alt="Nulls" className="mx-auto h-12 w-12 rounded-[13px]" />
        <h1 className="mt-5 font-display text-xl font-bold tracking-[-.03em] text-[#202f46]">
          Nulls Report
        </h1>
        <p className="mt-3 text-xs leading-6 text-[#6e7887]">{detail}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-xl bg-[#202f46] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#31445f]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Provides the i18n + theme context around the app. Both read the signed-in
 * user's saved preferences (language / appearance) so the choice follows the
 * account across devices, while still respecting any explicit local choice.
 */
function AppProviders() {
  const { user } = usePortalUser();
  const prefs = (user?.preferences ?? {}) as { language?: string; theme?: string };
  return (
    <I18nProvider serverLang={prefs.language}>
      <ThemeProvider serverTheme={prefs.theme}>
        <App />
      </ThemeProvider>
    </I18nProvider>
  );
}

/**
 * Loads runtime config from the server so the app knows which sign-in
 * providers are wired up (Discord needs OAuth credentials; Nulls Connect is
 * always available). The portal itself needs nothing else to run.
 */
function ConfigGate() {
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch('/api/config', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`config request failed (${res.status})`);
        return res.json() as Promise<PortalConfig>;
      })
      .then((data) => {
        if (!cancelled) {
          // Mutate in place: portalConfig is an imported singleton.
          portalConfig.discordConfigured = data.discordConfigured;
          portalConfig.publicUrl = data.publicUrl;
          setConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (failed) {
    return (
      <Splash
        detail="Could not reach the API server. Make sure it is running, then try again."
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (!config) {
    return <Splash detail="Connecting to the portal…" />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AppProviders />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <ConfigGate />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          borderRadius: '0.9rem',
          border: '1px solid #e6e2d9',
          background: '#fffefa',
          color: '#253044',
          fontSize: '13px',
        },
      }}
    />
  </ErrorBoundary>,
);
