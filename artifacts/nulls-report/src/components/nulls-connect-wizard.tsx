import { useState } from 'react';
import { customFetch } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Check, KeyRound, Link2, Loader2, Mail, RefreshCw, Unlink } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';

type Step = 'idle' | 'email' | 'pin' | 'completing';

/**
 * Nulls Connect is a trusted authentication method: it signs you into your
 * portal account and (when already signed in) links the same account to the
 * new provider. The flow authenticates the general Nulls identity through the
 * account email — there is deliberately NO game-account selection step:
 * game accounts are separate optional data, never part of authentication.
 *
 *   email → code from email → /complete creates/links the portal account and
 *   (on sign-in) establishes the session. Used by Settings, the auth page and
 *   the report submission guard.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('idle');
    setEmail('');
    setPin('');
    setToken('');
    setError('');
  };

  /** Finishes authentication with the token from Nulls Connect. */
  const complete = async (authToken: string) => {
    setBusy(true);
    setError('');
    try {
      // The verified email is sent along so the server can key the portal
      // identity to the general Nulls account (not a game player).
      const user = await customFetch<User>('/api/nulls-connect/complete', {
        method: 'POST',
        body: JSON.stringify({ token: authToken, email: email.trim() }),
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
        setToken(res.token);
        await complete(res.token);
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
      setToken(res.token);
      await complete(res.token);
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
