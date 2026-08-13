import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { FileText, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { AppShell, EmptyState, ErrorState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { ReportRow } from '@/components/report-row';
import { useCommunityReports, useNotifications, usePortalUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { apiErrorMessage } from '@/lib/api';
import { GAMES, ISSUE_TYPES, PRIORITIES, REPORT_FLOW, STATUSES } from '@/lib/catalog';

export function CommunityPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();
  const { t } = useI18n();

  const [game, setGame] = useState('');
  const [issueType, setIssueType] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (game) p.game = game;
    if (issueType) p.issueType = issueType;
    if (category) p.category = category;
    if (priority) p.priority = priority;
    if (status) p.status = status;
    if (query.trim()) p.search = query.trim();
    return p;
  }, [game, issueType, category, priority, status, query]);

  const { reports, isLoading, error, refetch } = useCommunityReports(params);

  // Category options depend on the selected issue type.
  const categoryOptions = useMemo(() => {
    if (issueType && REPORT_FLOW[issueType as 'community' | 'game']) {
      return REPORT_FLOW[issueType as 'community' | 'game'].options;
    }
    return [];
  }, [issueType]);

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  const hasFilters = Boolean(game || issueType || category || priority || status || query.trim());

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow="Community / Reports"
          title={t('reports.community')}
          detail={t('reports.communityDetail')}
          action={
            <Link
              href="/submit"
              className="flex items-center gap-2 rounded-xl bg-[#ef6358] px-4 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)]"
            >
              <Plus size={15} /> {t('nav.submit')}
            </Link>
          }
        />

        {/* Filters */}
        <div className="rounded-2xl border border-[#e6e2d9] bg-white p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a1ad]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQuery(search);
                }}
                placeholder="Search reports…"
                className="h-10 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] pl-9 pr-3 text-xs outline-none focus:border-[#ef6358]"
              />
            </div>
            <select value={game} onChange={(e) => setGame(e.target.value)} className="h-10 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold text-[#536174] outline-none focus:border-[#ef6358]">
              <option value="">All games</option>
              {GAMES.filter((g) => g.enabled).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={issueType} onChange={(e) => { setIssueType(e.target.value); setCategory(''); }} className="h-10 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold text-[#536174] outline-none focus:border-[#ef6358]">
              <option value="">All issue types</option>
              {Object.entries(ISSUE_TYPES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={categoryOptions.length === 0} className="h-10 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold text-[#536174] outline-none focus:border-[#ef6358] disabled:opacity-40">
              <option value="">All categories</option>
              {categoryOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold text-[#536174] outline-none focus:border-[#ef6358]">
              <option value="">All priorities</option>
              {Object.entries(PRIORITIES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold text-[#536174] outline-none focus:border-[#ef6358]">
              <option value="">All statuses</option>
              {Object.values(STATUSES).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setGame(''); setIssueType(''); setCategory(''); setPriority(''); setStatus(''); setSearch(''); setQuery(''); }}
                className="flex items-center gap-1.5 rounded-xl border border-[#e4e0d7] px-3 py-2.5 text-[10px] font-bold text-[#6a7584] hover:border-[#ef6358] hover:text-[#ef6358]"
              >
                <SlidersHorizontal size={12} /> Clear
              </button>
            )}
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#a0a7af]">
            <SlidersHorizontal size={11} />
            Visibility is enforced by the server: public only, never hidden or risk-critical.
          </p>
        </div>

        {/* Feed */}
        <div className="mt-5">
          {error ? (
            <div className="rounded-2xl border border-[#e6e2d9] bg-white">
              <ErrorState title="Could not load reports" detail={apiErrorMessage(error)} onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="rounded-2xl border border-[#e6e2d9] bg-white">
              <Spinner label="Loading community reports…" />
            </div>
          ) : reports.length ? (
            <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
              <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
                <span className="text-xs font-bold text-[#455267]">
                  {reports.length} public report{reports.length === 1 ? '' : 's'}
                </span>
                <span className="font-mono text-[10px] text-[#a0a7af]">community-visible</span>
              </div>
              <div className="divide-y divide-[#eeeae2]">
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#e6e2d9] bg-white">
              <EmptyState
                icon={FileText}
                title={hasFilters ? 'No public reports match' : t('reports.noReports')}
                detail={
                  hasFilters
                    ? 'Try widening your filters — or submit a report and make it the first one.'
                    : t('reports.noReportsDetail')
                }
                action={
                  <Link href="/submit" className="text-xs font-bold text-[#ef6358]">{t('reports.submitFirst')}</Link>
                }
              />
            </div>
          )}
        </div>
      </PageEnter>
    </AppShell>
  );
}
