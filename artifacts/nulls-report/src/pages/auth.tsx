import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { SignIn, SignUp, useAuth } from '@clerk/react';
import { ArrowRight, Check, FileText, MessageSquare, ShieldCheck } from 'lucide-react';
import { GAMES } from '@/lib/catalog';

type Mode = 'sign-in' | 'sign-up';

const clerkAppearance = {
  variables: {
    colorPrimary: '#ef6358',
    colorBackground: '#ffffff',
    colorText: '#202f46',
    colorInputBackground: '#fbfaf7',
    colorInputText: '#202f46',
    colorNeutral: '#6e7887',
    fontFamily: "'Manrope', ui-sans-serif, sans-serif",
    fontSmoothing: 'auto',
    borderRadius: '0.85rem',
  },
  elements: {
    card: { boxShadow: 'none', border: 'none' },
    headerTitle: { fontFamily: "'Syne', ui-sans-serif, sans-serif", letterSpacing: '-.03em', color: '#202f46' },
    formButtonPrimary: { boxShadow: '0 5px 15px rgba(239,99,88,.2)' },
    footerAction: { color: '#2e9f91' },
    formFieldLabel: { color: '#455267' },
    dividerLine: { background: '#eeeae2' },
  },
};

export function AuthPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] ?? '');
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'sign-up' ? 'sign-up' : 'sign-in');
  const returnTo = params.get('returnTo') || '/dashboard';

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate(returnTo.startsWith('/') ? returnTo : '/dashboard', { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, returnTo]);

  return (
    <div className="noise relative min-h-[100dvh] overflow-hidden bg-[#f7f5f0]">
      {/* Soft background accents */}
      <span className="pointer-events-none absolute -left-32 top-[-10rem] h-96 w-96 rounded-full bg-[#ef6358]/10 blur-3xl" />
      <span className="pointer-events-none absolute -right-32 bottom-[-8rem] h-96 w-96 rounded-full bg-[#2e9f91]/10 blur-3xl" />

      <header className="relative border-b border-[#e6e2d9] bg-[#f7f5f0]/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/assets/nulls-logo.png" alt="Nulls" className="h-10 w-10 rounded-[11px]" />
            <span>
              <strong className="block font-display text-[17px] tracking-[-.03em] text-[#202f46]">Nulls Report</strong>
              <span className="block text-[10px] uppercase tracking-[.19em] text-[#8a94a1]">Operations room</span>
            </span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-[#536174] hover:text-[#ef6358]">
            Back to home <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1040px] gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-16">
        {/* Brand panel */}
        <div className="page-enter">
          <div className="flex items-center gap-2">
            {GAMES.map((game) => (
              <span
                key={game.id}
                title={game.name}
                className={`h-2.5 w-2.5 rounded-full ${game.enabled ? '' : 'opacity-40'}`}
                style={{ background: game.color }}
              />
            ))}
            <span className="ml-1 font-mono text-[9px] font-medium uppercase tracking-[.18em] text-[#98a1ad]">
              One portal · every Nulls server
            </span>
          </div>

          <h1 className="mt-6 font-display text-[clamp(32px,4.5vw,50px)] font-bold leading-[1.04] tracking-[-.045em] text-[#202f46]">
            {mode === 'sign-in' ? 'Good to see you again.' : 'Join the reporting desk.'}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#6e7887]">
            {mode === 'sign-in'
              ? 'Your reports, tickets and notifications follow you — every account has its own isolated workspace across the whole community.'
              : 'Create one account and report from any Nulls server. Your reports stay private to you, and staff only see what your role allows.'}
          </p>

          <div className="mt-8 space-y-4">
            {[
              { icon: FileText, t: 'Ticket-based reports', d: 'Every report gets a unique ID, status and full history.' },
              { icon: ShieldCheck, t: 'Verified review pipeline', d: 'Moderators verify first, administrators handle the confirmed issues.' },
              { icon: MessageSquare, t: 'Keep the conversation', d: 'Staff open the ticket chat only when they need more from you.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#2e9f91] shadow-[0_2px_8px_rgba(35,53,68,.06)]">
                  <Icon size={15} />
                </span>
                <div>
                  <strong className="block text-xs text-[#455267]">{t}</strong>
                  <p className="mt-0.5 text-[11px] leading-5 text-[#87909c]">{d}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 flex items-center gap-2 text-[11px] font-semibold text-[#87909c]">
            <Check size={13} className="text-[#2e9f91]" />
            Nulls Connect is optional — add it later from Settings, never required.
          </p>
        </div>

        {/* Form card */}
        <div className="page-enter stagger-2">
          <div className="rounded-3xl border border-[#e6e2d9] bg-white p-6 shadow-[0_24px_70px_rgba(35,53,68,.1)] sm:p-8">
            <div className="mb-6 flex rounded-xl border border-[#e6e2d9] bg-[#f7f5f0] p-1">
              {(['sign-in', 'sign-up'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    navigate(`/auth?mode=${m}${returnTo && returnTo !== '/dashboard' ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`, { replace: true });
                  }}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition ${
                    mode === m ? 'bg-[#202f46] text-white shadow-sm' : 'text-[#6e7887] hover:text-[#202f46]'
                  }`}
                >
                  {m === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {mode === 'sign-in' ? (
              <SignIn fallbackRedirectUrl={returnTo} appearance={clerkAppearance} />
            ) : (
              <SignUp fallbackRedirectUrl={returnTo} appearance={clerkAppearance} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
