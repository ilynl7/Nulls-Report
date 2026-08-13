import { Link } from 'wouter';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Inbox,
  ListFilter,
  MessageSquare,
} from 'lucide-react';
import {
  AppShell,
  EmptyState,
  ErrorState,
  MetricCard,
  PageEnter,
  PageHeading,
  SectionTitle,
  Spinner,
  WorkflowStrip,
} from '@/components/portal-ui';
import { ReportRow } from '@/components/report-row';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { apiErrorMessage } from '@/lib/api';
import type { ReportSummary } from '@workspace/api-client-react';

function counts(reports: ReportSummary[]) {
  return {
    total: reports.length,
    needsReview: reports.filter((r) => r.status === 'submitted' || r.status === 'verifying').length,
    inProgress: reports.filter((r) => r.status === 'in_progress' || r.status === 'waiting_for_user' || r.status === 'verified' || r.status === 'forwarded').length,
    resolved: reports.filter((r) => r.status === 'resolved' || r.status === 'closed').length,
  };
}

export function DashboardPage() {
  const { user, isLoading: userLoading, error: userError } = usePortalUser();
  const { reports, isLoading: reportsLoading, error: reportsError } = useReports();
  const { unread } = useNotifications();

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading your workspace…" />
      </AppShell>
    );
  }

  const isStaff = user.role !== 'user';
  const error = userError ?? reportsError;
  if (error) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState title="Could not load your workspace" detail={apiErrorMessage(error)} onRetry={() => window.location.reload()} />
      </AppShell>
    );
  }

  const c = counts(reports);
  const viewReports = reports.slice(0, 5);
  const replyCount = reports.filter((r) => r.status === 'waiting_for_user' || (r.status === 'in_progress' && r.allowUserMessages)).length;

  const metrics = isStaff
    ? [
        { label: 'Open tickets', value: String(c.needsReview + c.inProgress), note: 'need attention', icon: Inbox, tone: '#ef6358' },
        { label: 'Awaiting review', value: String(c.needsReview), note: 'moderator queue', icon: ListFilter, tone: '#ce9d40' },
        { label: 'Being handled', value: String(c.inProgress), note: 'verified & forwarded', icon: MessageSquare, tone: '#2e9f91' },
        { label: 'Resolved', value: String(c.resolved), note: 'closed with care', icon: CheckCircle2, tone: '#7468b6' },
      ]
    : [
        { label: 'My reports', value: String(c.total), note: 'submitted by you', icon: FileText, tone: '#ef6358' },
        { label: 'Awaiting my reply', value: String(replyCount), note: 'your next response', icon: MessageSquare, tone: '#ce9d40' },
        { label: 'In review', value: String(c.needsReview + c.inProgress), note: 'being worked on', icon: ListFilter, tone: '#2e9f91' },
        { label: 'Resolved', value: String(c.resolved), note: 'closed with care', icon: CheckCircle2, tone: '#7468b6' },
      ];

  return (
    <AppShell user={user} unread={unread} inboxCount={c.needsReview}>
      <PageEnter>
        <PageHeading
          eyebrow={isStaff ? 'Staff workspace / Overview' : 'Private workspace / Home'}
          title={isStaff ? `Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${user.displayName}.` : `Welcome back, ${user.displayName}.`}
          detail={
            isStaff
              ? 'Keep reports moving: verify new tickets, forward confirmed issues to administrators, and close the loop.'
              : 'Your reports, their status, and the one next step that matters.'
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((m, i) => (
            <div key={m.label} className={`page-enter stagger-${i + 1}`}>
              <MetricCard label={m.label} value={m.value} note={m.note} tone={m.tone} icon={m.icon} />
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <section className="rounded-2xl border border-[#e6e2d9] bg-white p-5 shadow-[0_3px_10px_rgba(35,53,68,.025)]">
            <SectionTitle
              title="Recent reports"
              detail={isStaff ? 'Latest tickets across the queue' : 'Your most recent submissions'}
              action={
                <Link href={isStaff ? '/inbox' : '/my-reports'} className="flex items-center gap-1 text-xs font-bold text-[#ef6358]">
                  {isStaff ? 'Open inbox' : 'View my reports'} <ArrowRight size={13} />
                </Link>
              }
            />
            {reportsLoading ? (
              <Spinner label="Loading reports…" />
            ) : viewReports.length ? (
              <div className="divide-y divide-[#eeeae2]">
                {viewReports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="No reports yet"
                detail={isStaff ? 'New tickets will appear here as players submit them.' : 'Submit your first report to start tracking it here.'}
                action={
                  !isStaff ? (
                    <Link href="/submit" className="text-xs font-bold text-[#ef6358]">Submit your first report</Link>
                  ) : undefined
                }
              />
            )}
          </section>

          <section className="rounded-2xl border border-[#dceae6] bg-[#f1faf7] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#398277]">What happens next</p>
            <h2 className="mt-3 font-display text-[21px] font-bold tracking-[-.03em] text-[#275c56]">
              {isStaff ? 'Keep the pipeline moving.' : 'A simple path from report to resolution.'}
            </h2>
            <div className="mt-5 space-y-4">
              {(isStaff
                ? [
                    ['01', 'Review new tickets', 'Check the details and evidence, then verify or reject.'],
                    ['02', 'Forward verified issues', 'Confirmed reports reach the administrator team.'],
                    ['03', 'Resolve and close', 'Admins act on verified tickets and close the loop.'],
                  ]
                : [
                    ['01', 'We review your report', 'A moderator checks the details and evidence.'],
                    ['02', 'We may ask a question', 'Staff open replies on your ticket only when needed.'],
                    ['03', 'You see the outcome', 'Status and history stay visible through resolution.'],
                  ]
              ).map(([num, title, detail]) => (
                <div key={num} className="flex gap-3">
                  <span className="font-mono text-[10px] text-[#2e9f91]">{num}</span>
                  <div>
                    <strong className="block text-xs text-[#365f5a]">{title}</strong>
                    <p className="mt-1 text-[11px] leading-5 text-[#68958d]">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {!isStaff && (
              <Link
                href="/submit"
                className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#ef6358] py-3 text-xs font-bold text-white"
              >
                Submit another report <ArrowRight size={14} />
              </Link>
            )}
          </section>
        </div>

        <div className="mt-8">
          <SectionTitle title="How the ticket flow works" detail="User → moderator verification → administrator handling" />
          <WorkflowStrip compact />
        </div>
      </PageEnter>
    </AppShell>
  );
}
