import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Check, KeyRound, MessageCircle, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { portalConfig } from '@/lib/config';
import { startProviderAuth } from '@/lib/api';
import { usePortalUser } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { NullsConnectWizard } from '@/components/nulls-connect-wizard';
import { GAMES } from '@/lib/catalog';

export function AuthPage() {
  const { user, isLoading } = usePortalUser();
  const { t } = useI18n();
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] ?? '');
  const returnTo = params.get('returnTo') || '/dashboard';
  const oauthReason = params.get('auth') === 'error' ? (params.get('reason') || 'oauth') : null;

  const oauthErrorText =
    oauthReason === 'linked'
      ? t('auth.errorLinked')
      : oauthReason === 'blocked'
        ? t('auth.errorBlocked')
        : oauthReason
          ? t('auth.errorOauth')
          : null;

  useEffect(() => {
    if (!isLoading && user) {
      navigate(returnTo.startsWith('/') ? returnTo : '/dashboard', { replace: true });
    }
  }, [isLoading, user, navigate, returnTo]);

  return (
    <div className="noise relative min-h-[100dvh] overflow-hidden bg-[#f7f5f0]">
      <span className="pointer-events-none absolute -left-32 top-[-10rem] h-96 w-96 rounded-full bg-[#ef6358]/10 blur-3xl" />
      <span className="pointer-events-none absolute -right-32 bottom-[-8rem] h-96 w-96 rounded-full bg-[#2e9f91]/10 blur-3xl" />

      <header className="relative border-b border-[#e6e2d9] bg-[#f7f5f0]/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/assets/nulls-logo.png" alt="Nulls" className="h-10 w-10 rounded-[11px]" />
            <span>
              <strong className="block font-display text-[17px] tracking-[-.03em] text-[#202f46]">{t('nav.brand')}</strong>
              <span className="block text-[10px] uppercase tracking-[.19em] text-[#8a94a1]">{t('nav.operations')}</span>
            </span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-[#536174] hover:text-[#ef6358]">
            {t('common.backHome')} <ArrowRight size={14} className="rtl:rotate-180" />
          </Link>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1040px] gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-16">
        <div className="page-enter">
          <div className="flex items-center gap-2">
            {GAMES.map((game) => (
              <span
                key={game.id}
                title={game.name}
                className={`h-2.5 w-2.5 rounded-full ${game.enabled ? '' : 'opacity-40'}`}
                style={{ background: game.color }}
              />
            ))}
            <span className="ml-1 font-mono text-[9px] font-medium uppercase tracking-[.18em] text-[#98a1ad]">
              {t('games.onePortal')}
            </span>
          </div>

          <h1 className="mt-6 font-display text-[clamp(32px,4.5vw,50px)] font-bold leading-[1.04] tracking-[-.045em] text-[#202f46]">
            {t('auth.title')}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#6e7887]">{t('auth.subtitle')}</p>

          <div className="mt-8 space-y-4">
            {[
              { icon: Sparkles, key: 'auth.noRegistration', dkey: 'auth.noRegistrationDetail' },
              { icon: KeyRound, key: 'auth.providersAreIdentities', dkey: 'auth.providersAreIdentitiesDetail' },
              { icon: ShieldCheck, key: 'auth.verifiedPipeline', dkey: 'auth.verifiedPipelineDetail' },
            ].map(({ icon: Icon, key, dkey }) => (
              <div key={key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#2e9f91] shadow-[0_2px_8px_rgba(35,53,68,.06)]">
                  <Icon size={15} />
                </span>
                <div>
                  <strong className="block text-xs text-[#455267]">{t(key)}</strong>
                  <p className="mt-0.5 text-[11px] leading-5 text-[#87909c]">{t(dkey)}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 flex items-center gap-2 text-[11px] font-semibold text-[#87909c]">
            <Check size={13} className="text-[#2e9f91]" />
            {t('auth.accountFollows')}
          </p>
        </div>

        <div className="page-enter stagger-2">
          <div className="rounded-3xl border border-[#e6e2d9] bg-white p-6 shadow-[0_24px_70px_rgba(35,53,68,.1)] sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('common.signIn')}</p>
            <h2 className="mt-2 font-display text-[22px] font-bold tracking-[-.03em] text-[#202f46]">
              {t('auth.signInTitle')}
            </h2>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => startProviderAuth('discord', returnTo)}
                disabled={!portalConfig.discordConfigured}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] px-4 text-xs font-bold text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageCircle size={16} /> {t('auth.continueDiscord')}
              </button>
              {!portalConfig.discordConfigured && (
                <p className="-mt-1.5 px-1 text-[10px] leading-4 text-[#98a1ad]">
                  {t('auth.discordNotConfigured')}
                </p>
              )}
            </div>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#eeeae2]" />
              <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a0a7af]">or</span>
              <span className="h-px flex-1 bg-[#eeeae2]" />
            </div>

            <div className="rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4">
              <p className="flex items-center gap-2 text-[11px] font-bold text-[#247c70]">
                <UserRound size={13} /> {t('auth.continueNulls')}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#518b83]">{t('auth.nullsHint')}</p>
              <NullsConnectWizard
                linked={false}
                onLinked={() => {
                  window.location.assign(returnTo.startsWith('/') ? returnTo : '/dashboard');
                }}
              />
            </div>

            {oauthErrorText && (
              <p className="mt-4 rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#ca4e44]">
                {oauthErrorText}
              </p>
            )}

            <p className="mt-5 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] px-3.5 py-3 text-[10px] leading-5 text-[#98a1ad]">
              {t('auth.firstTime')}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
