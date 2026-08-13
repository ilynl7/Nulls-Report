import { useMemo, useState } from 'react';
import { Filter, Inbox, Search } from 'lucide-react';
import { AppShell, EmptyState, ErrorState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { ReportRow } from '@/components/report-row';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { apiErrorMessage } from '@/lib/api';
import { CATEGORIES, STATUSES } from '@/lib/catalog';
import type { ReportSummary } from '@workspace/api-client-react';

// Resolved and closed tickets are archived: they are hidden from the default
// inbox and only surface in the dedicated archived view.
const ARCHIVED = ['resolved', 'closed'];
const GROUPS = ['submitted', 'verifying', 'verified', 'forwarded', 'waiting_for_user', 'in_progress', 'rejected'] as const;

export function InboxPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { reports, isLoading, error, refetch } = useReports();
  const { unread } = useNotifications();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [group, setGroup] = useState<string>('all');

  const activeReports = useMemo(() => reports.filter((r) => !ARCHIVED.includes(r.status)), [reports]);
  const archivedReports = useMemo(() => reports.filter((r) => ARCHIVED.includes(r.status)), [reports]);

  const visiblePool = group === 'archived' ? archivedReports : activeReports;

  const filtered = useMemo(() => {
    return visiblePool.filter((report) => {
      if (category !== 'all' && report.category !== category) return false;
      if (group !== 'all' && group !== 'archived' && report.status !== group) return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        const haystack = `${report.ticketNumber} ${report.title} ${report.ownerName} ${report.subtype}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [visiblePool, query, category, group]);

  const needsReview = reports.filter((r) => r.status === 'submitted' || r.status === 'verifying').length;

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

  return (
    <AppShell user={user} unread={unread} inboxCount={needsReview}>
      <PageEnter>
        <PageHeading
          eyebrow="Staff workspace / Moderation"
          title="Moderation inbox"
          detail="Review new tickets, verify valid issues, reject the rest, and forward confirmed reports to administrators."
        />

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
          <button
            onClick={() => setGroup('all')}
            className={`rounded-2xl border p-3 text-left transition ${group === 'all' ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">Active</span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{activeReports.length}</strong>
          </button>
          {GROUPS.map((status) => {
            const count = activeReports.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setGroup(group === status ? 'all' : status)}
                className={`rounded-2xl border p-3 text-left transition ${group === status ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
              >
                <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">
                  {STATUSES[status]?.label ?? status}
                </span>
                <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{count}</strong>
              </button>
            );
          })}
          <button
            onClick={() => setGroup(group === 'archived' ? 'all' : 'archived')}
            className={`rounded-2xl border p-3 text-left transition ${group === 'archived' ? 'border-[#7468b6] bg-[#f2f0fb]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#89929f]">Archived</span>
            <strong className="mt-2 block font-display text-xl tracking-[-.05em] text-[#202f46]">{archivedReports.length}</strong>
          </button>
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
              {Object.values(CATEGORIES).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button
              onClick={() => { setQuery(''); setCategory('all'); setGroup('all'); }}
              className="flex h-10 items-center gap-2 rounded-xl border border-[#e6e2d9] px-3 text-xs font-bold text-[#697586]"
            >
              <Filter size={15} /> Clear
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
            <span className="text-xs font-bold text-[#455267]">{filtered.length} ticket{filtered.length === 1 ? '' : 's'} shown</span>
            <span className="font-mono text-[10px] text-[#a0a7af]">moderator & administrator view</span>
          </div>
          {error ? (
            <ErrorState title="Could not load the inbox" detail={apiErrorMessage(error)} onRetry={() => refetch()} />
          ) : isLoading ? (
            <Spinner label="Loading inbox…" />
          ) : filtered.length ? (
            <div className="divide-y divide-[#eeeae2]">
              {filtered.map((report: ReportSummary) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nothing in this view"
              detail="Change the status group or search for a different report."
              action={
                <button onClick={() => { setQuery(''); setCategory('all'); setGroup('all'); }} className="text-xs font-bold text-[#ef6358]">
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
