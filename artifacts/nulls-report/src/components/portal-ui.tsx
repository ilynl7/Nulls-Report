import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertCircle,
  Bell,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  Plus,
  Settings2,
  Shield,
  Users,
  X,
} from 'lucide-react';
import type { User } from '@workspace/api-client-react';
import { gameById, statusInfo, CATEGORIES } from '@/lib/catalog';
import { initialsOf } from '@/lib/format';
import { avatarUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

export function Avatar({ name, size = 'sm', avatarPath }: { name: string; size?: 'sm' | 'md'; avatarPath?: string | null }) {
  const cls = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2c3b53] font-bold text-white ${size === 'md' ? 'h-9 w-9 text-[11px]' : 'h-7 w-7 text-[9px]'}`;
  if (avatarPath) {
    return <img src={avatarPath} alt={name} className={cls} />;
  }
  return (
    <span className={cls}>
      {initialsOf(name)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${info.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.dot }} />
      {info.label}
    </span>
  );
}

export function CategoryMark({ category, size = 'sm' }: { category: string; size?: 'sm' | 'md' }) {
  const info = CATEGORIES[category];
  const color = info?.color ?? '#667085';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] font-bold ${size === 'md' ? 'h-10 w-10 text-[11px]' : 'h-7 w-7 text-[9px]'}`}
      style={{ background: `${color}18`, color }}
    >
      {info?.label.slice(0, 1) ?? '?'}
    </span>
  );
}

export function GameBadge({ game, small }: { game: string; small?: boolean }) {
  const info = gameById(game);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold ${small ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
      style={{ background: `${info.color}14`, color: info.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {info.short}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#87909c]">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#e2ded5] border-t-[#ef6358]" />
      {label && <span className="text-xs font-semibold">{label}</span>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="noise flex min-h-[100dvh] items-center justify-center bg-[#f7f5f0]">
      <Spinner label="Loading portal…" />
    </div>
  );
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  detail,
  action,
}: {
  icon?: typeof FileText;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1eee7] text-[#8a94a1]">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 font-display text-[17px] font-bold tracking-[-.02em] text-[#253044]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[#87909c]">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fdecec] text-[#ca4e44]">
        <AlertCircle size={22} />
      </span>
      <h3 className="mt-4 font-display text-[17px] font-bold tracking-[-.02em] text-[#253044]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[#87909c]">{detail}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-xl bg-[#202f46] px-4 py-2.5 text-xs font-bold text-white"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives (kept from the original design language)
// ---------------------------------------------------------------------------

export function PageHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-enter mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[#ef6358]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ef6358]" />
          {eyebrow}
        </p>
        <h1 className="font-display text-[clamp(28px,4vw,42px)] font-bold leading-[1.05] tracking-[-.045em] text-[#202f46]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6e7887]">{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-[18px] font-bold tracking-[-.025em] text-[#253044]">{title}</h2>
        {detail && <p className="mt-1 text-xs text-[#87909c]">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-2xl border border-[#e6e2d9] bg-white p-5 shadow-[0_3px_10px_rgba(35,53,68,.025)]">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#89929f]">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ color: tone, background: `${tone}14` }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <strong className="font-display text-3xl font-bold tracking-[-.06em] text-[#202f46]">{value}</strong>
        <span className="mb-1 text-[10px] font-medium text-[#39824b]">{note}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell (sidebar + header)
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

export function AppShell({
  user,
  children,
  unread,
  inboxCount,
}: {
  user: User | null;
  children: ReactNode;
  unread: number;
  inboxCount: number;
}) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isStaff = user ? user.role !== 'user' : false;
  const isAdmin = user?.role === 'administrator';

  const nav: NavItem[] = isStaff
    ? [
        { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { href: '/inbox', label: 'Moderation inbox', icon: Inbox, badge: inboxCount },
        { href: '/my-reports', label: 'My reports', icon: FileText },
        { href: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
      ]
    : [
        { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
        { href: '/submit', label: 'Submit report', icon: Plus },
        { href: '/my-reports', label: 'My reports', icon: FileText },
        { href: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
      ];
  if (isAdmin) {
    nav.push({ href: '/admin', label: 'Administration', icon: Users }, { href: '/settings', label: 'Settings', icon: Settings2 });
  } else {
    nav.push({ href: '/settings', label: 'Settings', icon: Settings2 });
  }

  const active = (href: string) => (href === '/dashboard' ? location === href || location === '/' : location.startsWith(href));

  return (
    <div className="noise min-h-[100dvh] bg-[#f7f5f0]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col bg-[#202f46] px-4 py-5 text-[#f5f3eb] shadow-[8px_0_30px_rgba(25,40,57,.08)] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
            <img src="/assets/nulls-logo.png" alt="Nulls" className="h-10 w-10 rounded-[11px]" />
            <span>
              <strong className="block font-display text-[17px] tracking-[-.03em]">Nulls Report</strong>
              <span className="block text-[10px] uppercase tracking-[.19em] text-[#aab7c8]">Operations room</span>
            </span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[#aab7c8] lg:hidden" aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="mt-9 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#91a1b5]">
          {isStaff ? 'Staff workspace' : 'Player workspace'}
        </div>
        <nav className="mt-2 space-y-1">
          {nav.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${
                active(href)
                  ? 'bg-[#ef6358] text-white shadow-[0_7px_20px_rgba(239,99,88,.2)]'
                  : 'text-[#c9d2dd] hover:bg-[#2c3b53] hover:text-white'
              }`}
            >
              <Icon size={17} strokeWidth={active(href) ? 2.4 : 1.8} />
              <span className="flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                    active(href) ? 'bg-white/20' : 'bg-[#314157] text-[#b7c4d1]'
                  }`}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-[#3b4a60] bg-[#263750] p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="live-dot h-2.5 w-2.5 rounded-full bg-[#6dd4ad]" />
            <span className="text-[11px] font-bold text-[#d9e1e9]">
              {isStaff ? 'Moderator tools ready' : 'Private reporter view'}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#94a5b9]">
            {isStaff
              ? 'Only staff can access the moderation inbox and controls.'
              : 'Only reports submitted from your account are shown here.'}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-[#3b4a60] px-2 pt-4">
          {user ? (
            <>
              <Avatar name={user.displayName} size="md" avatarPath={avatarUrl(user)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{user.displayName}</p>
                <p className="truncate text-[10px] capitalize text-[#aab7c8]">{user.role}</p>
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="text-[#aab7c8] hover:text-white"
                aria-label="Account settings"
              >
                <Settings2 size={16} />
              </button>
            </>
          ) : (
            <p className="px-2 text-[10px] uppercase tracking-[.16em] text-[#aab7c8]">Loading…</p>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-[#152238]/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="lg:pl-[256px]">
        <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-[#e6e2d9] bg-[#f7f5f0]/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-[#e2ded5] bg-white p-2.5 text-[#445268] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#858e9b] sm:flex">
              <span className="font-mono text-[11px]">NULLS /</span>
              <span className="font-bold capitalize text-[#2a374b]">
                {location === '/dashboard' ? 'Overview' : location.replace(/^\//, '').replaceAll('-', ' ')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/notifications"
              className="relative rounded-xl p-2.5 text-[#697586] transition hover:bg-white hover:text-[#202f46]"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef6358] px-1 font-mono text-[9px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            {!isStaff && (
              <Link
                href="/submit"
                className="flex items-center gap-2 rounded-xl bg-[#ef6358] px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)]"
              >
                <Plus size={15} /> New report
              </Link>
            )}
            {isStaff && (
              <span className="hidden items-center gap-2 rounded-xl border border-[#dedbd3] bg-white px-3 py-2.5 text-xs font-bold text-[#536174] sm:flex">
                <Shield size={14} className="text-[#2e9f91]" /> {user?.role === 'administrator' ? 'Administrator' : 'Moderator'}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

export function WorkflowStrip({ compact }: { compact?: boolean }) {
  const steps = [
    { n: '01', t: 'Submit report', d: 'A ticket is created with its own ID.' },
    { n: '02', t: 'Moderator verifies', d: 'The issue is checked for validity.' },
    { n: '03', t: 'Administrator handles', d: 'Verified tickets reach the admin team.' },
    { n: '04', t: 'Track the outcome', d: 'Status and history stay visible.' },
  ];
  return (
    <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      {steps.map((step) => (
        <div key={step.n} className="rounded-2xl border border-[#e6e2d9] bg-white p-4">
          <span className="font-mono text-[10px] text-[#ef6358]">{step.n}</span>
          <strong className="mt-2 block font-display text-[14px] tracking-[-.02em] text-[#253044]">{step.t}</strong>
          <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{step.d}</p>
        </div>
      ))}
    </div>
  );
}

export function PageEnter({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
