import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
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
import { BUG_SUBCATEGORIES, GAMES, REPORT_FLOW } from '@/lib/catalog';
import { usePortalUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

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

export function LandingPage() {
  const { user, isLoading } = usePortalUser();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, user, navigate]);

  const FAQ = [
    { q: t('landing.faq1q'), a: t('landing.faq1a') },
    { q: t('landing.faq2q'), a: t('landing.faq2a') },
    { q: t('landing.faq3q'), a: t('landing.faq3a') },
    { q: t('landing.faq4q'), a: t('landing.faq4a') },
  ];

  return (
    <div className="noise min-h-[100dvh] bg-[#f7f5f0] text-[#202f46]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[#e6e2d9] bg-[#f7f5f0]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/assets/nulls-logo.png" alt="Nulls" className="h-10 w-10 rounded-[11px]" />
            <span>
              <strong className="block font-display text-[17px] tracking-[-.03em]">{t('nav.brand')}</strong>
              <span className="block text-[10px] uppercase tracking-[.19em] text-[#8a94a1]">{t('nav.operations')}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/auth"
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#536174] transition hover:bg-white"
            >
              {t('common.signIn')}
            </Link>
            <Link
              href="/auth"
              className="rounded-xl bg-[#ef6358] px-4 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)]"
            >
              {t('common.getStarted')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Hero */}
        <section className="page-enter grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#dceae6] bg-[#f1faf7] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#2e7d70]">
              <Globe size={13} /> {t('landing.tagline')}
            </p>
            <h1 className="font-display text-[clamp(38px,6vw,64px)] font-bold leading-[1.02] tracking-[-.05em]">
              {t('landing.hero1')}{' '}
              <span className="relative whitespace-nowrap">
                {t('landing.hero2')}
                <span className="absolute -bottom-1 left-0 h-[5px] w-full rounded-full bg-[#ef6358]/25" />
              </span>
              .
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-[#6e7887]">{t('landing.heroDesc')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#ef6358] px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_25px_rgba(239,99,88,.25)] transition hover:brightness-105"
              >
                {t('landing.ctaReport')} <ArrowRight size={16} className="rtl:rotate-180" />
              </Link>
              <Link
                href="/auth"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#dedbd3] bg-white px-6 py-3.5 text-sm font-bold text-[#536174] transition hover:bg-[#fffcf5]"
              >
                {t('landing.ctaSignIn')}
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-semibold text-[#87909c]">
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> {t('landing.isolation')}</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> {t('landing.secureSignIn')}</span>
              <span className="flex items-center gap-1.5"><Check size={13} className="text-[#2e9f91]" /> {t('landing.moderatorVerification')}</span>
            </div>
          </div>

          {/* Community board */}
          <div className="page-enter stagger-2 relative">
            <div className="overflow-hidden rounded-3xl border border-[#e6e2d9] bg-white text-[#202f46] shadow-[0_24px_70px_rgba(35,53,68,.1)]">
              <div className="flex items-center justify-between border-b border-[#eeeae2] px-5 py-3.5">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#536174]">
                  <span className="live-dot h-2 w-2 rounded-full bg-[#2e9f91]" /> {t('landing.communityStatus')}
                </span>
                <span className="font-mono text-[10px] text-[#98a1ad]">nulls.gg / private servers</span>
              </div>
              <div className="divide-y divide-[#eeeae2]">
                {GAMES.map((game) => {
                  const Icon = game.icon;
                  return (
                    <div key={game.id} className="flex items-center gap-3.5 px-5 py-4">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `${game.color}18`, color: game.color }}
                      >
                        <Icon size={17} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-[#253044]">{game.name}</p>
                        <p className="truncate font-mono text-[10px] text-[#98a1ad]">
                          {t(`games.${game.id === 'nulls-brawl' ? 'brawl' : game.id === 'nulls-clash-of-clans' ? 'clash' : game.id === 'nulls-royale' ? 'royale' : 'infinity'}Tagline`)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                          game.enabled ? 'bg-[#e8f6f3] text-[#247c70]' : 'bg-[#f1eee7] text-[#8a94a1]'
                        }`}
                      >
                        {game.enabled ? t('common.live') : t('common.comingSoon')}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-[#eeeae2] px-5 py-4">
                <div className="flex items-center gap-2">
                  {[
                    { dot: '#ef6358', label: t('landing.submitted') },
                    { dot: '#ce9d40', label: t('landing.verified') },
                    { dot: '#2e9f91', label: t('landing.handled') },
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
                <Activity size={13} /> {t('misc.ticketIds')}
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
            { n: '4', label: t('landing.statServers') },
            { n: '2', label: t('landing.statStages') },
            { n: '50 MB', label: t('landing.statEvidence') },
            { n: '1', label: t('landing.statAccount') },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#fbfaf7] px-6 py-7">
              <strong className="font-display text-3xl font-bold tracking-[-.05em] text-[#202f46]">{stat.n}</strong>
              <p className="mt-2 max-w-[180px] text-[11px] leading-5 text-[#87909c]">{stat.label}</p>
            </div>
          ))}
        </section>

        {/* Games */}
        <section className="py-14">
          <SectionKicker>{t('landing.community')}</SectionKicker>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
              {t('landing.communityTitle')}
            </h2>
            <p className="max-w-sm text-xs leading-5 text-[#87909c]">{t('landing.communityDesc')}</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {GAMES.map((game) => {
              const Icon = game.icon;
              return (
                <div
                  key={game.id}
                  className={`relative rounded-2xl border p-5 transition ${
                    game.enabled
                      ? 'border-[#e6e2d9] bg-white shadow-[0_6px_20px_rgba(35,53,68,.05)]'
                      : 'border-[#eeeae2] bg-[#faf8f3]'
                  }`}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                    style={{ background: game.enabled ? game.color : '#b7bcc4' }}
                  >
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{game.name}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#87909c]">
                    {t(`games.${game.id === 'nulls-brawl' ? 'brawl' : game.id === 'nulls-clash-of-clans' ? 'clash' : game.id === 'nulls-royale' ? 'royale' : 'infinity'}Tagline`)}
                  </p>
                  <span
                    className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${
                      game.enabled ? 'bg-[#e8f6f3] text-[#247c70]' : 'bg-[#eef0f4] text-[#8a94a1]'
                    }`}
                  >
                    {game.enabled ? <Check size={11} /> : <Lock size={11} />}
                    {game.enabled ? t('common.openForReports') : t('common.comingSoon')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>{t('landing.howItWorks')}</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            {t('landing.howTitle')}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { n: '01', tk: 'landing.how1t', dk: 'landing.how1d' },
              { n: '02', tk: 'landing.how2t', dk: 'landing.how2d' },
              { n: '03', tk: 'landing.how3t', dk: 'landing.how3d' },
              { n: '04', tk: 'landing.how4t', dk: 'landing.how4d' },
            ].map((step) => (
              <div key={step.n} className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <span className="font-mono text-[10px] font-medium text-[#ef6358]">{step.n}</span>
                <h3 className="mt-3 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{t(step.tk)}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#87909c]">{t(step.dk)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What you can report */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>{t('landing.what')}</SectionKicker>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
              {t('landing.whatTitle')}
            </h2>
            <p className="max-w-sm text-xs leading-5 text-[#87909c]">{t('landing.whatDesc')}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f6f3] text-[#247c70]">
                <UserRound size={17} />
              </span>
              <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{t('landing.whatCommunity')}</h3>
              <p className="mt-1.5 text-[11px] leading-5 text-[#87909c]">{t('landing.whatCommunityD')}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {REPORT_FLOW.community.options.map((o) => (
                  <span key={o.id} className="rounded-md bg-[#f7f5f0] px-2 py-1 text-[9px] font-bold text-[#687385]">{o.label}</span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f0fb] text-[#5b50a8]">
                <ShieldCheck size={17} />
              </span>
              <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{t('landing.whatGame')}</h3>
              <p className="mt-1.5 text-[11px] leading-5 text-[#87909c]">{t('landing.whatGameD')}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {REPORT_FLOW.game.options.map((o) => (
                  <span key={o.id} className="rounded-md bg-[#f7f5f0] px-2 py-1 text-[9px] font-bold text-[#687385]">{o.label}</span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff6df] text-[#936b16]">
                <BugIcon />
              </span>
              <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{t('landing.whatBug')}</h3>
              <p className="mt-1.5 text-[11px] leading-5 text-[#87909c]">{t('landing.whatBugD')}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {BUG_SUBCATEGORIES.map((s) => (
                  <span key={s.id} className="rounded-md bg-[#f7f5f0] px-2 py-1 text-[9px] font-bold text-[#687385]">{s.label}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>{t('landing.privacy')}</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            {t('landing.privacyTitle')}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: UserRound, tk: 'landing.privacyAccount', dk: 'landing.privacyAccountD' },
              { icon: ShieldCheck, tk: 'landing.privacyRoles', dk: 'landing.privacyRolesD' },
              { icon: Eye, tk: 'landing.privacyFiles', dk: 'landing.privacyFilesD' },
              { icon: Bell, tk: 'landing.privacyNulls', dk: 'landing.privacyNullsD' },
            ].map(({ icon: Icon, tk, dk }) => (
              <div key={tk} className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#e8f6f3', color: '#247c70' }}>
                  <Icon size={18} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{t(tk)}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#87909c]">{t(dk)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-[#e6e2d9] py-14">
          <SectionKicker>{t('landing.faq')}</SectionKicker>
          <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-bold leading-tight tracking-[-.04em]">
            {t('landing.faqTitle')}
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
              {t('landing.ctaEyebrow')}
            </p>
            <h2 className="relative mx-auto mt-4 max-w-xl font-display text-[clamp(26px,4vw,40px)] font-bold leading-[1.05] tracking-[-.04em] text-[#202f46]">
              {t('landing.ctaTitle')}
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-sm leading-6 text-[#6e7887]">{t('landing.ctaDesc')}</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/auth"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#ef6358] px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_25px_rgba(239,99,88,.3)] transition hover:brightness-105"
              >
                {t('common.getStarted')} <ArrowRight size={16} className="rtl:rotate-180" />
              </Link>
              <Link
                href="/auth"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#dedbd3] px-6 py-3.5 text-sm font-bold text-[#536174] transition hover:bg-[#fbfaf7]"
              >
                {t('landing.ctaHaveAccount')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e6e2d9] py-8">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-5 text-[11px] text-[#98a1ad] sm:flex-row sm:px-8">
          <span className="flex items-center gap-2">
            <img src="/assets/nulls-logo.png" alt="" className="h-6 w-6 rounded-[7px]" />
            {t('landing.footer')}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[.16em]">{t('landing.footerNote')}</span>
        </div>
      </footer>
    </div>
  );
}

/** Small inline bug icon (lucide has no native bug glyph in this version). */
function BugIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5M6.13 13H3M6.53 17L4 19M17.47 9c1.93-.2 3.53-1.9 3.53-4M17.87 13H21M17.47 17L20 19" />
    </svg>
  );
}
