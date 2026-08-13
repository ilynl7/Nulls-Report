import { useState } from 'react';
import { customFetch } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Check, ChevronRight, Gamepad2, KeyRound, Link2, Loader2, Mail, RefreshCw, Unlink } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';

type Step = 'idle' | 'email' | 'pin' | 'pick' | 'completing';

type PlayerAccount = {
  playerId: string;
  game: string;
  name: string;
  tag: string | null;
};

/**
 * Nulls Connect is a trusted authentication method: it signs you into your
 * portal account and (when already signed in) links the same account to the
 * new provider.
 *
 *   email → code from your email → CHOOSE your game account → /complete
 *   creates/links the portal account and (on sign-in) establishes the session.
 *
 * The account is never picked implicitly: after the PIN the user always sees
 * the list of game accounts their Nulls Connect token owns and picks one.
 * Used by Settings, the auth page and the report submission guard.
 */
export function NullsConnectWizard({
  linked,
  label,
  linkedName,
  onLinked,
  onUnlink,
  unlinkBusy,
  accentClass = 'bg-[#2e9f91]',
}: {
  linked: boolean;
  /** Display label from the linked auth method (e.g. the in-game name). */
  label?: string | null;
  linkedName?: string | null;
  onLinked: (user: User) => void;
  onUnlink?: () => void;
  unlinkBusy?: boolean;
  accentClass?: string;
}) {
  const [step, setStep] = useState<Step>('idle');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [token, setToken] = useState('');
  const [accounts, setAccounts] = useState<PlayerAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('idle');
    setEmail('');
    setPin('');
    setToken('');
    setAccounts([]);
    setError('');
  };

  /** Loads the game accounts the token owns and shows the picker. */
  const loadAccounts = async (authToken: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await customFetch<{ links?: PlayerAccount[] }>('/api/nulls-connect/links', {
        method: 'POST',
        body: JSON.stringify({ token: authToken }),
        responseType: 'json',
      });
      const links = res?.links ?? [];
      if (links.length === 0) {
        throw new Error('No game accounts found for this Nulls Connect account. Link a game account on connect.nulls.gg first.');
      }
      setAccounts(links);
      setToken(authToken);
      setStep('pick');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /** Finishes authentication with the token + the chosen game account. */
  const complete = async (authToken: string, playerId: string) => {
    setBusy(true);
    setError('');
    try {
      const user = await customFetch<User>('/api/nulls-connect/complete', {
        method: 'POST',
        body: JSON.stringify({ token: authToken, email: email.trim(), playerId }),
        responseType: 'json',
      });
      setStep('completing');
      toast.success('Connected to Nulls Connect');
      reset();
      onLinked(user);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await customFetch<{ pin_required?: boolean; token?: string; error_type?: string }>(
        '/api/nulls-connect/auth',
        { method: 'POST', body: JSON.stringify({ email: email.trim() }), responseType: 'json' },
      );
      if (res?.token) {
        await loadAccounts(res.token);
      } else if (res?.pin_required) {
        setStep('pin');
      } else {
        throw new Error('That email is not registered with Nulls Connect.');
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await customFetch<{ token?: string; error_type?: string }>('/api/nulls-connect/verify', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
        responseType: 'json',
      });
      if (!res?.token) throw new Error('Invalid code. Check the email from Nulls Connect and try again.');
      await loadAccounts(res.token);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (linked) {
    return (
      <div className="mt-4 rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-[#247c70]">
          <Check size={14} /> Connected
        </p>
        <p className="mt-1.5 text-[11px] leading-5 text-[#518b83]">
          {label ?? linkedName ?? 'Nulls Connect account'}
        </p>
        {onUnlink && (
          <button
            onClick={() => void onUnlink()}
            disabled={unlinkBusy}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#c8e4dd] px-3 py-2 text-[10px] font-bold text-[#247c70] disabled:opacity-50"
          >
            <Unlink size={12} /> Disconnect
          </button>
        )}
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('email')}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white ${accentClass}`}
      >
        <Link2 size={14} /> Connect Nulls Connect
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {step === 'email' && (
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
            <Mail size={11} className="mr-1 inline" /> Email used for Nulls Connect
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email.trim() && !busy) void start();
            }}
            placeholder="you@example.com"
            className="h-11 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#2e9f91]"
          />
          <button
            onClick={() => void start()}
            disabled={busy || !email.trim()}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 ${accentClass}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
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
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pin.length >= 4 && !busy) void verify();
            }}
            placeholder="123456"
            inputMode="numeric"
            className="h-11 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 font-mono text-sm outline-none focus:border-[#2e9f91]"
          />
          <button
            onClick={() => void verify()}
            disabled={busy || pin.length < 4}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 ${accentClass}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Verify code
          </button>
        </div>
      )}

      {step === 'pick' && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
            <Gamepad2 size={11} /> Choose your game account
          </p>
          <p className="mb-3 text-[11px] leading-5 text-[#6e7887]">
            This account signs you into the portal. You can link more later from Settings.
          </p>
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.playerId}
                onClick={() => void complete(token, account.playerId)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e1ded6] bg-white px-4 py-3 text-left transition hover:border-[#2e9f91] hover:bg-[#f1faf7] disabled:opacity-50"
              >
                <span>
                  <span className="block text-[13px] font-bold text-[#253044]">{account.name}</span>
                  <span className="block text-[10px] font-mono text-[#98a1ad]">
                    {account.tag ? `#${account.tag} · ` : ''}Null's Brawl
                  </span>
                </span>
                {busy ? (
                  <Loader2 size={14} className="animate-spin text-[#2e9f91]" />
                ) : (
                  <ChevronRight size={14} className="text-[#98a1ad]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'completing' && (
        <p className="flex items-center gap-2 rounded-xl border border-[#dceae6] bg-[#f1faf7] px-3 py-2.5 text-[11px] font-bold text-[#247c70]">
          <Loader2 size={13} className="animate-spin" /> Connecting your Nulls identity…
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#ca4e44]">
          {error}
        </p>
      )}

      <button onClick={reset} className="flex items-center gap-1.5 text-[10px] font-bold text-[#8e98a5] hover:text-[#536174]">
        <RefreshCw size={11} /> Start over
      </button>
    </div>
  );
}
