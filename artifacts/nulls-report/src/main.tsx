import { type ReactNode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { Toaster } from 'sonner';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthBridge } from '@/components/auth-bridge';
import { queryClient } from '@/lib/api';

import './index.css';

type PortalConfig = { publishableKey?: string | null };

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

function NotConfigured() {
  return (
    <Splash detail={
      <>
        This portal needs Clerk credentials on the <b>server</b>. Set{' '}
        <code className="rounded bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[10px] text-[#536174]">
          CLERK_SECRET_KEY
        </code>{' '}
        and{' '}
        <code className="rounded bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[10px] text-[#536174]">
          CLERK_PUBLISHABLE_KEY
        </code>{' '}
        (or{' '}
        <code className="rounded bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[10px] text-[#536174]">
          VITE_CLERK_PUBLISHABLE_KEY
        </code>
        ) in the server environment and restart.
      </>
    } />
  );
}

/**
 * Loads the Clerk publishable key from the server at runtime so it never has
 * to be baked into the static build. Shows a branded splash while the config
 * loads, and a retry screen if the API is unreachable.
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
        if (!cancelled) setConfig(data);
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
  if (!config.publishableKey) {
    return <NotConfigured />;
  }
  return (
    <ClerkProvider publishableKey={config.publishableKey}>
      <AuthBridge />
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
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
