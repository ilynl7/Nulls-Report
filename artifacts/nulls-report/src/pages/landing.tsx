import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Eye,
  Globe,
  HelpCircle,
  Lock,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { CATEGORIES, GAMES } from '@/lib/catalog';

function SectionKicker({ children }: { children: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[#ef6358]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#ef6358]" />
      {children}
    </p>
  );
}

const REPORT_TYPES = [
  'Bug reports',
  'Exploit reports',
  'Account issues',
  'Server status',
  'Connection problems',
  'Matchmaking reports',
  'UI & UX issues',
  'Performance reports',
  'Cheat & abuse reports',
  'Recovery requests',
];

const FAQ = [
  {
    q: 'Which servers can I report for?',
    a: "Null's Brawl is open for reports today. Null's Clash of Clans, Null's Royale and Null's Royale Infinity are wired into the same portal — the same account, the same ticket system — and open as each server's review team goes live. No separate portals, no second sign-up.",
  },
  {
    q: 'Do I have to link my Nulls account?',
    a: 'No. Nulls Connect is optional and never required. Linking only adds in-game context for staff when you want it — every report feature works with just a sign-in.',
  },
  {
    q: 'Can I edit or delete my report after submitting?',
    a: 'Reports become tickets and lock on submission, which keeps the review trail trustworthy. If staff need more from you, they open the conversation on the ticket and you can reply there.',
  },
  {
    q: 'Who can see my reports and attachments?',
    a: 'Only you, the moderators and the administrators of that server. Everything is isolated per account and enforced on the server — not just hidden in the interface.',
  },
];

export function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="noise min-h-[100dvh] bg-[#f7f5f0] text-[#202f46]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[#e6e2d9] bg-[#f7f5f0]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/assets/nulls-logo.png" alt="Nulls" className="h-10 w-10 rounded-[11px]" />
            <span>
              <strong className="block font-display text-[17px] tracking-[-.03em]">Nulls Report</strong>
              <span className="block text-[10px] uppercase tracking-[.19em] text-[#8a94a1]">Operations room</span>
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/auth?mode=sign-in"
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#536174] transition hover:bg-white"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=sign-up"
              className="rounded-xl bg-[#ef6358] px-4 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)]"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Hero */}
        <section className="page-enter grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#dceae6] bg-[#f1faf7] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#2e7d70]">
              <Globe size={13} /> For every Nulls private server
            </p>
            <h1 className="font-display text-[clamp(38px,6vw,64px)] font-bold leading-[1.02] tracking-[-.05em]">
              One portal for{' '}
              <span className="relative whitespace-nowrap">
                every Nulls server
                <span className="absolute -bottom-1 left-0 h-[5px] w-full rounded-full bg-[#ef6358]/25" />
              </span>
              .
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-[#6e7887]">
              Nulls Report is the community's verified reporting channel for the whole Nulls network.
              Submit a report, attach evidence, and follow it through a real review pipeline —
              moderators verify first, administrators handle what's confirmed. Your account, your
              reports, nothing shared.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth?mode=sign-up"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#ef6358] px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_25px_rgba(239,99,88,.25)] transition hover:brightness-105"
              >
                Report an issue <ArrowRight size={16} />
              </Link>
              <Link
                href="/auth?mode=sign-in"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#dedbd3] bg-white px-6 py-3.5 text-sm font-bold text-[#536174] transition hover:bg-[#fffcf5]"
              >
                Sign in to your account
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-semibold text-[#87909c]">
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> Per-account isolation</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> Secure sign-in</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> Moderator verification</span>
            </div>
          </div>

          {/* Community board */}
          <div className="page-enter stagger-2 relative">
            <div className="overflow-hidden rounded-3xl border border-[#e6e2d9] bg-white text-[#202f46] shadow-[0_24px_70px_rgba(35,53,68,.1)]">
              <div className="flex items-center justify-between border-b border-[#eeeae2] px-5 py-3.5">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#536174]">
                  <span className="live-dot h-2 w-2 rounded-full bg-[#2e9f91]" /> Community status
                </span>
                <span className="font-mono text-[10px] text-[#98a1ad]">nulls.gg / private servers</span>
              </div>
              <div className="divide-y divide-[#eeeae2]">
                {GAMES.map((game) => (
                  <div key={game.id} className="flex items-center gap-3.5 px-5 py-4">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-[12px] font-bold"
                      style={{ background: `${game.color}18`, color: game.color }}
                    >
                      {game.prefix[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[#253044]">{game.name}</p>
                      <p className="truncate font-mono text-[10px] text-[#98a1ad]">{game.tagline}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                        game.enabled ? 'bg-[#e8f6f3] text-[#247c70]' : 'bg-[#f1eee7] text-[#8a94a1]'
                      }`}
                    >
                      {game.enabled ? 'Live' : 'Coming soon'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-[#eeeae2] px-5 py-4">
                <div className="flex items-center gap-2">
                  {[
                    { dot: '#ef6358', label: 'Submitted' },
                    { dot: '#ce9d40', label: 'Verified' },
                    { dot: '#2e9f91', label: 'Handled' },
                  ].map((step, i) => (
                    <span key={step.label} className="flex items-center gap-2">
                      {i > 0 && <span className="h-px w-3 bg-[#e6e2d9]" />}
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#6a7584]">
                        <span className="h-2 w-2 rounded-full" style={{ background: step.dot }} />
                        {step.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 hidden rotate-[-3deg] rounded-2xl border border-[#dceae6] bg-[#f1faf7] px-4 py-3 shadow-[0_10px_30px_rgba(35,53,68,.1)] sm:block">
              <p className="flex items-center gap-2 font-mono text-[11px] font-bold text-[#2e7d70]">
                <Activity size={13} /> Ticket IDs per game: NB · NC · NR · NI
              </p>
            </div>
          </div>
        </section>

        {/* Report type ticker */}
        <div className="overflow-hidden border-y border-[#e6e2d9] py-3.5" aria-hidden="true">
          <div className="ticker-track flex w-max items-center gap-8">
            {[...REPORT_TYPES, ...REPORT_TYPES].map((label, i) => (
              <span key={i} className="flex items-center gap-8 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#9aa3ae]">
                {label} <span className="h-1 w-1 rounded-full bg-[#ef6358]" />
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#e6e2d9] bg-[#e6e2d9] sm:grid-cols-4">
          {[
            { n: '4', label: 'Nulls servers in one portal' },
            { n: '2', label: 'Review stages — moderators, then admins' },
            { n: '50 MB', label: 'Evidence per attached file' },
            { n: '1', label: 'Account that owns every report you make' },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#fbfaf7] px-6 py-7">
              <strong className="font-display text-3xl font-bold tracking-[-.05em] text-[#202f46]">{stat.n}</strong>
              <p className="mt-2 max-w-[180px] text-[11px] leading-5 text-[#87909c]">{stat.label}</p>
            </div>
          ))}
        </section>

        {/* Community / games */}
        <section className="py-14">
          <SectionKicker>The community</SectionKicker>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
              One portal. The whole community.
            </h2>
            <p className="max-w-sm text-xs leading-5 text-[#87909c]">
              The same account, the same ticket system, every Nulls server. Games open up as their
              review teams go live.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {GAMES.map((game) => (
              <div
                key={game.id}
                className={`relative rounded-2xl border p-5 transition ${
                  game.enabled
                    ? 'border-[#e6e2d9] bg-white shadow-[0_6px_20px_rgba(35,53,68,.05)]'
                    : 'border-[#eeeae2] bg-[#faf8f3]'
                }`}
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-[15px] font-bold text-white"
                  style={{ background: game.enabled ? game.color : '#b7bcc4' }}
                >
                  {game.prefix[0]}
                </span>
                <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{game.name}</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{game.tagline}</p>
                <span
                  className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${
                    game.enabled ? 'bg-[#e8f6f3] text-[#247c70]' : 'bg-[#eef0f4] text-[#8a94a1]'
                  }`}
                >
                  {game.enabled ? <Check size={11} /> : <Lock size={11} />}
                  {game.enabled ? 'Open for reports' : 'Coming soon'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>How it works</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            From report to resolution, without the noise.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { n: '01', t: 'Submit a report', d: 'Pick a server, category and sub-type, describe the issue, attach files. It becomes a ticket with its own ID.' },
              { n: '02', t: 'Moderator verifies', d: 'A moderator reviews the ticket and verifies whether the issue is valid. Invalid reports stop here.' },
              { n: '03', t: 'Administrator handles', d: 'Verified tickets are forwarded to administrators, who act on the issue and update the ticket.' },
              { n: '04', t: 'Track the outcome', d: 'Follow status and full history. Staff only reply when they need more from you.' },
            ].map((step) => (
              <div key={step.n} className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <span className="font-mono text-[10px] font-medium text-[#ef6358]">{step.n}</span>
                <h3 className="mt-3 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{step.t}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#87909c]">{step.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What you can report */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>What you can report</SectionKicker>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
              The same categories, on every server.
            </h2>
            <p className="max-w-sm text-xs leading-5 text-[#87909c]">
              Report structures are shared across the network, so a report you write on one server
              looks familiar on the next.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {Object.values(CATEGORIES).map((cat) => (
              <div key={cat.id} className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold" style={{ background: `${cat.color}18`, color: cat.color }}>
                  {cat.label.slice(0, 1)}
                </span>
                <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{cat.label} reports</h3>
                <p className="mt-1.5 text-[11px] leading-5 text-[#87909c]">
                  {cat.id === 'bug'
                    ? 'Gameplay, visuals, exploits, performance — anything that behaves wrong.'
                    : cat.id === 'account'
                      ? 'Recovery, scams and suspicious activity on your player account.'
                      : 'Outages, latency, matchmaking and anything server-side.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cat.subtypes.map((s) => (
                    <span key={s} className="rounded-md bg-[#f7f5f0] px-2 py-1 text-[9px] font-bold text-[#687385]">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>Private by design</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            Your reports are yours alone.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: UserRound, t: 'Account isolation', d: 'Sign in with your own account. Reports, notifications and permissions never mix between users.' },
              { icon: ShieldCheck, t: 'Role-gated access', d: 'Users, moderators and administrators see exactly what their role allows — enforced server-side.' },
              { icon: Eye, t: 'Private attachments', d: 'Evidence is stored securely and downloads are permission-checked. No public links, no leaks.' },
              { icon: Bell, t: 'Optional Nulls Connect', d: 'Link your Nulls account only if you want to. It adds in-game context, never required.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#e8f6f3', color: '#247c70' }}>
                  <Icon size={18} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{t}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#87909c]">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>Questions</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            Good to know before you report.
          </h2>
          <div className="mt-8 max-w-3xl divide-y divide-[#e6e2d9] border-y border-[#e6e2d9]">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="flex items-center gap-3 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">
                      <HelpCircle size={16} className="shrink-0 text-[#ef6358]" />
                      {item.q}
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-[#98a1ad] transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <p className="pb-5 pl-7 text-[12px] leading-6 text-[#6e7887]">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[#e6e2d9] py-16">
          <div className="relative overflow-hidden rounded-3xl border border-[#e6e2d9] bg-white px-8 py-12 text-center shadow-[0_20px_60px_rgba(35,53,68,.08)] sm:px-16">
            <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#ef6358]/15 blur-3xl" />
            <span className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#2e9f91]/15 blur-3xl" />
            <p className="relative font-mono text-[10px] uppercase tracking-[.2em] text-[#ef6358]">
              Null's Brawl is live — the rest is joining
            </p>
            <h2 className="relative mx-auto mt-4 max-w-xl font-display text-[clamp(26px,4vw,40px)] font-bold leading-[1.05] tracking-[-.04em] text-[#202f46]">
              Have something to report? Start your ticket now.
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-sm leading-6 text-[#6e7887]">
              Create one account and report across the whole community — moderators review,
              administrators handle, and you stay informed at every step.
            </p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/auth?mode=sign-up"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#ef6358] px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_25px_rgba(239,99,88,.3)] transition hover:brightness-105"
              >
                Create your account <ArrowRight size={16} />
              </Link>
              <Link
                href="/auth?mode=sign-in"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#dedbd3] px-6 py-3.5 text-sm font-bold text-[#536174] transition hover:bg-[#fbfaf7]"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e6e2d9] py-8">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-5 text-[11px] text-[#98a1ad] sm:flex-row sm:px-8">
          <span className="flex items-center gap-2">
            <img src="/assets/nulls-logo.png" alt="" className="h-6 w-6 rounded-[7px]" />
            Nulls Report — a private reporting portal for the Null's game community.
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[.16em]">Reports are reviewed by moderators before reaching administrators.</span>
        </div>
      </footer>
    </div>
  );
}
