import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useCreateReport, useRequestUploadUrl } from '@workspace/api-client-react';
import type { CreateReportInput } from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Flag,
  KeyRound,
  Lock,
  MessageCircle,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { AppShell, EmptyState, PageEnter, PageHeading, Spinner } from '@/components/portal-ui';
import { NullsConnectWizard } from '@/components/nulls-connect-wizard';
import { portalConfig } from '@/lib/config';
import { useNotifications, usePortalUser, useReports } from '@/lib/hooks';
import { apiErrorMessage, API_KEYS, queryClient, startProviderAuth } from '@/lib/api';
import {
  BUG_SUBCATEGORIES,
  MAX_UPLOAD_BYTES,
  REPORT_FLOW,
  findOption,
  optionLabel,
  type ReportField,
} from '@/lib/catalog';
import { formatBytes } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

interface Draft {
  issueType?: string;
  optionId?: string;
  subcategoryId?: string;
  answers?: Record<string, string | boolean>;
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
  const { t } = useI18n();
  const { user, isLoading: userLoading, refetch } = usePortalUser();
  const { unread } = useNotifications();
  const { reports } = useReports();
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
  const [issueType, setIssueType] = useState<string>(loadDraft().issueType ?? '');
  const [optionId, setOptionId] = useState<string>(loadDraft().optionId ?? '');
  const [subcategoryId, setSubcategoryId] = useState<string>(loadDraft().subcategoryId ?? '');
  const [answers, setAnswers] = useState<Record<string, string | boolean>>(loadDraft().answers ?? {});
  const [title, setTitle] = useState('');
  const [anonymous, setAnonymous] = useState<boolean>(loadDraft().anonymous ?? false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal');

  const draft = useMemo(
    () => ({ issueType, optionId, subcategoryId, answers, anonymous }),
    [issueType, optionId, subcategoryId, answers, anonymous],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [draft]);

  const option = findOption(optionId);
  const isBug = optionId === 'bug';
  const bugSub = BUG_SUBCATEGORIES.find((s) => s.id === subcategoryId);
  const activeFields: ReportField[] =
    isBug ? (bugSub?.fields ?? []) : (option?.fields ?? []);

  // Dynamic step count: 1 issue type · 2 option · 3 bug category (game bugs
  // only) · 4 details · 5 attachments · 6 review.
  const detailStep = isBug ? 4 : 3;
  const totalSteps = isBug ? 6 : 5;

  // Auto-title from the flow so users never stare at a blank title.
  const autoTitle = useMemo(() => {
    const base = isBug ? `Bug · ${bugSub?.label ?? ''}` : (option?.label ?? '');
    if (base === 'Bug · ' || base === '') return `${optionLabel(optionId) ?? t('submit.reportFallback')} — ${t('games.nullsBrawl')}`;
    const firstText = activeFields
      .map((f) => answers[f.key])
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (firstText) {
      return `${base} · ${firstText.trim().slice(0, 90)}`;
    }
    return `${base} — ${t('games.nullsBrawl')}`;
  }, [optionId, bugSub?.label, option?.label, activeFields, answers, t]);

  const effectiveTitle = title.trim() || autoTitle;

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label={t('common.loading')} />
      </AppShell>
    );
  }

  // -----------------------------------------------------------------------
  // Report submission guard: creating an account is free, but submitting a
  // report requires at least one trusted authentication method. The backend
  // enforces the same rule; this screen makes it obvious and keeps the draft.
  // -----------------------------------------------------------------------
  if (!user.hasTrustedAuth) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <PageEnter>
          <PageHeading
            eyebrow={t('submit.signInEyebrow')}
            title={t('submit.signInTitle')}
            detail={t('submit.signInDetail')}
          />
          <div className="mx-auto max-w-2xl rounded-3xl border border-[#e6e2d9] bg-white p-6 sm:p-10">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0ed] text-[#ef6358]">
              <ShieldCheck size={26} />
            </span>
            <h2 className="mt-6 font-display text-[26px] font-bold tracking-[-.04em] text-[#202f46]">
              {t('submit.signInHeading')}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[#6e7887]">
              {t('submit.signInBody')}
            </p>

            <div className="mt-7 space-y-3">
              <button
                onClick={() => startProviderAuth('discord', '/submit')}
                disabled={!portalConfig.discordConfigured}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] px-4 text-xs font-bold text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageCircle size={15} /> {t('submit.signInDiscord')}
              </button>
              {!portalConfig.discordConfigured && (
                <p className="text-[10px] leading-4 text-[#98a1ad]">
                  {t('submit.discordNeedsCreds')}
                </p>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4">
              <p className="flex items-center gap-2 text-[11px] font-bold text-[#247c70]">
                <KeyRound size={13} /> Nulls Connect
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#518b83]">
                {t('submit.nullsWorks')}
              </p>
              <NullsConnectWizard
                linked={false}
                onLinked={() => {
                  void refetch();
                }}
              />
            </div>
          </div>
        </PageEnter>
      </AppShell>
    );
  }

  const reviewCount = reports.length;

  const fieldValid = (f: ReportField): boolean => {
    const value = answers[f.key];
    if (f.type === 'checkbox') return f.required ? value === true : true;
    if (f.required) {
      if (typeof value !== 'string' || !value.trim()) return false;
      const min = f.minLength ?? 1;
      return value.trim().length >= min;
    }
    return true;
  };

  const canNext =
    step === 1 ? Boolean(issueType) :
    step === 2 ? Boolean(optionId) :
    step === 3 ? Boolean(subcategoryId) :
    step === detailStep ? activeFields.every(fieldValid) : true;

  const buildDetails = (): string => {
    const lines: string[] = [];
    for (const f of activeFields) {
      const value = answers[f.key];
      if (typeof value === 'boolean') {
        if (value) lines.push(`${f.label}: Yes`);
      } else if (typeof value === 'string' && value.trim()) {
        lines.push(`${f.label}:\n${value.trim()}`);
      }
    }
    return lines.join('\n\n') || 'No additional details provided.';
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (files.some((f) => f.status === 'pending' || f.status === 'uploading')) {
        toast.error(t('submit.waitAttachments'));
        setSubmitting(false);
        return;
      }
      const ready = files.filter((f) => f.status === 'ready');
      const nonEmptyAnswers: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(answers)) {
        if (typeof value === 'boolean') nonEmptyAnswers[key] = value;
        else if (typeof value === 'string' && value.trim()) nonEmptyAnswers[key] = value.trim();
      }
      const payload: CreateReportInput = {
        game: 'nulls-brawl',
        issueType: (issueType === 'community' || issueType === 'game' ? issueType : 'community') as CreateReportInput['issueType'],
        category: optionId,
        subtype: isBug ? (bugSub?.id ?? 'other') : 'general',
        title: effectiveTitle.slice(0, 160),
        details: buildDetails(),
        fields: nonEmptyAnswers,
        anonymous,
        visibility,
        priority,
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
        toast.error(t('submit.uploadLimit', { name: file.name }));
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
      const res = await requestUpload.mutateAsync({
        data: { name: entry.file.name, size: entry.file.size, contentType: entry.file.type || 'application/octet-stream' },
      });
      // Same-origin: the portal session cookie authenticates the PUT.
      const put = await fetch(res.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': entry.file.type || 'application/octet-stream' },
        body: entry.file,
      });
      if (!put.ok) throw new Error(t('submit.uploadFailed'));
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

  const setAnswer = (key: string, value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const resetFlow = () => {
    setIssueType('');
    setOptionId('');
    setSubcategoryId('');
    setAnswers({});
    setTitle('');
    setStep(1);
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
              <p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-[#398277]">{t('submit.successEyebrow')}</p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.045em] text-[#202f46]">
                {t('submit.successTitle', { ticket: submittedTicket })}
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#61847f]">
                {t('submit.successDesc')}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
                <Link href="/my-reports" className="rounded-xl bg-[#202f46] px-5 py-3 text-xs font-bold text-white">
                  {t('submit.goMyReports')}
                </Link>
                <Link href="/submit" className="rounded-xl border border-[#c9d8d5] px-5 py-3 text-xs font-bold text-[#247c70]">
                  {t('submit.submitAnother')}
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
          eyebrow={t('submit.eyebrow')}
          title={t('submit.title')}
          detail={t('submit.detail')}
        />

        <div className="mb-6 flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition ${i + 1 <= step ? 'bg-[#ef6358]' : 'bg-[#e2ded5]'}`} />
          ))}
        </div>

        <div className="mx-auto max-w-3xl">
          {/* Step 1 — issue type */}
          {step === 1 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">{t('submit.step1Label')}</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">{t('submit.step1Title')}</h2>
              <p className="mt-2 text-sm leading-6 text-[#7b8693]">
                {t('submit.step1Desc')}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {Object.values(REPORT_FLOW).map((branch) => {
                  const selected = issueType === branch.id;
                  return (
                    <button
                      key={branch.id}
                      onClick={() => { setIssueType(branch.id); setOptionId(''); setSubcategoryId(''); setAnswers({}); }}
                      className={`relative rounded-2xl border p-5 text-left transition ${
                        selected
                          ? 'border-[#ef6358] bg-[#fff0ed] shadow-[0_6px_20px_rgba(239,99,88,.1)]'
                          : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'
                      }`}
                    >
                      <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-[11px] font-bold ${branch.id === 'community' ? 'bg-[#e8f6f3] text-[#247c70]' : 'bg-[#f2f0fb] text-[#5b50a8]'}`}>
                        {branch.id === 'community' ? '🤝' : '🎮'}
                      </span>
                      <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{branch.label}</h3>
                      <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{branch.description}</p>
                      <span className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold ${
                        selected ? 'bg-[#ef6358] text-white' : 'bg-[#eef0f4] text-[#8a94a1]'
                      }`}>
                        {selected ? <Check size={11} /> : <Sparkles size={11} />}
                        {selected ? t('submit.selected') : t('submit.reportTypes', { count: branch.options.length })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 — option */}
          {step === 2 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">
                {t('submit.step2Label', { type: REPORT_FLOW[issueType as 'community' | 'game']?.label ?? issueType })}
              </p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                {issueType === 'community' ? t('submit.step2CommunityTitle') : t('submit.step2GameTitle')}
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {REPORT_FLOW[issueType as 'community' | 'game']?.options.map((option) => {
                  const selected = optionId === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => { setOptionId(option.id); setSubcategoryId(''); setAnswers({}); }}
                      className={`rounded-2xl border p-5 text-left transition ${
                        selected ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold" style={{ background: `${option.accent}18`, color: option.accent }}>
                        {option.short.slice(0, 2).toUpperCase()}
                      </span>
                      <h3 className="mt-3 font-display text-[15px] font-bold tracking-[-.02em] text-[#253044]">{option.label}</h3>
                      <p className="mt-1 text-[10px] leading-4 text-[#98a1ad]">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3 — bug subcategory */}
          {step === 3 && isBug && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">{t('submit.step3Label')}</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                {t('submit.step3Title')}
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {BUG_SUBCATEGORIES.map((sub) => {
                  const selected = subcategoryId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => { setSubcategoryId(sub.id); setAnswers({}); }}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected ? 'border-[#ef6358] bg-[#fff0ed]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'
                      }`}
                    >
                      <h3 className="font-display text-[14px] font-bold tracking-[-.02em] text-[#253044]">{sub.label}</h3>
                      <p className="mt-1 text-[10px] leading-4 text-[#98a1ad]">{sub.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Details step (dynamic fields) */}
          {step === detailStep && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">
                {t('submit.detailsLabel', { n: detailStep })}
              </p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                {option?.label ?? bugSub?.label ?? t('submit.reportFallback')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#7b8693]">
                {t('submit.detailsDesc')}
              </p>
              <div className="mt-6 space-y-5">
                {activeFields.map((f) => (
                  <ReportFieldInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswer(f.key, v)} />
                ))}
                {activeFields.length === 0 && (
                  <p className="rounded-xl border border-[#eeeae2] bg-[#fbfaf7] p-4 text-xs text-[#87909c]">
                    {t('submit.noFields')}
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e6e2d9] bg-[#fbfaf7] p-4">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#ef6358]"
                  />
                  <span>
                    <strong className="block text-xs text-[#455267]">{t('submit.anonymousLabel')}</strong>
                    <span className="mt-1 block text-[11px] leading-5 text-[#87909c]">
                      {t('submit.anonymousDesc')}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Attachments step */}
          {step === totalSteps - 1 && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">{t('submit.evidenceLabel', { n: totalSteps - 1 })}</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">
                {t('submit.evidenceTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#7b8693]">
                {t('submit.evidenceDesc', { size: formatBytes(MAX_UPLOAD_BYTES) })}
              </p>
              <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d7d2c8] bg-[#fbfaf7] p-8 text-center transition hover:border-[#ef6358] hover:bg-[#fffcf5]">
                <UploadCloud size={22} className="text-[#8a94a1]" />
                <span className="text-xs font-bold text-[#536174]">{t('submit.chooseFiles')}</span>
                <span className="text-[10px] text-[#a0a7af]">{t('submit.fileTypes')}</span>
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
                      {f.status === 'uploading' && <span className="text-[10px] font-bold text-[#ce9d40]">{t('detail.uploading')}</span>}
                      {f.status === 'ready' && <span className="flex items-center gap-1 text-[10px] font-bold text-[#39824b]"><CheckCircle2 size={13} /> {t('submit.ready')}</span>}
                      {f.status === 'error' && <span className="text-[10px] font-bold text-[#ca4e44]">{f.error ?? t('detail.failed')}</span>}
                      <button onClick={() => removeFile(f.localId)} className="rounded-lg p-1.5 text-[#98a1ad] hover:bg-[#f1eee7] hover:text-[#ca4e44]" aria-label={t('submit.removeFile', { name: f.file.name })}>
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Review step */}
          {step === totalSteps && (
            <div className="page-enter rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#ef6358]">{t('submit.reviewLabel', { n: totalSteps })}</p>
              <h2 className="mt-2 font-display text-[25px] font-bold tracking-[-.04em] text-[#202f46]">{t('submit.reviewTitle')}</h2>
              <div className="mt-6">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                  {t('submit.titleLabel')} <span className="normal-case text-[#c0c6ce]">{t('submit.autoTitleHint')}</span>
                </label>
                <input
                  value={effectiveTitle}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  className="h-12 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-sm font-bold outline-none focus:border-[#ef6358]"
                />
              </div>

              {/* Visibility */}
              <div className="mt-6">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.visibility')}</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`rounded-2xl border p-4 text-left transition ${visibility === 'public' ? 'border-[#2e9f91] bg-[#e8f6f3]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-[#247c70]">
                      <Eye size={14} /> {t('submit.publicReport')}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-[#5f8c86]">
                      {t('submit.publicDesc')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`rounded-2xl border p-4 text-left transition ${visibility === 'private' ? 'border-[#7468b6] bg-[#f2f0fb]' : 'border-[#e6e2d9] bg-white hover:border-[#d4cdc0]'}`}
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-[#5b50a8]">
                      <EyeOff size={14} /> {t('submit.privateReport')}
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-[#7c74ad]">
                      {t('submit.privateDesc')}
                    </span>
                  </button>
                </div>
                {priority === 'critical' && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2 text-[10px] font-bold leading-5 text-[#ca4e44]">
                    <Flag size={12} /> {t('submit.riskPolicy')}
                  </p>
                )}
              </div>

              {/* Priority */}
              <div className="mt-5">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.priority')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['normal', 'Normal', '#667085'], ['high', 'High', '#b7771b'], ['critical', 'Critical / Risk', '#ca4e44']] as const).map(([value, , color]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPriority(value)}
                      className={`rounded-xl border px-3 py-2.5 text-[11px] font-bold transition ${priority === value ? 'bg-[#202f46] text-white' : 'border-[#e4e0d7] bg-white text-[#6a7584] hover:border-[#ef6358]'}`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <Flag size={12} style={priority === value ? undefined : { color }} /> {t(`priority.${value}`)}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[#a0a7af]">
                  {t('submit.criticalNote')}
                </p>
              </div>

              <dl className="mt-6 divide-y divide-[#eeeae2] text-sm">
                {[
                  [t('submit.reviewGame'), t('games.nullsBrawl')],
                  [t('submit.reviewIssueType'), REPORT_FLOW[issueType as 'community' | 'game']?.label ?? issueType],
                  [t('submit.reviewCategory'), option?.label ?? optionId],
                  ...(isBug && bugSub ? ([[t('submit.reviewBugCategory'), bugSub.label]] as const) : []),
                  [t('detail.visibility'), visibility === 'public' ? t('submit.publicValue') : t('submit.privateValue')],
                  [t('detail.priority'), t(`priority.${priority}`)],
                  [t('submit.reviewAnonymous'), anonymous ? t('submit.anonymousYes') : t('common.no')],
                  [t('submit.reviewAttachments'), files.filter((f) => f.status === 'ready').length ? t('submit.filesCount', { count: files.filter((f) => f.status === 'ready').length }) : t('submit.none')],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[150px_1fr] gap-4 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#98a1ad]">{label}</dt>
                    <dd className="text-[13px] font-semibold text-[#455267]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl border border-[#dceae6] bg-[#f1faf7] p-4 text-xs leading-6 text-[#518b83]">
                {reviewCount === 1 ? t('submit.existingReports1', { count: reviewCount }) : t('submit.existingReportsN', { count: reviewCount })}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="flex items-center gap-1.5 rounded-xl border border-[#dedbd3] bg-white px-4 py-2.5 text-xs font-bold text-[#536174] disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t('common.back')}
              </button>
              {step > 1 && (
                <button
                  onClick={resetFlow}
                  className="rounded-xl px-3 py-2.5 text-[10px] font-bold text-[#8e98a5] hover:text-[#ca4e44]"
                >
                  {t('submit.startOver')}
                </button>
              )}
            </div>
            {step < totalSteps ? (
              <button
                onClick={() => canNext && setStep((s) => s + 1)}
                disabled={!canNext}
                className="flex items-center gap-1.5 rounded-xl bg-[#202f46] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                {t('common.continue')} <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={submitting || files.some((f) => f.status === 'pending' || f.status === 'uploading')}
                className="flex items-center gap-2 rounded-xl bg-[#ef6358] px-6 py-2.5 text-xs font-bold text-white shadow-[0_5px_15px_rgba(239,99,88,.2)] disabled:opacity-50"
              >
                {submitting ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> {t('submit.submitting')}</>
                ) : (
                  <><FileText size={14} /> {t('submit.submit')}</>
                )}
              </button>
            )}
          </div>
        </div>

        {reports.length === 0 && step === 1 && (
          <div className="mt-10">
            <EmptyState
              icon={FileText}
              title={t('submit.firstReport')}
              detail={t('submit.firstReportDetail')}
            />
          </div>
        )}
      </PageEnter>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Data-driven field renderer
// ---------------------------------------------------------------------------

function ReportFieldInput({
  field,
  value,
  onChange,
}: {
  field: ReportField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useI18n();
  const invalid = field.required && (typeof value !== 'string' || !value.trim() || value.trim().length < (field.minLength ?? 1));
  const textValue = typeof value === 'string' ? value : '';

  return (
    <div>
      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
        {field.label}
        {field.required ? <span className="ml-1 normal-case text-[#ef6358]">*</span> : <span className="ml-1 normal-case text-[#c0c6ce]">{t('submit.optional')}</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          maxLength={field.maxLength ?? 4000}
          placeholder={field.placeholder}
          className={`w-full resize-none rounded-xl border bg-[#fbfaf7] p-4 text-sm leading-6 outline-none transition focus:border-[#ef6358] ${invalid ? 'border-[#efc9c4]' : 'border-[#e1ded6]'}`}
        />
      ) : field.type === 'select' ? (
        <select
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          className={`h-12 w-full rounded-xl border bg-[#fbfaf7] px-4 text-sm outline-none transition focus:border-[#ef6358] ${invalid ? 'border-[#efc9c4]' : 'border-[#e1ded6]'}`}
        >
          <option value="">{t('submit.select')}</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'checkbox' ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e6e2d9] bg-[#fbfaf7] p-4">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#ef6358]" />
          <span className="text-xs text-[#455267]">{field.label}</span>
        </label>
      ) : (
        <input
          type={field.type === 'email' ? 'email' : 'text'}
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength ?? 500}
          placeholder={field.placeholder}
          className={`h-12 w-full rounded-xl border bg-[#fbfaf7] px-4 text-sm outline-none transition focus:border-[#ef6358] ${invalid ? 'border-[#efc9c4]' : 'border-[#e1ded6]'}`}
        />
      )}
      {field.help && <p className="mt-1.5 text-[10px] leading-4 text-[#a0a7af]">{field.help}</p>}
      {invalid && <p className="mt-1.5 text-[10px] font-bold text-[#ca4e44]">{t('submit.requiredField')}</p>}
      {field.expectsEvidence && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#b7771b]">
          <Lock size={10} /> {t('submit.evidenceRecommended')}
        </p>
      )}
    </div>
  );
}
