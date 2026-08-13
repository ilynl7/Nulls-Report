import { createRoot } from 'react-dom/client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { Toaster } from 'sonner';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthBridge } from '@/components/auth-bridge';
import { queryClient } from '@/lib/api';

import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function NotConfigured() {
  return (
    <div className="noise flex min-h-[100dvh] items-center justify-center bg-[#f7f5f0] p-6">
      <div className="max-w-md rounded-3xl border border-[#e6e2d9] bg-white p-8 text-center shadow-[0_20px_60px_rgba(35,53,68,.1)]">
        <img src="/assets/nulls-logo.png" alt="Nulls" className="mx-auto h-12 w-12 rounded-[13px]" />
        <h1 className="mt-5 font-display text-xl font-bold tracking-[-.03em] text-[#202f46]">
          Authentication is not configured yet
        </h1>
        <p className="mt-3 text-xs leading-6 text-[#6e7887]">
          This portal needs Clerk credentials. Add{' '}
          <code className="rounded bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[10px] text-[#536174]">
            VITE_CLERK_PUBLISHABLE_KEY
          </code>{' '}
          and{' '}
          <code className="rounded bg-[#f1eee7] px-1.5 py-0.5 font-mono text-[10px] text-[#536174]">
            CLERK_SECRET_KEY
          </code>{' '}
          in the workspace API Keys, then reload the preview.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey}>
        <AuthBridge />
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    ) : (
      <NotConfigured />
    )}
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
