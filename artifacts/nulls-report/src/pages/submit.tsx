import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { useCreateReport, useRequestUploadUrl } from '@workspace/api-client-react';
import type { CreateReportInput } from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Lock,
  Paperclip,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  AppShell,
  EmptyState,
  PageEnter,
  PageHeading,
  Spinner,
} from '@/components/portal-ui';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { apiErrorMessage, API_KEYS, queryClient } from '@/lib/api';
import { CATEGORIES, GAMES, MAX_UPLOAD_BYTES } from '@/lib/catalog';
import { formatBytes } from '@/lib/format';

interface Draft {
  game?: string;
  category?: string;
  subtype?: string;
  title?: string;
  details?: string;
  anonymous?: boolean;
}

const DRAFT_KEY = 'nulls-report:draft';

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

interface PendingFile {
  localId: string;
  file: File;
  status: 'pending' | 'uploading' | 'ready' | 'error';
  error?: string;
  attachmentId?: number;
}

export function SubmitPage() {
  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();
  const { reports } = useReports();
  const { getToken } = useAuth();
  const [, navigate] = useLocation();

  const requestUpload = useRequestUploadUrl();
  const createReport = useCreateReport({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: API_KEYS.reports });
      },
    },
  });

  const [step, setStep] = useState(1);
  const [game, setGame] = useState<string>(loadDraft().game ?? '');
  const [category, setCategory] = useState<string>(loadDraft().category ?? '');
  const [subtype, setSubtype] = useState<string>(loadDraft().subtype ?? '');
  const [title, setTitle] = useState<string>(loadDraft().title ?? '');
  const [details, setDetails] = useState<string>(loadDraft().details ?? '');
  const [anonymous, setAnonymous] = useState<boolean>(loadDraft().anonymous ?? false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const draft = useMemo(
    () => ({ game, category, subtype, title, details, anonymous }),
    [game, category, subtype, title, details, anonymous],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [draft]);

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  const reviewCount = reports.length;

  const canNext =
    step === 1 ? Boolean(game) :
    step === 2 ? Boolean(category && subtype) :
    step === 3 ? title.trim().length >= 3 && details.trim().length >= 10 : true;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ready = files.filter((f) => f.status === 'ready');
      if (files.some((f) => f.status === 'pending' || f.status === 'uploading')) {
        toast.error('Wait for all attachments to finish uploading');
        setSubmitting(false);
        return;
      }
      const payload: CreateReportInput = {
        game: game as CreateReportInput['game'],
        category: category as CreateReportInput['category'],
        subtype: subtype.trim(),
        title: title.trim(),
        details: details.trim(),
        anonymous,
        attachmentIds: ready.map((f) => f.attachmentId as number),
      };
      const created = await createReport.mutateAsync({ data: payload });
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setSubmittedTicket(created.ticketNumber);
      navigate(`/reports/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} exceeds the 50 MB limit`);
        continue;
      }
      const entry: PendingFile = {
        localId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending',
      };
      next.push(entry);
      void uploadOne(entry);
    }
    setFiles(next);
  };

  const uploadOne = async (entry: PendingFile) => {
    setFiles((prev) => prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'uploading' } : f)));
    try {
      const token = await getToken();
      const res = await requestUpload.mutateAsync({
        data: { name: entry.file.name, size: entry.file.size, contentType: entry.file.type || 'application/octet-stream' },
      });
      await fetch(res.uploadURL, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': entry.file.type || 'application/octet-stream',
        },
        body: entry.file,
      });
      setFiles((prev) =>
        prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'ready', attachmentId: res.id } : f)),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'error', error: apiErrorMessage(err) } : f)),
      );
    }
  };

  const removeFile = (localId: string) => {
    setFiles((prev) => prev.filter((f) => f.localId !== localId));
  };

  // Success state — the ticket exists, so route to it instead.
  if (submittedTicket) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <PageEnter>
          <div className="mx-auto max-w-2xl">
            <div className="rounded-3xl border border-[#dceae6] bg-[#f1faf7] px-6 py-14 text-center sm:px-16">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2e9f91] text-white shadow-[0_8px_20px_rgba(46,159,145,.2)]">
                <Check size={30} />
              </span>
              <p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-[#398277]">Report submitted</p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.045em] text-[#202f46]">
                Ticket {submittedTicket} is open.
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#61847f]">
                A moderator will review the report, then verified issues are forwarded to the
                administrator team. You can track everything from the ticket page.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
                <Link href="/my-reports" className="rounded-xl bg-[#202f46] px-5 py-3 text-xs font-bold text-white">
                  Go to My reports
                </Link>
                <Link href="/submit" className="rounded-xl border border-[#c9d8d5] px-5 py-3 text-xs font-bold text-[#247c70]">
                  Submit another
                </Link>
              </div>
            </div>
          </div>
        </PageEnter>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <PageHeading
          eyebrow="Private workspace / New report"
          title="Submit a report"
          detail="Reports become tickets: a moderator verifies the issue, then administrators handle verified tickets."
        />

        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full transition ${n <= step ? 'bg-[#ef6358]' : 'bg-[#e2ded5]'}`} />
          ))}
        </div>

        <div className="mx-auto max-w-3xl">
          {/* Step 1 — game */}
          {step === 1 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">Step 1 · Game</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                Which game is the report about?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#7b8693]">
                Only Null's Brawl is open for reports right now. The other games will become
                available soon.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {GAMES.map((g) => {
                  const selected = game === g.id;
                  const disabled = !g.enabled;
                  return (
                    <button
                      key={g.id}
                      disabled={disabled}
                      onClick={() => setGame(g.id)}
                      className={`relative rounded-2xl border p-5 text-left transition ${
                        disabled
                          ? 'cursor-not-allowed border-[#eeeae2] bg-[#faf8f3] opacity-70'
                          : selected
                            ? 'border-[#ef6358] bg-[#fff0ed] shadow-[0_6px_20px_rgba(239,99,88,.1)]'
                            : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'
                      }`}
                    >
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-xl font-display text-[15px] font-bold text-white"
                        style={{ background: g.color }}
                      >
                        {g.prefix[0]}
                      </span>
                      <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{g.name}</h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{g.tagline}</p>
                      <span
                        className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${
                          disabled ? 'bg-[#eef0f4] text-[#8a94a1]' : selected ? 'bg-[#ef6358] text-white' : 'bg-[#e8f6f3] text-[#247c70]'
                        }`}
                      >
                        {disabled ? <Lock size={11} /> : <Check size={11} />}
                        {disabled ? 'Coming soon' : selected ? 'Selected' : 'Open for reports'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 — category & subtype */}
          {step === 2 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">Step 2 · Category</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                What kind of issue is it?
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {Object.values(CATEGORIES).map((c) => {
                  const selected = category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategory(c.id);
                        setSubtype('');
                      }}
                      className={`rounded-2xl border p-5 text-left transition ${
                        selected ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold" style={{ background: `${c.color}18`, color: c.color }}>
                        {c.label.slice(0, 1)}
                      </span>
                      <h3 className="mt-3 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{c.label}</h3>
                      <p className="mt-1 text-[10px] leading-4 text-[#98a1ad]">{c.subtypes.length} sub-types</p>
                    </button>
                  );
                })}
              </div>

              {category && (
                <div className="mt-6 border-t border-[#eeeae2] pt-5">
                  <label className="mb-3 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                    Sub-type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES[category].subtypes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSubtype(s)}
                        className={`rounded-lg border px-3 py-2 text-[11px] font-bold transition ${
                          subtype === s
                            ? 'border-[#202f46] bg-[#202f46] text-white'
                            : 'border-[#e4e0d7] text-[#6a7584] hover:border-[#ef6358]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — details + attachments */}
          {step === 3 && (
            <div className="page-enter space-y-5">
              <div className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">Step 3 · Details</p>
                <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                  Describe the issue.
                </h2>
                <div className="mt-6 space-y-5">
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                      Title <span className="normal-case text-[#c0c6ce]">(3–160 characters)</span>
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={160}
                      placeholder="A short summary of what happened"
                      className="h-12 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#ef6358]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                      Details <span className="normal-case text-[#c0c6ce]">(at least 10 characters)</span>
                    </label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      rows={7}
                      maxLength={10000}
                      placeholder="What happened? When did it start? What have you already tried?"
                      className="w-full resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] p-4 text-sm leading-6 outline-none focus:border-[#ef6358]"
                    />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e6e2d9] bg-[#fbfaf7] p-4">
                    <input
                      type="checkbox"
                      checked={anonymous}
                      onChange={(e) => setAnonymous(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#ef6358]"
                    />
                    <span>
                      <strong className="block text-xs text-[#455267]">Submit anonymously to staff</strong>
                      <span className="mt-1 block text-[11px] leading-5 text-[#87909c]">
                        Your name is hidden from moderators and administrators on this ticket. The
                        report still belongs to your account.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
                <h3 className="font-display text-[18px] font-bold tracking-[-.025em] text-[#253044]">Attachments</h3>
                <p className="mt-1 text-xs text-[#87909c]">
                  Any file type up to {formatBytes(MAX_UPLOAD_BYTES)} each. Screenshots, recordings, logs — all stored securely.
                </p>
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d7d2c8] bg-[#fbfaf7] p-8 text-center transition hover:border-[#ef6358] hover:bg-[#fffcf5]">
                  <UploadCloud size={22} className="text-[#8a94a1]" />
                  <span className="text-xs font-bold text-[#536174]">Choose files to attach</span>
                  <span className="text-[10px] text-[#a0a7af]">PDF, PNG, JPG, MP4, TXT, ZIP…</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {files.map((f) => (
                      <li key={f.localId} className="flex items-center gap-3 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] px-4 py-3">
                        <Paperclip size={15} className="text-[#8a94a1]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[#455267]">{f.file.name}</p>
                          <p className="text-[10px] text-[#98a1ad]">{formatBytes(f.file.size)}</p>
                        </div>
                        {f.status === 'uploading' && <span className="text-[10px] font-bold text-[#ce9d40]">Uploading…</span>}
                        {f.status === 'ready' && <span className="flex items-center gap-1 text-[10px] font-bold text-[#39824b]"><CheckCircle2 size={13} /> Ready</span>}
                        {f.status === 'error' && <span className="text-[10px] font-bold text-[#ca4e44]">{f.error ?? 'Failed'}</span>}
                        <button onClick={() => removeFile(f.localId)} className="rounded-lg p-1.5 text-[#98a1ad] hover:bg-[#f1eee7] hover:text-[#ca4e44]" aria-label={`Remove ${f.file.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Step 4 — review */}
          {step === 4 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">Step 4 · Review</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">One last check.</h2>
              <dl className="mt-6 divide-y divide-[#eeeae2] text-sm">
                {[
                  ['Game', GAMES.find((g) => g.id === game)?.name ?? game],
                  ['Category', `${CATEGORIES[category]?.label ?? category} · ${subtype}`],
                  ['Title', title],
                  ['Anonymous', anonymous ? 'Yes — hidden from staff' : 'No'],
                  ['Attachments', files.filter((f) => f.status === 'ready').length ? `${files.filter((f) => f.status === 'ready').length} file(s)` : 'None'],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[130px_1fr] gap-4 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#98a1ad]">{label}</dt>
                    <dd className="text-[13px] font-semibold text-[#455267]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4 text-xs leading-6 text-[#518b83]">
                You already have <strong>{reviewCount}</strong> report{reviewCount === 1 ? '' : 's'} on this account. Submitting this report
                creates a new ticket — you won't be able to edit it afterwards, only track it.
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-1.5 rounded-xl border border-[#dedbd3] bg-white px-4 py-2.5 text-xs font-bold text-[#536174] disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Back
            </button>
            {step < 4 ? (
              <button
                onClick={() => canNext && setStep((s) => s + 1)}
                disabled={!canNext}
                className="flex items-center gap-1.5 rounded-xl bg-[#202f46] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Continue <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={submitting || files.some((f) => f.status === 'pending' || f.status === 'uploading')}
                className="flex items-center gap-2 rounded-xl bg-[#ef6358] px-6 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)] disabled:opacity-50"
              >
                {submitting ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Submitting…</>
                ) : (
                  <><FileText size={14} /> Submit report</>
                )}
              </button>
            )}
          </div>
        </div>

        {reports.length === 0 && step === 1 && (
          <div className="mt-10">
            <EmptyState
              icon={FileText}
              title="First report?"
              detail="This will become ticket number one on your account. Staff can't see your other private data."
            />
          </div>
        )}
      </PageEnter>
    </AppShell>
  );
}
