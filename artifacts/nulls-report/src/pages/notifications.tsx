import { Link } from 'wouter';
import { useMarkNotificationRead } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Bell, Check, FileText } from 'lucide-react';
import { AppShell, EmptyState, ErrorState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { useNotifications, usePortalUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { apiErrorMessage, API_KEYS, queryClient } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export function NotificationsPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { notifications, unread, isLoading, refetch } = useNotifications();
  const { t } = useI18n();
  const markRead = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: API_KEYS.notifications });
      },
    },
  });

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  const markAsRead = async (id: number) => {
    try {
      await markRead.mutateAsync({ id });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow="Account / Notifications"
          title={t('notif.title')}
          detail="Status changes, replies, verifications and forwarding events tied to your account."
        />

        <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
            <span className="text-xs font-bold text-[#455267]">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </span>
            <span className="font-mono text-[10px] text-[#a0a7af]">persisted per account</span>
          </div>

          {isLoading ? (
            <Spinner label="Loading notifications…" />
          ) : notifications.length ? (
            <ul className="divide-y divide-[#eeeae2]">
              {notifications.map((n) => (
                <li key={n.id} className={`flex items-start gap-4 px-4 py-4 sm:px-5 ${n.readAt ? '' : 'bg-[#fffcf5]'}`}>
                  <span
                    className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      n.readAt ? 'bg-[#f1eee7] text-[#98a1ad]' : 'bg-[#fff0ed] text-[#ef6358]'
                    }`}
                  >
                    <Bell size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[13px] ${n.readAt ? 'font-semibold text-[#6e7887]' : 'font-bold text-[#2d394b]'}`}>{n.title}</p>
                      {!n.readAt && <span className="h-2 w-2 rounded-full bg-[#ef6358]" />}
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-[#87909c]">{n.body}</p>
                    <p className="mt-1 font-mono text-[10px] text-[#a7afb8]">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.reportId ? (
                      <Link href={`/reports/${n.reportId}`} className="rounded-lg border border-[#e4e0d7] px-3 py-2 text-[10px] font-bold text-[#536174] hover:border-[#ef6358]">
                        View ticket
                      </Link>
                    ) : null}
                    {!n.readAt && (
                      <button
                        onClick={() => void markAsRead(n.id)}
                        className="rounded-lg p-2 text-[#98a1ad] hover:bg-[#f1eee7] hover:text-[#2e9f91]"
                        aria-label="Mark as read"
                      >
                        <Check size={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              title={t('notif.empty')}
              detail={t('notif.emptyDetail')}
            />
          )}
        </div>
      </PageEnter>
    </AppShell>
  );
}
