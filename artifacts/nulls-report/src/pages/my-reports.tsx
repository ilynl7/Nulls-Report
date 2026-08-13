import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Archive, FileText, Plus } from 'lucide-react';
import { AppShell, EmptyState, ErrorState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { ReportRow } from '@/components/report-row';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { apiErrorMessage } from '@/lib/api';

const ARCHIVED = ['resolved', 'closed'];

export function MyReportsPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { reports, isLoading, error, refetch } = useReports();
  const { unread } = useNotifications();
  const [view, setView] = useState<'active' | 'archived'>('active');

  const visible = useMemo(
    () => reports.filter((r) => (view === 'archived' ? ARCHIVED.includes(r.status) : !ARCHIVED.includes(r.status))),
    [reports, view],
  );

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow="Private workspace / Your reports"
          title="My reports"
          detail="A private record of the reports submitted from your account. Only your tickets appear here."
          action={
            <Link
              href="/submit"
              className="flex items-center gap-2 rounded-xl bg-[#ef6358] px-4 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)]"
            >
              <Plus size={15} /> Submit report
            </Link>
          }
        />

        <div className="mb-5 flex items-center gap-2">
          <button
            onClick={() => setView('active')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${view === 'active' ? 'bg-[#202f46] text-white' : 'border border-[#e6e2d9] bg-white text-[#6a7584] hover:border-[#ef6358]'}`}
          >
            Active ({reports.filter((r) => !ARCHIVED.includes(r.status)).length})
          </button>
          <button
            onClick={() => setView('archived')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${view === 'archived' ? 'bg-[#7468b6] text-white' : 'border border-[#e6e2d9] bg-white text-[#6a7584] hover:border-[#7468b6]'}`}
          >
            <Archive size={13} /> Archived ({reports.filter((r) => ARCHIVED.includes(r.status)).length})
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[#e6e2d9] bg-white">
            <ErrorState title="Could not load reports" detail={apiErrorMessage(error)} onRetry={() => refetch()} />
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-[#e6e2d9] bg-white">
            <Spinner label="Loading reports…" />
          </div>
        ) : visible.length ? (
          <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
            <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
              <span className="text-xs font-bold text-[#455267]">{visible.length} report{visible.length === 1 ? '' : 's'}</span>
              <span className="font-mono text-[10px] text-[#a0a7af]">private to your account</span>
            </div>
            <div className="divide-y divide-[#eeeae2]">
              {visible.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#e6e2d9] bg-white">
            <EmptyState
              icon={view === 'archived' ? Archive : FileText}
              title={view === 'archived' ? 'No archived reports' : 'No reports yet'}
              detail={
                view === 'archived'
                  ? 'Resolved and closed tickets will be archived here.'
                  : 'Reports submitted from your account will appear here with their current status.'
              }
              action={<Link href="/submit" className="text-xs font-bold text-[#ef6358]">Submit your first report</Link>}
            />
          </div>
        )}
      </PageEnter>
    </AppShell>
  );
}
