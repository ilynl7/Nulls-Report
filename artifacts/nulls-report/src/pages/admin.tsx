import { useMemo, useState } from 'react';
import {
  getListPortalUsersQueryKey,
  useClearPortalUsers,
  useDeletePortalUser,
  useListPortalUsers,
  useUpdatePortalUserBlock,
  useUpdatePortalUserRole,
} from '@workspace/api-client-react';
import type { RoleUpdateInput } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { Avatar, AppShell, ErrorState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { useNotifications, usePortalUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { apiErrorMessage, API_KEYS, avatarUrl, queryClient } from '@/lib/api';
import { timeAgo } from '@/lib/format';

const ROLES = [
  { value: 'user', label: 'User' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'administrator', label: 'Administrator' },
] as const;

type ConfirmAction =
  | { kind: 'remove'; memberId: number; name: string }
  | { kind: 'clear' }
  | null;

function authSummary(m: { authMethods?: Array<{ name: string }> }, noneLabel: string): string {
  const methods = m.authMethods ?? [];
  if (methods.length === 0) return noneLabel;
  return methods.map((a) => a.name).join(' + ');
}

export function AdminPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [clearTyped, setClearTyped] = useState('');

  const usersQuery = useListPortalUsers({
    query: { queryKey: getListPortalUsersQueryKey(), enabled: !userLoading && !!user },
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: API_KEYS.users });

  const updateRole = useUpdatePortalUserRole({ mutation: { onSuccess: invalidate } });
  const updateBlock = useUpdatePortalUserBlock({ mutation: { onSuccess: invalidate } });
  const deleteUser = useDeletePortalUser({ mutation: { onSuccess: invalidate } });
  const clearUsers = useClearPortalUsers({
    mutation: {
      onSuccess: () => {
        invalidate();
        void queryClient.invalidateQueries({ queryKey: API_KEYS.reports });
        void queryClient.invalidateQueries({ queryKey: API_KEYS.notifications });
      },
    },
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!needle) return list;
    return list.filter(
      (m) =>
        m.displayName.toLowerCase().includes(needle) ||
        (m.discordUsername ?? '').toLowerCase().includes(needle) ||
        (m.nullsConnectId ?? '').toLowerCase().includes(needle) ||
        (m.authMethods ?? []).some((a) => `${a.name} ${a.label ?? ''}`.toLowerCase().includes(needle)) ||
        m.role.includes(needle) ||
        String(m.id) === needle,
    );
  }, [usersQuery.data, query]);

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  if (user.role !== 'administrator') {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState title="Administrator access required" detail="Only administrators can manage users and permissions." />
      </AppShell>
    );
  }

  const changeRole = async (targetId: number, role: string) => {
    setBusyId(targetId);
    try {
      await updateRole.mutateAsync({ id: targetId, data: { role: role as RoleUpdateInput['role'] } });
      toast.success(t('admin.roleUpdated'));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleBlock = async (targetId: number, blocked: boolean) => {
    setBusyId(targetId);
    try {
      await updateBlock.mutateAsync({ id: targetId, data: { blocked } });
      toast.success(blocked ? t('admin.accountBlocked') : t('admin.accountUnblocked'));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async () => {
    if (!confirm || confirm.kind !== 'remove') return;
    setBusyId(confirm.memberId);
    try {
      await deleteUser.mutateAsync({ id: confirm.memberId });
      toast.success(t('admin.userRemoved', { name: confirm.name }));
      setConfirm(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const doClear = async () => {
    if (!confirm || confirm.kind !== 'clear') return;
    try {
      const res = await clearUsers.mutateAsync({ data: { confirm: true } });
      toast.success(
        t('admin.dbCleared', { users: Number(res.users ?? 0), reports: Number(res.reports ?? 0) }),
      );
      setConfirm(null);
      setClearTyped('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const closeConfirm = () => {
    setConfirm(null);
    setClearTyped('');
  };

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow={t('nav.admin') + ' / Users'}
          title={t('admin.users')}
          detail={t('admin.usersDetail')}
        />

        {/* Search + toolbar */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute left-3 top-3 text-[#9ba3ad]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.searchPlaceholder')}
              className="h-11 w-full rounded-xl border border-[#e6e2d9] bg-white pl-9 pr-9 text-xs outline-none focus:border-[#ef6358]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-2.5 rounded-lg p-1 text-[#9ba3ad] hover:text-[#202f46]"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <span className="font-mono text-[10px] text-[#a0a7af]">
            {filtered.length} of {usersQuery.data?.length ?? 0} accounts
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#e6e2d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eeeae2] px-4 py-3.5 sm:px-5">
            <span className="flex items-center gap-2 text-xs font-bold text-[#455267]">
              <Users size={14} className="text-[#2e9f91]" /> {t('admin.portalUsers')}
            </span>
            <span className="font-mono text-[10px] text-[#a0a7af]">enforced on the API</span>
          </div>

          {usersQuery.isLoading ? (
            <Spinner label="Loading users…" />
          ) : usersQuery.error ? (
            <ErrorState title="Could not load users" detail={apiErrorMessage(usersQuery.error)} onRetry={() => usersQuery.refetch()} />
          ) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-xs text-[#98a1ad]">
              {query ? `No accounts match "${query}".` : 'No users yet.'}
            </div>
          ) : (
            <div className="divide-y divide-[#eeeae2]">
              {filtered.map((member) => {
                const isSelf = member.id === user.id;
                return (
                  <div key={member.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={member.displayName} size="md" avatarPath={avatarUrl(member)} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 truncate text-[13px] font-bold text-[#2d394b]">
                          {member.displayName}
                          {isSelf && <span className="rounded bg-[#f1eee7] px-1.5 py-0.5 text-[9px] font-bold text-[#8a94a1]">{t('common.you')}</span>}
                          {member.blocked && (
                            <span className="flex items-center gap-1 rounded bg-[#fdecec] px-1.5 py-0.5 text-[9px] font-bold text-[#b03030]">
                              <Ban size={9} /> {t('admin.blocked')}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[#89929f]">
                          {authSummary(member, t('settings.noAuth'))} · {timeAgo(member.createdAt)}
                        </p>
                        {member.nullsConnectId && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#2e9f91]">
                            <ShieldCheck size={11} /> {t('admin.nullConnect', { id: member.nullsConnectId })}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={member.role}
                        disabled={isSelf || member.blocked || busyId === member.id}
                        onChange={(e) => void changeRole(member.id, e.target.value)}
                        className="h-9 w-full rounded-lg border border-[#e6e2d9] bg-white px-2.5 text-[11px] font-bold text-[#536174] outline-none focus:border-[#ef6358] disabled:opacity-50 sm:w-36"
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value}>{t(`roles.${role.value}`)}</option>
                        ))}
                      </select>
                      {!isSelf && (
                        <>
                          <button
                            onClick={() => void toggleBlock(member.id, !member.blocked)}
                            disabled={busyId === member.id}
                            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold transition disabled:opacity-50 ${
                              member.blocked
                                ? 'border-[#dceae6] bg-[#f1faf7] text-[#247c70] hover:bg-[#e2f3ee]'
                                : 'border-[#e4e0d7] text-[#6a7584] hover:border-[#ca4e44] hover:text-[#ca4e44]'
                            }`}
                          >
                            <Ban size={12} /> {member.blocked ? t('admin.unblock') : t('admin.block')}
                          </button>
                          <button
                            onClick={() => setConfirm({ kind: 'remove', memberId: member.id, name: member.displayName })}
                            disabled={busyId === member.id}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e4e0d7] px-3 text-[11px] font-bold text-[#6a7584] transition hover:border-[#ca4e44] hover:bg-[#fff5f3] hover:text-[#ca4e44] disabled:opacity-50"
                          >
                            <Trash2 size={12} /> {t('admin.remove')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <section className="mt-6 rounded-2xl border border-[#efc9c4] bg-[#fff5f3] p-5">
          <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#a53a32]">
            <AlertTriangle size={16} /> {t('admin.dangerZone')}
          </h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#b0605a]">
            {t('admin.clearDbDetail')}
          </p>
          <button
            onClick={() => setConfirm({ kind: 'clear' })}
            className="mt-4 flex items-center gap-2 rounded-xl bg-[#ca4e44] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#b83f37]"
          >
            <Trash2 size={14} /> {t('admin.clearDb')}
          </button>
        </section>

        <div className="mt-5 rounded-2xl border border-[#dceae6] bg-[#f1faf7] p-5 text-xs leading-6 text-[#518b83]">
          {t('admin.roleGuide')}
        </div>
      </PageEnter>

      {/* Confirmation modal */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#101a2b]/60 p-4 backdrop-blur-sm"
          onClick={closeConfirm}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fdecec] text-[#ca4e44]">
              <AlertTriangle size={20} />
            </span>
            <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-.03em] text-[#202f46]">
              {confirm.kind === 'remove' ? `Remove ${confirm.name}?` : 'Clear the user database?'}
            </h3>
            {confirm.kind === 'remove' ? (
              <p className="mt-2 text-xs leading-6 text-[#6e7887]">
                This permanently deletes the account, its reports, attachments, messages and
                notifications. They will not be able to sign back in with the same data.
              </p>
            ) : (
              <>
                <p className="mt-2 text-xs leading-6 text-[#6e7887]">
                  This wipes every account, report, message, attachment and notification. It cannot
                  be undone. Type <strong className="text-[#ca4e44]">DELETE</strong> to confirm.
                </p>
                <input
                  value={clearTyped}
                  onChange={(e) => setClearTyped(e.target.value)}
                  placeholder="Type DELETE"
                  className="mt-4 h-11 w-full rounded-xl border border-[#e6e2d9] bg-[#fbfaf7] px-4 text-sm font-bold outline-none focus:border-[#ca4e44]"
                />
              </>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                className="rounded-xl border border-[#e4e0d7] px-4 py-2.5 text-xs font-bold text-[#6a7584]"
              >
                Cancel
              </button>
              <button
                onClick={() => (confirm.kind === 'remove' ? void doRemove() : void doClear())}
                disabled={confirm.kind === 'clear' && clearTyped !== 'DELETE'}
                className="rounded-xl bg-[#ca4e44] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                {confirm.kind === 'remove' ? 'Remove account' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
