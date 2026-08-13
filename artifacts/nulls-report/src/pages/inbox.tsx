import { useMemo, useState } from 'react';
import { Filter, Inbox, Search, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AppShell, EmptyState, ErrorState, PageEnter, PageHeading, Spinner, VerificationBadge } from '@/components/portal-ui';
import { ReportRow } from '@/components/report-row';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { apiErrorMessage } from '@/lib/api';
import { ARCHIVED_STATUSES, categoryLabel } from '@/lib/catalog';
import type { ReportSummary } from '@workspace/api-client-react';

type View = 'queue' | 'archived' | 'all';

export function InboxPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { reports, isLoading, error, refetch } = useReports();
  const { unread } = useNotifications();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [view, setView] = useState<View>('queue');

  const isAdmin = user?.role === 'administrator';

  // Role-based queues:
  //  - Moderators: unverified tickets needing review/verification.
  //  - Administrators: verified tickets awaiting or in handling.
  const inQueue = useMemo(() => {
    if (!user) return [];
    return reports.filter((r) => {
      if (ARCHIVED_STATUSES.includes(r.status as never)) return false;
      if (isAdmin) return r.verification === 'verified' || r.status === 'waiting_for_user';
      return r.verification !== 'verified';
    });
  }, [reports, user, isAdmin]);

  const archivedReports = useMemo(
    () => reports.filter((r) => ARCHIVED_STATUSES.includes(r.status as never)),
    [reports],
  );

  const visiblePool = view === 'all' ? reports : view === 'archived' ? archivedReports : inQueue;

  const filtered = useMemo(() => {
    return visiblePool.filter((report) => {
      if (category !== 'all' && report.category !== category) return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        const haystack = `${report.ticketNumber} ${report.title} ${report.ownerName} ${report.subtype}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [visiblePool, query, category]);

  const queueStats = useMemo(() => {
    const active = reports.filter((r) => !ARCHIVED_STATUSES.includes(r.status as never));
    if (isAdmin) {
      return {
        primary: active.filter((r) => r.verification === 'verified' && r.status === 'awaiting_admin').length,
        handled: active.filter((r) => r.status === 'in_progress' || r.status === 'waiting_for_user').length,
        archived: archivedReports.length,
      };
    }
    return {
      primary: active.filter((r) => r.verification === 'unverified' && (r.status === 'open' || r.status === 'under_review')).length,
      handled: active.filter((r) => r.status === 'waiting_for_user').length,
      archived: archivedReports.length,
    };
  }, [reports, archivedReports, isAdmin]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of reports) seen.add(r.category);
    return [...seen].sort();
  }, [reports]);

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  if (user.role === 'user') {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState title="Staff access required" detail="The moderation inbox is only available to moderators and administrators." />
      </AppShell>
    );
  }

  const queueLabel = isAdmin ? t('staff.queueLabel') : t('staff.toReview');
  const primaryCount = isAdmin
    ? reports.filter((r) => r.verification === 'verified' && r.status === 'awaiting_admin').length
    : reports.filter((r) => r.verification === 'unverified' && (r.status === 'open' || r.status === 'under_review')).length;

  return (
    <AppShell user={user} unread={unread} inboxCount={primaryCount}>
      <PageEnter>
        <PageHeading
          eyebrow={isAdmin ? `${t('nav.staffWorkspace')} / ${t('staff.adminInbox')}` : `${t('nav.staffWorkspace')} / ${t('staff.moderatorQueue')}`}
          title={isAdmin ? t('staff.adminInbox') : t('staff.inbox')}
          detail={
            isAdmin
              ? 'Tickets verified by moderators land here. Handle them, respond, and resolve or close — unverified reports never reach this queue.'
              : 'Review new tickets, verify valid issues and reject the rest. Verified tickets move to the administrator queue automatically.'
          }
        />

        <div className="mb-5 grid grid-cols-3 gap-3 xl:grid-cols-5">
          <button
            onClick={() => setView('queue')}
            className={`rounded-2xl border p-3 text-left transition ${view === 'queue' ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">{queueLabel}</span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{queueStats.primary}</strong>
          </button>
          <button
            onClick={() => setView('queue')}
            className={`rounded-2xl border p-3 text-left transition ${view === 'queue' ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">
              {isAdmin ? t('staff.inProgress') : t('staff.waitingForUser')}
            </span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{queueStats.handled}</strong>
          </button>
          <button
            onClick={() => setView('archived')}
            className={`rounded-2xl border p-3 text-left transition ${view === 'archived' ? 'border-[#7468b6] bg-[#f2f0fb]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">{t('staff.archived')}</span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{queueStats.archived}</strong>
          </button>
          <button
            onClick={() => setView('all')}
            className={`rounded-2xl border p-3 text-left transition ${view === 'all' ? 'border-[#2e9f91] bg-[#e8f6f3]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">{t('staff.allTickets')}</span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{reports.length}</strong>
          </button>
          <div className="hidden items-center gap-2 rounded-2xl border border-[#e6e2d9] bg-white p-3 xl:flex">
            <ShieldCheck size={16} className="shrink-0 text-[#2e9f91]" />
            <p className="text-[10px] leading-4 text-[#87909c]">
              {isAdmin
                ? 'You only see verified tickets here — moderators gate the rest.'
                : 'Verify honestly: verified tickets go to administrators, rejected ones close.'}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#e6e2d9] bg-white p-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-3 text-[#9ba3ad]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket IDs, titles, or reporter names"
              className="h-10 w-full rounded-xl bg-[#f7f5f0] pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#ef6358]"
            />
          </label>
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-xl border border-[#e6e2d9] bg-white px-3 text-xs font-semibold text-[#596677] outline-none focus:border-[#ef6358]"
            >
              <option value="all">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
            <button
              onClick={() => { setQuery(''); setCategory('all'); setView('queue'); }}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#e6e2d9] px-3 text-xs font-bold text-[#697586]"
            >
              <Filter size={15} /> Clear
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
            <span className="text-xs font-bold text-[#455267]">{filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}</span>
            <span className="font-mono text-[10px] text-[#a0a7af]">
              {view === 'queue' ? (isAdmin ? t('staff.adminInbox') : t('staff.moderatorQueue')) : view === 'archived' ? t('staff.archived') : t('staff.allTickets')}
            </span>
          </div>
          {error ? (
            <ErrorState title="Could not load the inbox" detail={apiErrorMessage(error)} onRetry={() => refetch()} />
          ) : isLoading ? (
            <Spinner label="Loading inbox…" />
          ) : filtered.length ? (
            <div className="divide-y divide-[#eeeae2]">
              {filtered.map((report: ReportSummary) => (
                <InboxRow key={report.id} report={report} isAdmin={isAdmin} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Inbox}
              title={view === 'queue' ? t('staff.queueClear') : t('staff.nothing')}
              detail={
                view === 'queue'
                  ? isAdmin
                    ? 'No verified tickets are waiting. New tickets first get verified by moderators.'
                    : 'No reports need review right now. New reports will appear here.'
                  : 'Change the view or search for a different report.'
              }
              action={
                <button onClick={() => { setQuery(''); setCategory('all'); setView('queue'); }} className="text-xs font-bold text-[#ef6358]">
                  Reset inbox view
                </button>
              }
            />
          )}
        </div>
      </PageEnter>
    </AppShell>
  );
}

function InboxRow({ report, isAdmin }: { report: ReportSummary; isAdmin: boolean }) {
  const { t } = useI18n();
  return (
    <div>
      <ReportRow report={report} />
      {isAdmin && report.verification === 'verified' && report.verifiedByName && (
        <div className="flex items-center gap-2 px-5 pb-3 sm:pl-[64px]">                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#39824b]">
                    <CheckCircle2 size={11} /> {t('staff.verifiedBy', { name: report.verifiedByName ?? '' })}
                  </span>
          <VerificationBadge verification={report.verification} />
          {report.status === 'awaiting_admin' && (
            <span className="rounded bg-[#f2f0fb] px-1.5 py-0.5 text-[9px] font-bold text-[#5b50a8]">
              {t('staff.awaitingYou')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
