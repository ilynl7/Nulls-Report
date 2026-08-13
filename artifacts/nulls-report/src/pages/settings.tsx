import { useEffect, useRef, useState } from 'react';
import { customFetch, disconnectAuthMethod, logoutPortalSession } from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  Bell,
  Camera,
  Check,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  MessageCircle,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { AppShell, Avatar, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { NullsConnectWizard } from '@/components/nulls-connect-wizard';
import { portalConfig } from '@/lib/config';
import { LANGUAGES, useI18n, type LanguageCode } from '@/lib/i18n';
import { THEMES, useTheme, type ThemeMode } from '@/lib/theme';
import { refreshAuthQueries, useNotifications, usePortalUser } from '@/lib/hooks';
import { apiErrorMessage, authMethodOf, API_KEYS, avatarUrl, queryClient, startProviderAuth } from '@/lib/api';

export function SettingsPage() {
  const { user, isLoading: userLoading, refetch } = usePortalUser();
  const { unread } = useNotifications();
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useI18n();

  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
    }
  }, [user?.id, user?.displayName]);

  /** Persists appearance/language to the account so the choice follows the user. */
  const savePreferences = async (patch: { language?: LanguageCode; theme?: ThemeMode }) => {
    const prefs = { ...(user?.preferences ?? {}) };
    if (patch.language) prefs.language = patch.language;
    if (patch.theme) prefs.theme = patch.theme;
    try {
      await customFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ preferences: prefs }),
        responseType: 'json',
      });
      await queryClient.invalidateQueries({ queryKey: API_KEYS.me });
    } catch {
      // Non-critical: the local choice is already applied and persisted locally.
    }
  };

  const changeTheme = (next: ThemeMode) => {
    setTheme(next);
    void savePreferences({ theme: next });
  };

  const changeLang = (next: LanguageCode) => {
    setLang(next);
    void savePreferences({ language: next });
  };

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label={t('common.loading')} />
      </AppShell>
    );
  }

  const trustedCount = (user.authMethods ?? []).filter((m) =>
    ['discord', 'nulls_connect'].includes(m.provider),
  ).length;

  const saveProfile = async () => {
    setSaving(true);
    try {
      await customFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
        responseType: 'json',
      });
      await queryClient.invalidateQueries({ queryKey: API_KEYS.me });
      toast.success(t('settings.accountUpdated'));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      toast.error(t('settings.pictureType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.pictureSize'));
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
      toast.success(t('settings.pictureUpdated'));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  const doUnlink = async (provider: 'discord' | 'nulls_connect', label: string) => {
    const isLast = trustedCount <= 1;
    if (isLast) {
      const ok = window.confirm(t('settings.lastMethodConfirm', { name: label }));
      if (!ok) return;
    }
    setUnlinkBusy(provider);
    try {
      await disconnectAuthMethod(provider);
      await queryClient.invalidateQueries({ queryKey: API_KEYS.me });
      toast.success(t('settings.disconnected', { name: label }));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUnlinkBusy(null);
    }
  };

  const doSignOut = async () => {
    try {
      await logoutPortalSession();
    } catch {
      // Cookie may already be gone — either way, clear client state and go home.
    }
    refreshAuthQueries();
    window.location.assign('/');
  };

  const discord = authMethodOf(user, 'discord');
  const nulls = authMethodOf(user, 'nulls_connect');

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading eyebrow={t('settings.eyebrow')} title={t('settings.title')} detail={t('settings.detail')} />

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            {/* Account */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <UserRound size={16} className="text-[#ef6358]" /> {t('settings.profile')}
              </h2>
              <div className="mt-5 flex items-center gap-4">
                <button
                  onClick={() => fileInput.current?.click()}
                  className="group relative shrink-0 overflow-hidden rounded-full"
                  title={t('settings.changePicture')}
                >
                  <Avatar name={user.displayName} size="md" avatarPath={avatarUrl(user)} />
                  <span className="absolute inset-0 flex items-center justify-center bg-[#152238]/50 text-white opacity-0 transition group-hover:opacity-100">
                    <Camera size={14} />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#2d394b]">{user.displayName}</p>
                  <p className="font-mono text-[11px] font-semibold text-[#ef6358]">
                    #{user.tag ?? '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#89929f]">
                    {user.authMethods?.length ? user.authMethods.map((a) => a.name).join(' · ') : t('settings.noAuth')}
                  </p>
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
                  <Loader2 size={13} className="animate-spin" /> {t('settings.uploading')}
                </p>
              )}

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                    {t('settings.displayName')}
                  </label>
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
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>

            {/* Appearance */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <Palette size={16} className="text-[#7468b6]" /> {t('settings.appearance')}
              </h2>
              <p className="mt-2 text-xs leading-6 text-[#87909c]">{t('settings.appearanceDetail')}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {THEMES.map((mode) => {
                  const active = theme === mode.value;
                  const Icon = mode.value === 'light' ? Sun : mode.value === 'dark' ? Moon : Palette;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => changeTheme(mode.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3.5 text-[11px] font-bold transition ${
                        active
                          ? 'border-[#2e9f91] bg-[#f1faf7] text-[#247c70]'
                          : 'border-[#e6e2d9] bg-[#fbfaf7] text-[#6a7584] hover:border-[#d4cdc0]'
                      }`}
                    >
                      <Icon size={16} />
                      {t(
                        mode.value === 'light'
                          ? 'settings.themeLight'
                          : mode.value === 'dark'
                            ? 'settings.themeDark'
                            : 'settings.themeSystem',
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Language */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <Languages size={16} className="text-[#ce9d40]" /> {t('settings.languageSection')}
              </h2>
              <p className="mt-2 text-xs leading-6 text-[#87909c]">{t('settings.languageDetail')}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LANGUAGES.map((item) => {
                  const active = lang === item.code;
                  return (
                    <button
                      key={item.code}
                      onClick={() => changeLang(item.code)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-[12px] font-bold transition ${
                        active
                          ? 'border-[#2e9f91] bg-[#f1faf7] text-[#247c70]'
                          : 'border-[#e6e2d9] bg-[#fbfaf7] text-[#6a7584] hover:border-[#d4cdc0]'
                      }`}
                    >
                      <span>{item.native}</span>
                      {active && <Check size={13} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Notifications */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <Bell size={16} className="text-[#2e9f91]" /> {t('settings.notificationsSection')}
              </h2>
              <p className="mt-2 text-xs leading-6 text-[#87909c]">{t('settings.notificationsDetail')}</p>
              <div className="mt-4 space-y-2">
                {[t('settings.notifReplies'), t('settings.notifStatus')].map((label) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] px-4 py-3"
                  >
                    <span className="text-xs font-semibold text-[#536174]">{label}</span>
                    <span className="rounded-md bg-[#e8f6f3] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#247c70]">
                      {t('common.yes')}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[10px] leading-4 text-[#98a1ad]">{t('settings.notifAllInPortal')}</p>
              </div>
            </section>

            {/* Session */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                <LogOut size={16} className="text-[#ca4e44]" /> {t('settings.session')}
              </h2>
              <p className="mt-2 text-xs leading-6 text-[#87909c]">{t('settings.sessionDetail')}</p>
              <button
                onClick={() => void doSignOut()}
                className="mt-4 flex items-center gap-2 rounded-xl border border-[#efc9c4] px-4 py-2.5 text-xs font-bold text-[#ca4e44] hover:bg-[#fff5f3]"
              >
                <LogOut size={14} /> {t('common.signOut')}
              </button>
            </section>
          </div>

          {/* Authentication methods */}
          <section className="h-fit rounded-2xl border border-[#e6e2d9] bg-white p-6">
            <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
              <KeyRound size={16} className="text-[#2e9f91]" /> {t('settings.authSection')}
            </h2>
            <p className="mt-2 text-xs leading-6 text-[#87909c]">{t('settings.authDetail')}</p>

            {/* Discord */}
            <div className="mt-6 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5865F2] text-white">
                    <MessageCircle size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#455267]">{t('settings.discord')}</p>
                    {discord ? (
                      <p className="text-[11px] text-[#5865F2]">
                        {t('settings.connectedAs', { name: discord.label ?? 'Discord account' })}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#98a1ad]">{t('common.notConnected')}</p>
                    )}
                  </div>
                </div>
                {discord ? (
                  <button
                    onClick={() => void doUnlink('discord', 'Discord')}
                    disabled={unlinkBusy === 'discord'}
                    className="rounded-lg border border-[#e4e0d7] px-3 py-2 text-[10px] font-bold text-[#6a7584] hover:border-[#ca4e44] hover:text-[#ca4e44] disabled:opacity-50"
                  >
                    {t('common.disconnect')}
                  </button>
                ) : (
                  <button
                    onClick={() => startProviderAuth('discord', '/settings')}
                    className="rounded-lg bg-[#5865F2] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#4752c4]"
                  >
                    {t('common.connect')} {t('settings.discord')}
                  </button>
                )}
              </div>
              {!discord && !portalConfig.discordConfigured && (
                <p className="mt-2 text-[10px] leading-4 text-[#98a1ad]">{t('auth.discordNotConfigured')}</p>
              )}
            </div>

            {/* Nulls Connect */}
            <div className="mt-3 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2e9f91] text-white">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#455267]">{t('settings.nullsConnect')}</p>
                    {nulls ? (
                      <p className="text-[11px] text-[#247c70]">
                        {t('settings.connectedAs', { name: nulls.label ?? 'Nulls account' })}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#98a1ad]">{t('common.notConnected')}</p>
                    )}
                  </div>
                </div>
                {nulls && (
                  <button
                    onClick={() => void doUnlink('nulls_connect', 'Nulls Connect')}
                    disabled={unlinkBusy === 'nulls_connect'}
                    className="rounded-lg border border-[#c8e4dd] px-3 py-2 text-[10px] font-bold text-[#247c70] hover:border-[#ca4e44] hover:text-[#ca4e44] disabled:opacity-50"
                  >
                    {t('common.disconnect')}
                  </button>
                )}
              </div>
              {!nulls && (
                <NullsConnectWizard
                  linked={false}
                  onLinked={() => {
                    void refetch();
                  }}
                />
              )}
            </div>

            <p className="mt-4 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] px-3.5 py-3 text-[10px] leading-5 text-[#98a1ad]">
              {t('settings.disconnectedNote')}
            </p>

            {/* Report access */}
            <div
              className={`mt-4 rounded-xl border p-4 ${
                user.hasTrustedAuth ? 'border-[#dceae6] bg-[#f1faf7]' : 'border-[#efd9c4] bg-[#fff7ee]'
              }`}
            >
              <p className="flex items-center gap-2 text-xs font-bold text-[#455267]">
                <ShieldCheck size={14} className={user.hasTrustedAuth ? 'text-[#2e9f91]' : 'text-[#ce9d40]'} />
                {t('settings.reportAccess')}
              </p>
              <p className="mt-1.5 text-[11px] leading-5 text-[#87909c]">{t('settings.reportAccessDetail')}</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2.5">
                <Check size={14} className="shrink-0 text-[#39824b]" />
                <p className="text-xs font-bold text-[#39824b]">{t('settings.canSubmit')}</p>
              </div>
            </div>
          </section>
        </div>
      </PageEnter>
    </AppShell>
  );
}
