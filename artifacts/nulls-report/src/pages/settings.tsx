import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { customFetch, useUpdateCurrentUser } from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  Camera,
  Check,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Unlink,
  UserRound,
} from 'lucide-react';
import { AppShell, Avatar, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { useNotifications, usePortalUser } from '@/lib/hooks';
import { apiErrorMessage, API_KEYS, avatarUrl, queryClient } from '@/lib/api';

type LinkRow = {
  player_id: string | number;
  name: string;
  tag?: string;
  score?: number;
};

export function SettingsPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();
  const { signOut } = useAuth();
  const updateUser = useUpdateCurrentUser({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: API_KEYS.me });
      },
    },
  });

  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  // Avatar
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Nulls Connect wizard
  const [step, setStep] = useState<'idle' | 'email' | 'pin' | 'links' | 'link'>('idle');
  const [ncEmail, setNcEmail] = useState('');
  const [ncPin, setNcPin] = useState('');
  const [ncToken, setNcToken] = useState('');
  const [ncLinks, setNcLinks] = useState<LinkRow[]>([]);
  const [ncBusy, setNcBusy] = useState(false);
  const [ncError, setNcError] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
    }
  }, [user?.id, user?.displayName]);

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateUser.mutateAsync({ data: { displayName: displayName.trim() || undefined } });
      toast.success('Account updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      toast.error('Choose a JPEG, PNG, WebP or GIF image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setAvatarBusy(true);
    try {
      await customFetch('/api/me/avatar', {
        method: 'POST',
        body: file,
        headers: { 'content-type': file.type },
      });
      await queryClient.invalidateQueries({ queryKey: API_KEYS.me });
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Nulls Connect wizard
  // -------------------------------------------------------------------------

  const ncStart = async () => {
    setNcBusy(true);
    setNcError('');
    try {
      const res = await customFetch<{ pin_required?: boolean; token?: string; error_type?: string }>(
        '/api/nulls-connect/auth',
        { method: 'POST', body: JSON.stringify({ email: ncEmail.trim() }), responseType: 'json' },
      );
      if (res?.token) {
        setNcToken(res.token);
        await ncLoadLinks(res.token);
      } else if (res?.pin_required) {
        setStep('pin');
      } else {
        throw new Error('That email is not registered with Nulls Connect.');
      }
    } catch (err) {
      setNcError(apiErrorMessage(err));
    } finally {
      setNcBusy(false);
    }
  };

  const ncVerify = async () => {
    setNcBusy(true);
    setNcError('');
    try {
      const res = await customFetch<{ token?: string; error_type?: string }>('/api/nulls-connect/verify', {
        method: 'POST',
        body: JSON.stringify({ email: ncEmail.trim(), pin: ncPin.trim() }),
        responseType: 'json',
      });
      if (!res?.token) throw new Error('Invalid code. Check the email from Nulls Connect and try again.');
      setNcToken(res.token);
      await ncLoadLinks(res.token);
    } catch (err) {
      setNcError(apiErrorMessage(err));
    } finally {
      setNcBusy(false);
    }
  };

  const ncLoadLinks = async (token: string) => {
    const res = await customFetch<{ links?: unknown[] }>('/api/nulls-connect/links', {
      method: 'POST',
      body: JSON.stringify({ token }),
      responseType: 'json',
    });
    const links = (res?.links ?? []).map((raw) => {
      const item = raw as {
        player_id?: string | number;
        player_info?: { name?: string; tag?: string; score?: number };
      };
      return {
        player_id: item.player_id ?? '',
        name: item.player_info?.name ?? item.player_info?.tag ?? `Account ${item.player_id ?? ''}`,
        tag: item.player_info?.tag,
        score: item.player_info?.score,
      };
    });
    if (links.length === 0) throw new Error('No linked Nulls accounts were found for this token.');
    setNcLinks(links);
    setStep('links');
  };

  const ncLink = async (row: LinkRow) => {
    setNcBusy(true);
    setNcError('');
    try {
      await customFetch('/api/nulls-connect/link', {
        method: 'POST',
        body: JSON.stringify({ token: ncToken, playerId: String(row.player_id), playerName: row.name }),
        responseType: 'json',
      });
      await queryClient.invalidateQueries({ queryKey: API_KEYS.me });
      toast.success(`Linked ${row.name}`);
      ncReset();
    } catch (err) {
      setNcError(apiErrorMessage(err));
    } finally {
      setNcBusy(false);
    }
  };

  const ncUnlink = async () => {
    setNcBusy(true);
    try {
      await updateUser.mutateAsync({ data: { nullsConnectId: null } });
      toast.success('Nulls account unlinked');
      ncReset();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setNcBusy(false);
    }
  };

  const ncReset = () => {
    setStep('idle');
    setNcEmail('');
    setNcPin('');
    setNcToken('');
    setNcLinks([]);
    setNcError('');
  };

  const doSignOut = async () => {
    await signOut();
    window.location.assign('/');
  };

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow="Account / Settings"
          title="Account settings"
          detail="Manage your profile picture, display name, Nulls Connect link, and session."
        />

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            {/* Profile */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <UserRound size={16} className="text-[#ef6358]" /> Profile
              </h2>
              <div className="mt-5 flex items-center gap-4">
                <button
                  onClick={() => fileInput.current?.click()}
                  className="group relative shrink-0 overflow-hidden rounded-full"
                  title="Change profile picture"
                >
                  <Avatar name={user.displayName} size="md" avatarPath={avatarUrl(user)} />
                  <span className="absolute inset-0 flex items-center justify-center bg-[#152238]/50 text-white opacity-0 transition group-hover:opacity-100">
                    <Camera size={14} />
                  </span>
                </button>
                <div>
                  <p className="text-[13px] font-bold text-[#2d394b]">{user.displayName}</p>
                  <p className="mt-0.5 text-[11px] text-[#89929f]">{user.email ?? 'no email on file'}</p>
                  <p className="mt-0.5 text-[10px] font-semibold capitalize text-[#ef6358]">{user.role}</p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAvatar(file);
                    e.target.value = '';
                  }}
                />
              </div>
              {avatarBusy && (
                <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-[#87909c]">
                  <Loader2 size={13} className="animate-spin" /> Uploading picture…
                </p>
              )}

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">Display name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="h-12 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#ef6358]"
                  />
                </div>
                <button
                  onClick={() => void saveProfile()}
                  disabled={saving}
                  className="rounded-xl bg-[#202f46] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </section>

            {/* Session */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <LogOut size={16} className="text-[#ca4e44]" /> Session
              </h2>
              <p className="mt-2 text-xs leading-6 text-[#87909c]">
                Your session is stored securely by the authentication provider. Sign out ends the
                session on this device; your data stays safe on the server.
              </p>
              <button
                onClick={() => void doSignOut()}
                className="mt-4 flex items-center gap-2 rounded-xl border border-[#efc9c4] px-4 py-2.5 text-xs font-bold text-[#ca4e44] hover:bg-[#fff5f3]"
              >
                <LogOut size={14} /> Sign out
              </button>
            </section>
          </div>

          {/* Nulls Connect */}
          <section className="h-fit rounded-2xl border border-[#e6e2d9] bg-white p-6">
            <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
              <Link2 size={16} className="text-[#2e9f91]" /> Nulls Connect
            </h2>
            <p className="mt-2 text-xs leading-6 text-[#87909c]">
              Optional. Link your Nulls account so staff can correlate reports with in-game data.
              You can use the portal without linking — this is never required.
            </p>

            {user.nullsConnectId ? (
              <div className="mt-5 rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4">
                <p className="flex items-center gap-2 text-[13px] font-bold text-[#247c70]">
                  <Check size={14} /> Linked
                </p>
                <p className="mt-1.5 text-[11px] leading-5 text-[#518b83]">
                  {user.nullsConnectName ?? 'Nulls account'} · ID {user.nullsConnectId}
                </p>
                <button
                  onClick={() => void ncUnlink()}
                  disabled={ncBusy}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#c8e4dd] px-3 py-2 text-[10px] font-bold text-[#247c70] disabled:opacity-50"
                >
                  <Unlink size={12} /> Unlink account
                </button>
              </div>
            ) : step === 'idle' ? (
              <button
                onClick={() => setStep('email')}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e9f91] px-4 py-2.5 text-xs font-bold text-white"
              >
                <Link2 size={14} /> Connect a Nulls account
              </button>
            ) : (
              <div className="mt-5 space-y-4">
                {step === 'email' && (
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                      <Mail size={11} className="mr-1 inline" /> Email used for Nulls Connect
                    </label>
                    <input
                      type="email"
                      value={ncEmail}
                      onChange={(e) => setNcEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#2e9f91]"
                    />
                    <button
                      onClick={() => void ncStart()}
                      disabled={ncBusy || !ncEmail.trim()}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e9f91] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {ncBusy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                      Send login code
                    </button>
                  </div>
                )}

                {step === 'pin' && (
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                      Code from your email
                    </label>
                    <input
                      value={ncPin}
                      onChange={(e) => setNcPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      className="h-11 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 font-mono text-sm outline-none focus:border-[#2e9f91]"
                    />
                    <button
                      onClick={() => void ncVerify()}
                      disabled={ncBusy || ncPin.length < 4}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e9f91] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {ncBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Verify code
                    </button>
                  </div>
                )}

                {step === 'links' && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                      Choose the account to link
                    </p>
                    <ul className="space-y-2">
                      {ncLinks.map((row) => (
                        <li key={String(row.player_id)}>
                          <button
                            onClick={() => void ncLink(row)}
                            disabled={ncBusy}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 py-3 text-left transition hover:border-[#2e9f91] disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-bold text-[#455267]">{row.name}</span>
                              <span className="block font-mono text-[10px] text-[#98a1ad]">
                                {row.tag ?? `ID ${row.player_id}`}
                                {typeof row.score === 'number' ? ` · score ${row.score}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-lg bg-[#e8f6f3] px-2.5 py-1.5 text-[10px] font-bold text-[#247c70]">
                              Link
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ncError && (
                  <p className="rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#ca4e44]">
                    {ncError}
                  </p>
                )}

                <button
                  onClick={ncReset}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-[#8e98a5] hover:text-[#536174]"
                >
                  <RefreshCw size={11} /> Start over
                </button>
              </div>
            )}
          </section>
        </div>
      </PageEnter>
    </AppShell>
  );
}
