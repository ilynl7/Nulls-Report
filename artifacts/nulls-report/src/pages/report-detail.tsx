import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import {
  getGetReportQueryKey,
  getListReportMessagesQueryKey,
  useCreateReportMessage,
  useGetReport,
  useListReportMessages,
  useRequestUploadUrl,
  useSetReportReplyPermission,
  useUpdateReport,
  useUpdateReportVisibility,
  useVerifyReport,
} from '@workspace/api-client-react';
import type {
  Attachment,
  CreateMessageInput,
  HistoryItem,
  Message,
  ReportDetail,
  UpdateReportInput,
  UpdateReportVisibilityInput,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileEdit,
  Flag,
  History,
  Inbox,
  Lock,
  MessageSquare,
  Paperclip,
  PenLine,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  AppShell,
  Avatar,
  ErrorState,
  GameBadge,
  PageEnter,
  Spinner,
  StatusBadge,
  VerificationBadge,
  VisibilityBadge,
} from '@/components/portal-ui';
import { AttachmentPreview } from '@/components/attachment-preview';
import { useNotifications, usePortalUser } from '@/lib/hooks';
import { apiErrorMessage, API_KEYS, downloadAttachment, messagesKey, queryClient, reportKey } from '@/lib/api';
import {
  ARCHIVED_STATUSES,
  BUG_SUBCATEGORIES,
  MAX_UPLOAD_BYTES,
  PRIORITIES,
  STATUSES,
  findOption,
  gameById,
  issueTypeInfo,
  optionLabel,
  staffStageInfo,
  verificationInfo,
} from '@/lib/catalog';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

interface ChatFile {
  localId: string;
  file: File;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  attachmentId?: number;
}

function invalidateTicket(id: number) {
  void queryClient.invalidateQueries({ queryKey: reportKey(id) });
  void queryClient.invalidateQueries({ queryKey: messagesKey(id) });
  void queryClient.invalidateQueries({ queryKey: API_KEYS.reports });
}

function newDedupeKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

type TimelineEntry =
  | { kind: 'message'; message: Message; at: string; seq: number }
  | { kind: 'event'; event: HistoryItem; at: string; seq: number };

export function ReportDetailPage() {
  const [, params] = useRoute('/reports/:id');
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const { t } = useI18n();

  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();

  const queryEnabled = !userLoading && !!user && Number.isFinite(id);
  const reportQuery = useGetReport(id, { query: { queryKey: getGetReportQueryKey(id), enabled: queryEnabled } });
  const messagesQuery = useListReportMessages(id, {
    query: { queryKey: getListReportMessagesQueryKey(id), enabled: queryEnabled },
  });

  const updateReport = useUpdateReport({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const updateVisibility = useUpdateReportVisibility({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const verifyReport = useVerifyReport({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const createMessage = useCreateReportMessage({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const requestUpload = useRequestUploadUrl();
  const setReplyPermission = useSetReportReplyPermission({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });

  const [messageBody, setMessageBody] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState('normal');
  const [editDetails, setEditDetails] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [hideMode, setHideMode] = useState(false);
  const [hideReason, setHideReason] = useState('');

  const sendingRef = useRef(false);
  const dedupeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const report = reportQuery.data;
  const messages = messagesQuery.data ?? [];
  const isStaff = !!user && user.role !== 'user';
  const isAdmin = user?.role === 'administrator';
  const isOwner = !!report && !!user && report.ownerId === user.id;
  // Community viewers can read public reports but never participate.
  const isCommunity = !!report && !isStaff && !isOwner;
  const canUserReply = !!report && !isStaff && report.allowUserMessages;

  useEffect(() => {
    if (report && !editingTitle) {
      setEditTitle(report.title);
    }
    if (report && !editingDetails) {
      setEditDetails(report.details);
    }
    if (report && !editingDetails) {
      setEditPriority(report.priority);
    }
  }, [report?.id, report?.title, report?.details, report?.priority, editingTitle, editingDetails]);

  // Scroll the conversation to the newest entry when messages/events arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, report?.history?.length]);

  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...(report?.history ?? []).map((event) => ({ kind: 'event' as const, event, at: event.createdAt, seq: event.id })),
      ...messages.map((message) => ({ kind: 'message' as const, message, at: message.createdAt, seq: message.id })),
    ];
    return entries.sort((a, b) => {
      const diff = a.at.localeCompare(b.at);
      if (diff !== 0) return diff;
      return a.seq - b.seq;
    });
  }, [report?.history, messages]);

  // Statuses this staff member may set directly (also enforced server-side).
  // Computed before any early return so the hook count never changes between
  // the loading and loaded renders.
  const allowedStatuses = useMemo(() => {
    if (!isStaff) return [];
    const base: string[] =
      user?.role === 'administrator'
        ? ['open', 'under_review', 'awaiting_admin', 'in_progress', 'waiting_for_user', 'resolved', 'closed']
        : ['open', 'under_review', 'closed'];
    // Resolving requires a verified ticket.
    if (report?.verification !== 'verified') return base.filter((s) => s !== 'resolved');
    return base;
  }, [isStaff, user?.role, report?.verification]);

  if (!Number.isFinite(id)) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState title={t('detail.invalidTitle')} detail={t('detail.invalidDetail')} onRetry={() => navigate('/my-reports')} />
      </AppShell>
    );
  }

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label={t('detail.loading')} />
      </AppShell>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <Spinner label={t('detail.loading')} />
      </AppShell>
    );
  }

  if (reportQuery.error || !report) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState
          title={t('detail.unavailableTitle')}
          detail={apiErrorMessage(reportQuery.error)}
          onRetry={() => reportQuery.refetch()}
        />
      </AppShell>
    );
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const uploadChatFile = async (entry: ChatFile) => {
    setChatFiles((prev) => prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'uploading' } : f)));
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
      if (!put.ok) throw new Error(t('detail.uploadFailed'));
      setChatFiles((prev) =>
        prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'ready', attachmentId: res.id } : f)),
      );
    } catch (err) {
      setChatFiles((prev) =>
        prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'error', error: apiErrorMessage(err) } : f)),
      );
    }
  };

  const addChatFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...chatFiles];
    for (const file of Array.from(list)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(t('detail.uploadLimit', { name: file.name }));
        continue;
      }
      const entry: ChatFile = {
        localId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'uploading',
      };
      next.push(entry);
      void uploadChatFile(entry);
    }
    setChatFiles(next);
  };

  const removeChatFile = (localId: string) => {
    setChatFiles((prev) => prev.filter((f) => f.localId !== localId));
  };

  const sendMessage = async () => {
    // Synchronous lock: a double-click or Enter+button race in the same tick
    // can never fire two requests.
    if (sendingRef.current || sending) return;
    const body = messageBody.trim();
    if (!body && chatFiles.length === 0) return;
    if (chatFiles.some((f) => f.status === 'uploading')) {
      toast.error(t('detail.waitAttachments'));
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      if (!dedupeRef.current) dedupeRef.current = newDedupeKey();
      const ready = chatFiles.filter((f) => f.status === 'ready');
      const payload: CreateMessageInput = { body, dedupeKey: dedupeRef.current };
      if (ready.length > 0) {
        payload.attachmentIds = ready.map((f) => f.attachmentId as number);
      }
      await createMessage.mutateAsync({ id, data: payload });
      // Success — the next compose session gets a fresh key.
      dedupeRef.current = null;
      setMessageBody('');
      setInternalNote(false);
      setChatFiles([]);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<unknown>, success: string) => {
    if (busyAction) return;
    setBusyAction(key);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const changeStatus = (status: string) =>
    runAction(
      `status:${status}`,
      () => updateReport.mutateAsync({ id, data: { status: status as UpdateReportInput['status'] } }),
      t('detail.statusSet', { status: t(`status.${status}`) }),
    );

  const saveTitle = () =>
    runAction('title', () => updateReport.mutateAsync({ id, data: { title: editTitle.trim() } }), t('detail.titleUpdated')).then(() => setEditingTitle(false));

  const savePriority = () =>
    runAction('priority', () => updateReport.mutateAsync({ id, data: { priority: editPriority as UpdateReportInput['priority'] } }), t('detail.priorityUpdated'));

  const saveDetails = () =>
    runAction('details', () => updateReport.mutateAsync({ id, data: { details: editDetails.trim() } }), t('detail.detailsUpdated')).then(() => setEditingDetails(false));

  const doVerify = async (verified: boolean) => {
    if (busyAction) return;
    if (!verified && !rejectMode) {
      setRejectMode(true);
      return;
    }
    setBusyAction(verified ? 'verify' : 'reject');
    try {
      await verifyReport.mutateAsync({
        id,
        data: verified ? { verified: true } : { verified: false, reason: rejectReason.trim() || undefined },
      });
      if (!verified) {
        setRejectMode(false);
        setRejectReason('');
      }
      toast.success(verified ? t('detail.verifiedForwarded') : t('detail.rejectedClosed'));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const toggleReplies = (enabled: boolean) =>
    runAction('replies', () => setReplyPermission.mutateAsync({ id, data: { enabled } }), enabled ? t('detail.repliesEnabledToast') : t('detail.repliesDisabledToast'));

  const setReportVisibility = (visibility: 'public' | 'private') =>
    runAction('visibility', () => updateVisibility.mutateAsync({ id, data: { visibility } }), t('detail.visibilitySet', { visibility: t(`visibility.${visibility}`) }));

  const hideReport = () =>
    runAction(
      'hide',
      () => updateVisibility.mutateAsync({ id, data: { hidden: true, reason: hideReason.trim() || undefined } }),
      t('detail.hiddenFromCommunity'),
    ).then(() => {
      setHideMode(false);
      setHideReason('');
    });

  const unhideReport = () =>
    runAction('unhide', () => updateVisibility.mutateAsync({ id, data: { hidden: false } }), t('detail.restoredToCommunity'));

  const history = report.history;
  const game = gameById(report.game);
  const verification = verificationInfo(report.verification);
  const issueType = issueTypeInfo(report.issueType);
  const stage = staffStageInfo(report.staffStage);
  const fields = Object.entries(report.fields ?? {}).filter(([, value]) => typeof value === 'string' ? Boolean(value.trim()) : true);

  const canSet = (status: string) => allowedStatuses.includes(status) && status !== report.status;
  const current = report.status;
  const archived = ARCHIVED_STATUSES.includes(current as never);

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <Link
          href={isStaff ? '/inbox' : isOwner ? '/my-reports' : '/reports'}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-[#6e7887] hover:text-[#ef6358]"
        >
          <ArrowLeft size={14} /> {isStaff ? t('detail.backInbox') : isOwner ? t('detail.backMyReports') : t('detail.backCommunity')}
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-[#e6e2d9] bg-white p-6 shadow-[0_3px_10px_rgba(35,53,68,.025)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[12px] font-medium text-[#89929f]">{report.ticketNumber}</span>
            <StatusBadge status={report.status} />
            <VerificationBadge verification={report.verification} />
            <VisibilityBadge visibility={report.effectiveVisibility} />
            <GameBadge game={report.game} />
            {report.priority !== 'normal' && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#ca4e44]">
                <Flag size={12} fill="currentColor" /> {t(`priority.${report.priority}`)}
              </span>
            )}
            {report.allowUserMessages && (
              <span className="rounded-md bg-[#fff6df] px-2 py-1 text-[10px] font-bold text-[#936b16]">{t('detail.replyOpen')}</span>
            )}
            <span className="ml-auto hidden font-mono text-[10px] text-[#a0a7af] sm:block">
              {t(`stage.${report.staffStage}`)} · {t(`issue.${report.issueType}`)}
            </span>
          </div>

          {!isCommunity && (report.effectiveVisibility === 'hidden' || report.effectiveVisibility === 'restricted') && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-[#fff6df] px-4 py-2.5 text-[11px] text-[#936b16]">
              <span className="flex items-center gap-1.5 font-bold">
                <EyeOff size={13} />
                {report.effectiveVisibility === 'hidden'
                  ? t('detail.hiddenBanner')
                  : t('detail.riskBanner')}
              </span>
              {report.effectiveVisibility === 'hidden' && report.hiddenReason && (
                <span className="text-[10px]">{t('detail.reason', { reason: report.hiddenReason })}</span>
              )}
            </div>
          )}

          {editingTitle && isStaff ? (
            <div className="mt-5 flex items-center gap-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={160}
                className="h-11 flex-1 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-base font-bold outline-none focus:border-[#ef6358]"
              />
              <button onClick={() => void saveTitle()} disabled={busyAction === 'title'} className="rounded-xl bg-[#202f46] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{t('common.save')}</button>
              <button onClick={() => setEditingTitle(false)} className="rounded-xl p-2.5 text-[#98a1ad] hover:bg-[#f1eee7]"><X size={15} /></button>
            </div>
          ) : (
            <div className="mt-4 flex items-start justify-between gap-4">
              <h1 className="font-display text-[clamp(22px,3vw,32px)] font-bold leading-tight tracking-[-.04em] text-[#202f46]">
                {report.title}
              </h1>
              {isStaff && (
                <button onClick={() => setEditingTitle(true)} className="shrink-0 rounded-lg border border-[#e4e0d7] px-2.5 py-1.5 text-[10px] font-bold text-[#6a7584] hover:border-[#ef6358]">
                  {t('detail.editTitle')}
                </button>
              )}
            </div>
          )}

          {isStaff && report.verification === 'verified' && report.verifiedByName && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-[#e9f5eb] px-4 py-2.5 text-[11px] text-[#39824b]">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 size={13} /> {t('reports.verifiedBy', { name: report.verifiedByName })}
              </span>
              {report.verifiedAt && (
                <span className="flex items-center gap-1.5">
                  <Clock size={12} /> {formatDate(report.verifiedAt)}
                </span>
              )}
              <span className="text-[10px] text-[#6aa878]">
                {t('detail.verificationPersists')}
              </span>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">{t('detail.reportedBy')}</span>
              <strong className="mt-1 block truncate text-xs text-[#46546a]">
                {report.ownerName}
                {report.ownerTag && !isCommunity && !report.anonymous && (
                  <span className="ml-1 font-mono text-[10px] text-[#ef6358]">#{report.ownerTag}</span>
                )}
                {report.ownerId === user.id ? t('detail.youSuffix') : ''}
              </strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">{t('detail.category')}</span>
              <strong className="mt-1 block text-xs text-[#46546a]">
                {optionLabel(report.category) ?? report.category}
                {report.subtype !== 'general' ? ` · ${optionLabel(report.subtype) ?? report.subtype}` : ''}
              </strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">{t('detail.game')}</span>
              <strong className="mt-1 block text-xs text-[#46546a]">{game.name}</strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">{t('detail.submitted')}</span>
              <strong className="mt-1 block text-xs text-[#46546a]">{timeAgo(report.createdAt)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          {/* Left column */}
          <div className="space-y-5">
            {/* Details + attachments */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">{t('detail.details')}</h2>
                {isStaff && !editingDetails && (
                  <button onClick={() => setEditingDetails(true)} className="flex items-center gap-1.5 rounded-lg border border-[#e4e0d7] px-2.5 py-1.5 text-[10px] font-bold text-[#6a7584] hover:border-[#ef6358]">
                    <PenLine size={12} /> {t('detail.edit')}
                  </button>
                )}
              </div>
              {editingDetails && isStaff ? (
                <div className="mt-4">
                  <textarea
                    value={editDetails}
                    onChange={(e) => setEditDetails(e.target.value)}
                    rows={10}
                    maxLength={10000}
                    className="w-full resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] p-4 text-sm leading-6 outline-none focus:border-[#ef6358]"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => setEditingDetails(false)} className="rounded-lg px-3 py-2 text-[10px] font-bold text-[#6a7584]">{t('common.cancel')}</button>
                    <button onClick={() => void saveDetails()} disabled={busyAction === 'details'} className="rounded-lg bg-[#202f46] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{t('detail.saveDetails')}</button>
                  </div>
                </div>
              ) : fields.length > 0 ? (
                <dl className="mt-4 divide-y divide-[#f1eee7]">
                  {fields.map(([key, value]) => (
                    <div key={key} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#98a1ad] sm:pt-1">
                        {fieldLabel(report, key)}
                      </dt>
                      <dd className="whitespace-pre-wrap text-[13px] leading-6 text-[#5d6a7c]">
                        {typeof value === 'boolean' ? (value ? t('common.yes') : t('common.no')) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5d6a7c]">{report.details}</p>
              )}
              {report.attachments.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                    <Paperclip size={12} /> {t('detail.attachments', { count: report.attachments.length })}
                  </p>
                  <ul className="space-y-2">
                    {report.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-3 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] px-4 py-3">
                        <Paperclip size={15} className="text-[#8a94a1]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[#455267]">{attachment.fileName}</p>
                          <p className="text-[10px] text-[#98a1ad]">{formatBytes(attachment.size)} · {timeAgo(attachment.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => setPreviewAttachment(attachment)}
                            className="flex items-center gap-1.5 rounded-lg border border-[#d9e6e3] bg-[#f1faf7] px-2.5 py-1.5 text-[10px] font-bold text-[#247c70] hover:border-[#2e9f91]"
                          >
                            <Eye size={12} /> {t('detail.preview')}
                          </button>
                          <button
                            onClick={() => void downloadAttachment(attachment).catch(() => toast.error(t('detail.couldNotDownload')))}
                            className="flex items-center gap-1.5 rounded-lg border border-[#e4e0d7] px-2.5 py-1.5 text-[10px] font-bold text-[#536174] hover:border-[#ef6358] hover:text-[#ef6358]"
                          >
                            <Download size={12} /> {t('detail.download')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Audit log — participants only; the community sees a sanitized
                timeline in the conversation instead. */}
            {!isCommunity && (
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                  <History size={15} className="text-[#2e9f91]" /> {t('detail.auditLog')}
                </h2>
                <span className="font-mono text-[10px] text-[#a0a7af]">{t('detail.appendOnly')}</span>
              </div>
              <div className="relative mt-6 space-y-5 pl-2 before:absolute before:bottom-2 before:left-[10px] before:top-2 before:w-px before:bg-[#e7e3dc]">
                {history.length === 0 && <p className="text-xs text-[#98a1ad]">{t('detail.noActions')}</p>}
                {history.map((item) => (
                  <div key={item.id} className="relative flex gap-4">
                    <span
                      className={`relative z-10 mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-4 border-white ${eventDot(item.action)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="text-xs font-bold text-[#455267]">{auditLabel(item, t)}</p>
                        <span className="font-mono text-[9px] text-[#a7afb8]">{formatDate(item.createdAt)}</span>
                      </div>
                      {auditDetail(item, t) && <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{auditDetail(item, t)}</p>}
                      <p className="mt-0.5 text-[10px] text-[#a7afb8]">
                        {t('detail.audit.by', { name: item.actorName ?? (item.actorRole ? roleLabel(t, item.actorRole) : t('detail.audit.system')) })}
                        {item.actorName && item.actorRole ? ` · ${roleLabel(t, item.actorRole)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Conversation */}
            <section className="flex min-h-[480px] flex-col rounded-2xl border border-[#e6e2d9] bg-white">
              <div className="flex items-center justify-between border-b border-[#eeeae2] px-5 py-4">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                  <MessageSquare size={16} className="text-[#2e9f91]" /> {t('detail.conversation')}
                </h2>
                <span className="font-mono text-[10px] text-[#a0a7af]">
                  {messages.length === 1 ? t('detail.messageCount', { count: 1 }) : t('detail.messageCountPlural', { count: messages.length })}
                  {report.history.length > 0 ? ` · ${report.history.length === 1 ? t('detail.eventCount', { count: 1 }) : t('detail.eventCountPlural', { count: report.history.length })}` : ''}
                </span>
              </div>

              <div ref={scrollRef} className="scrollbar-thin max-h-[560px] flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                {messagesQuery.isLoading && <Spinner label={t('detail.loadingConversation')} />}
                {!messagesQuery.isLoading && timeline.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <MessageSquare size={20} className="text-[#c3c9d1]" />
                    <p className="text-xs text-[#98a1ad]">{t('detail.noActivity')}</p>
                  </div>
                )}
                {timeline.map((entry, index) => {
                  const prev = timeline[index - 1];
                  const showDay = !prev || prev.at.slice(0, 10) !== entry.at.slice(0, 10);
                  const grouped =
                    entry.kind === 'message' &&
                    prev?.kind === 'message' &&
                    prev.message.authorId === entry.message.authorId &&
                    new Date(entry.at).getTime() - new Date(prev.at).getTime() < 3 * 60_000;
                  return (
                    <Fragment key={entry.kind === 'message' ? `m${entry.message.id}` : `e${entry.event.id}`}>
                      {showDay && <DayDivider at={entry.at} />}
                      {entry.kind === 'message' ? (
                        <MessageBubble
                          message={entry.message}
                          mine={entry.message.authorId === user.id}
                          grouped={Boolean(grouped)}
                          onPreview={setPreviewAttachment}
                          onDownload={(att) => void downloadAttachment(att).catch(() => toast.error(t('detail.couldNotDownload')))}
                        />
                      ) : (
                        <SystemEvent event={entry.event} />
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {/* Composer */}
              <div className="border-t border-[#eeeae2] p-4">
                {isCommunity ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#d7d2c8] bg-[#fbfaf7] px-4 py-3 text-[11px] text-[#87909c]">
                    <Eye size={13} className="shrink-0 text-[#98a1ad]" />
                    {t('detail.communityViewing')}
                  </div>
                ) : isStaff ? (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold text-[#6a7584]">
                        <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} className="h-3.5 w-3.5 accent-[#ce9d40]" />
                        {t('detail.internalNote')}
                      </label>
                      <span className="text-[10px] text-[#a0a7af]">
                        {report.allowUserMessages ? t('detail.repliesOpen') : t('detail.repliesLocked')}
                      </span>
                    </div>
                    {chatFiles.length > 0 && <ComposerFiles files={chatFiles} onRemove={removeChatFile} />}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendMessage();
                        }}
                        rows={2}
                        placeholder={internalNote ? t('detail.internalNotePlaceholder') : t('detail.replyPlaceholder')}
                        className="flex-1 resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#ef6358]"
                      />
                      <label
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#e1ded6] bg-[#fbfaf7] text-[#6a7584] transition hover:border-[#2e9f91] hover:text-[#247c70]"
                        title={t('detail.attachFile')}
                      >
                        <Paperclip size={15} />
                        <input type="file" multiple className="hidden" onChange={(e) => { addChatFiles(e.target.files); e.target.value = ''; }} />
                      </label>
                      <button
                        onClick={() => void sendMessage()}
                        disabled={sending}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ef6358] text-white disabled:opacity-50"
                        aria-label={t('detail.sendMessage')}
                      >
                        {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={15} />}
                      </button>
                    </div>
                  </>
                ) : report.allowUserMessages ? (
                  <>
                    {chatFiles.length > 0 && <ComposerFiles files={chatFiles} onRemove={removeChatFile} />}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={messageBody}
                        onChange={(e) => setMessageBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendMessage();
                        }}
                        rows={2}
                        placeholder={t('detail.replyForUserPlaceholder')}
                        className="flex-1 resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#ef6358]"
                      />
                      <label
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#e1ded6] bg-[#fbfaf7] text-[#6a7584] transition hover:border-[#2e9f91] hover:text-[#247c70]"
                        title={t('detail.attachFile')}
                      >
                        <Paperclip size={15} />
                        <input type="file" multiple className="hidden" onChange={(e) => { addChatFiles(e.target.files); e.target.value = ''; }} />
                      </label>
                      <button
                        onClick={() => void sendMessage()}
                        disabled={sending}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ef6358] text-white disabled:opacity-50"
                        aria-label={t('detail.sendMessage')}
                      >
                        {sending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={15} />}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#d7d2c8] bg-[#fbfaf7] px-4 py-3 text-[11px] text-[#87909c]">
                    <Lock size={13} className="shrink-0 text-[#98a1ad]" />
                    {t('detail.repliesDisabled')}
                  </div>
                )}
              </div>
            </section>

            {/* Staff controls */}
            {isStaff && (
              <section className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                  <ShieldCheck size={16} className="text-[#2e9f91]" /> {t('detail.staffControls')}
                </h2>

                {/* Verification */}
                <div className="mt-5 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.verification')}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <VerificationBadge verification={report.verification} />
                        {report.verification === 'verified' && report.verifiedByName && (
                          <span className="text-[10px] text-[#39824b]">{t('detail.audit.by', { name: report.verifiedByName })}</span>
                        )}
                      </div>
                    </div>
                    {report.verification === 'unverified' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void doVerify(true)}
                          disabled={busyAction === 'verify' || Boolean(busyAction)}
                          className="flex items-center gap-1.5 rounded-xl border border-[#dceae6] bg-[#f1faf7] px-3 py-2 text-[11px] font-bold text-[#247c70] transition hover:bg-[#e2f3ee] disabled:opacity-40"
                        >
                          {busyAction === 'verify' ? <SpinnerDot /> : <CheckCircle2 size={13} />} {t('detail.verify')}
                        </button>
                        <button
                          onClick={() => void doVerify(false)}
                          disabled={busyAction === 'reject' || Boolean(busyAction)}
                          className="flex items-center gap-1.5 rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2 text-[11px] font-bold text-[#ca4e44] transition hover:bg-[#ffebe8] disabled:opacity-40"
                        >
                          {busyAction === 'reject' ? <SpinnerDot /> : <X size={13} />} {t('detail.reject')}
                        </button>
                      </div>
                    )}
                    {report.verification === 'verified' && (
                      <span className="text-[10px] font-bold text-[#39824b]">{t('detail.verifiedInAdminStage')}</span>
                    )}
                    {report.verification === 'rejected' && (
                      <button
                        onClick={() => void changeStatus('under_review')}
                        disabled={!canSet('under_review') || Boolean(busyAction)}
                        className="flex items-center gap-1.5 rounded-xl border border-[#e4e0d7] px-3 py-2 text-[11px] font-bold text-[#6a7584] transition hover:border-[#ce9d40] disabled:opacity-40"
                      >
                        <RefreshCw size={13} /> {t('detail.reopenReview')}
                      </button>
                    )}
                  </div>
                  {rejectMode && (
                    <div className="mt-3 rounded-xl border border-[#efc9c4] bg-[#fff5f3] p-3">
                      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#ca4e44]">
                        {t('detail.rejectReason')}
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        placeholder={t('detail.rejectReasonPlaceholder')}
                        className="w-full resize-none rounded-xl border border-[#eac9c4] bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#ca4e44]"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button onClick={() => setRejectMode(false)} className="rounded-lg px-3 py-2 text-[10px] font-bold text-[#6a7584]">{t('common.cancel')}</button>
                        <button onClick={() => void doVerify(false)} disabled={busyAction === 'reject'} className="rounded-lg bg-[#ca4e44] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">
                          {t('detail.rejectClose')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Visibility */}
                <div className="mt-4 rounded-xl border border-[#eeeae2] bg-[#fbfaf7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.visibility')}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <VisibilityBadge visibility={report.effectiveVisibility} />
                        <span className="text-[10px] text-[#98a1ad]">
                          {report.hidden
                            ? t('detail.hiddenOriginal', { value: t(`visibility.${report.visibility}`) })
                            : report.effectiveVisibility === 'restricted'
                              ? t('detail.riskPolicy')
                              : t('detail.originalSetting')}
                        </span>
                      </div>
                    </div>
                    {report.effectiveVisibility === 'hidden' ? (
                      <button
                        onClick={() => void unhideReport()}
                        disabled={Boolean(busyAction)}
                        className="flex items-center gap-1.5 rounded-xl border border-[#dceae6] bg-[#f1faf7] px-3 py-2 text-[11px] font-bold text-[#247c70] transition hover:bg-[#e2f3ee] disabled:opacity-40"
                      >
                        <Eye size={13} /> {t('detail.restoreCommunity')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setHideMode((v) => !v)}
                        disabled={Boolean(busyAction)}
                        className="flex items-center gap-1.5 rounded-xl border border-[#efc9c4] bg-[#fff5f3] px-3 py-2 text-[11px] font-bold text-[#ca4e44] transition hover:bg-[#ffebe8] disabled:opacity-40"
                      >
                        <EyeOff size={13} /> {t('detail.hideCommunity')}
                      </button>
                    )}
                  </div>
                  {hideMode && (
                    <div className="mt-3 rounded-xl border border-[#efc9c4] bg-[#fff5f3] p-3">
                      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#ca4e44]">
                        {t('detail.hideReason')}
                      </label>
                      <textarea
                        value={hideReason}
                        onChange={(e) => setHideReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder={t('detail.hideReasonPlaceholder')}
                        className="w-full resize-none rounded-xl border border-[#eac9c4] bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#ca4e44]"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button onClick={() => setHideMode(false)} className="rounded-lg px-3 py-2 text-[10px] font-bold text-[#6a7584]">{t('common.cancel')}</button>
                        <button onClick={() => void hideReport()} disabled={busyAction === 'hide'} className="rounded-lg bg-[#ca4e44] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">
                          {t('detail.hideReport')}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#6a7584]">{t('detail.originalSetting')}:</span>
                    <button
                      onClick={() => void setReportVisibility('public')}
                      disabled={report.visibility === 'public' || Boolean(busyAction)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition disabled:opacity-40 ${
                        report.visibility === 'public' ? 'border-[#2e9f91] bg-[#e8f6f3] text-[#247c70]' : 'border-[#e4e0d7] bg-white text-[#6a7584] hover:border-[#2e9f91]'
                      }`}
                    >
                      {t('visibility.public')}
                    </button>
                    <button
                      onClick={() => void setReportVisibility('private')}
                      disabled={report.visibility === 'private' || Boolean(busyAction)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition disabled:opacity-40 ${
                        report.visibility === 'private' ? 'border-[#7468b6] bg-[#f2f0fb] text-[#5b50a8]' : 'border-[#e4e0d7] bg-white text-[#6a7584] hover:border-[#7468b6]'
                      }`}
                    >
                      {t('visibility.private')}
                    </button>
                  </div>
                </div>

                {/* Ticket status */}
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.ticketStatus')}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STATUS_GROUPS.map((group) => (
                      <div key={group.key} className="rounded-lg border border-[#eeeae2] bg-[#fbfaf7] p-2">
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#a0a7af]">{t(group.labelKey)}</p>
                        <div className="flex flex-col gap-1.5">
                          {group.statuses.map((s) => {
                            const active = current === s;
                            const allowed = canSet(s);
                            return (
                              <button
                                key={s}
                                onClick={() => void changeStatus(s)}
                                disabled={!allowed || Boolean(busyAction)}
                                title={!allowed && !active ? (user?.role === 'administrator' ? t('detail.notAvailableRole') : t('detail.notAvailableTicket')) : undefined}
                                className={`rounded-lg border px-2 py-1.5 text-left text-[10px] font-bold transition ${
                                  active
                                    ? 'border-[#202f46] bg-[#202f46] text-white'
                                    : allowed
                                      ? 'border-[#e4e0d7] bg-white text-[#6a7584] hover:border-[#ef6358]'
                                      : 'cursor-not-allowed border-[#f1eee7] bg-[#faf8f3] text-[#c0c6ce]'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#fff' : STATUSES[s]?.dot ?? '#c0c6ce' }} />
                                  {t(`status.${s}`)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {archived && (
                    <p className="mt-2 text-[10px] text-[#98a1ad]">
                      {t('detail.archivedNote')}
                    </p>
                  )}
                </div>

                {/* Conversation controls */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.reporterReplies')}</p>
                    <button
                      onClick={() => void toggleReplies(!report.allowUserMessages)}
                      disabled={Boolean(busyAction)}
                      className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition disabled:opacity-50 ${
                        report.allowUserMessages ? 'border-[#2e9f91] bg-[#e8f6f3] text-[#247c70]' : 'border-[#e4e0d7] text-[#6a7584]'
                      }`}
                    >
                      {report.allowUserMessages ? <><Check size={13} /> {t('detail.enabledLock')}</> : <><Lock size={13} /> {t('detail.disabledOpen')}</>}
                    </button>
                    <p className="mt-1 text-[9px] leading-4 text-[#a0a7af]">
                      {t('detail.openingReplies')}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">{t('detail.priority')}</p>
                    <select
                      value={editPriority}
                      onChange={(e) => {
                        setEditPriority(e.target.value);
                        void savePriority();
                      }}
                      className="h-10 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold outline-none focus:border-[#ef6358]"
                    >
                      {Object.entries(PRIORITIES).map(([value, p]) => (
                        <option key={value} value={value}>{t(`priority.${value}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#f1eee7] bg-[#fbfaf7] p-3 text-[10px] leading-5 text-[#98a1ad]">
                  <strong className="text-[#687385]">{t('detail.workflow')}</strong>{' '}
                  {user?.role === 'moderator'
                    ? t('detail.workflowModerator')
                    : t('detail.workflowAdmin')}
                </div>
              </section>
            )}

            {/* Owner hint */}
            {isOwner && (
              <section className="rounded-2xl border border-[#dceae6] bg-[#f1faf7] p-5 text-xs leading-6 text-[#518b83]">
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#398277]">{t('detail.yourAccess')}</p>
                <p className="mt-2">
                  {t('detail.ownerHint')}
                  {report.effectiveVisibility === 'public' && !report.hidden && (
                    <span className="mt-2 block">
                      {t('detail.ownerPublic')}
                    </span>
                  )}
                </p>
              </section>
            )}

            {/* Community viewer note */}
            {isCommunity && (
              <section className="rounded-2xl border border-[#eeeae2] bg-white p-5 text-xs leading-6 text-[#87909c]">
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#a0a7af]">{t('detail.communityView')}</p>
                <p className="mt-2">
                  {t('detail.communityNote')}
                </p>
              </section>
            )}
          </div>
        </div>
      </PageEnter>

      {previewAttachment && (
        <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Conversation pieces
// ---------------------------------------------------------------------------

function DayDivider({ at }: { at: string }) {
  const { t } = useI18n();
  const date = new Date(at);
  const label = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const isToday = new Date().toDateString() === date.toDateString();
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[#eeeae2]" />
      <span className="font-mono text-[9px] uppercase tracking-[.15em] text-[#a7afb8]">
        {isToday ? t('detail.today') : label}
      </span>
      <span className="h-px flex-1 bg-[#eeeae2]" />
    </div>
  );
}

function roleLabel(t: (key: string, vars?: Record<string, string | number>) => string, role: string): string {
  if (role === 'user') return t('detail.roleReporter');
  return t(`roles.${role}`);
}

function MessageBubble({
  message,
  mine,
  grouped,
  onPreview,
  onDownload,
}: {
  message: Message;
  mine: boolean;
  grouped: boolean;
  onPreview: (att: Attachment) => void;
  onDownload: (att: Attachment) => void;
}) {
  const { t } = useI18n();
  const isNote = message.isInternal;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}>
      {!mine && !grouped && <Avatar name={message.authorName} size="sm" />}
      <div className={`${mine ? '' : 'ml-2'} max-w-[85%]`}>
        {!mine && !grouped && (
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[10px] font-bold text-[#536174]">{message.authorName}</span>
            {message.authorRole && message.authorRole !== 'user' && (
              <span className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                message.authorRole === 'administrator' ? 'bg-[#f2f0fb] text-[#5b50a8]' : 'bg-[#e8f6f3] text-[#247c70]'
              }`}>
                {roleLabel(t, message.authorRole)}
              </span>
            )}
            {message.authorRole === 'user' && (
              <span className="text-[9px] text-[#a0a7af]">{t('detail.roleReporter')}</span>
            )}
          </div>
        )}
        <div className={`rounded-2xl border px-4 py-3 ${
          mine
            ? 'border-[#202f46] bg-[#202f46] text-white'
            : isNote
              ? 'border-dashed border-[#ce9d40] bg-[#fffbf0]'
              : 'border-[#e6e2d9] bg-[#fbfaf7]'
        }`}>
          {isNote && (
            <span className="mb-1.5 inline-block rounded bg-[#fff6df] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#936b16]">
              {t('detail.staffNote')}
            </span>
          )}
          <p className={`whitespace-pre-wrap text-[12px] leading-5 ${mine ? 'text-[#f0f2f5]' : 'text-[#46546a]'}`}>
            {message.body}
          </p>
          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => onPreview(att)}
                  className={`flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-bold transition ${
                    mine
                      ? 'border-white/20 bg-white/10 text-[#d9e1e9] hover:bg-white/20'
                      : 'border-[#e4e0d7] bg-white text-[#536174] hover:border-[#2e9f91] hover:text-[#247c70]'
                  }`}
                >
                  <Paperclip size={10} className="shrink-0" />
                  <span className="truncate">{att.fileName}</span>
                </button>
              ))}
            </div>
          )}
          <p className={`mt-1.5 font-mono text-[9px] ${mine ? 'text-[#9fb0c4]' : 'text-[#b0b7c0]'}`}>{formatDate(message.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

function SystemEvent({ event }: { event: HistoryItem }) {
  const { t } = useI18n();
  const icon = eventIcon(event.action);
  return (
    <div className="flex justify-center">
      <div className="flex max-w-[92%] items-center gap-2 rounded-full border border-[#eeeae2] bg-[#f7f5f0] px-3.5 py-2">
        <span className={`flex h-4 w-4 items-center justify-center rounded-full ${eventDot(event.action)} text-white`}>
          {icon}
        </span>
        <p className="text-[10px] font-semibold leading-4 text-[#6a7584]">
          {auditLabel(event, t)}
        </p>
        <span className="font-mono text-[9px] text-[#b0b7c0]">{formatDate(event.createdAt)}</span>
      </div>
    </div>
  );
}

function SpinnerDot() {
  return <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#c9d5d1] border-t-[#247c70]" />;
}

// ---------------------------------------------------------------------------
// Audit log labels
// ---------------------------------------------------------------------------

const STATUS_GROUPS = [
  { key: 'review', labelKey: 'detail.groupReview', statuses: ['open', 'under_review'] },
  { key: 'handling', labelKey: 'detail.groupHandling', statuses: ['awaiting_admin', 'in_progress', 'waiting_for_user'] },
  { key: 'done', labelKey: 'detail.groupDone', statuses: ['resolved', 'closed'] },
];

function eventDot(action: string): string {
  const map: Record<string, string> = {
    rejected: 'bg-[#ca4e44]',
    verified: 'bg-[#2e9f91]',
    resolved: 'bg-[#2e9f91]',
    closed: 'bg-[#687385]',
    reopened: 'bg-[#ce9d40]',
    status_changed: 'bg-[#7468b6]',
    verification_changed: 'bg-[#7468b6]',
    submitted: 'bg-[#ef6358]',
    reply_enabled: 'bg-[#2e9f91]',
    reply_disabled: 'bg-[#98a1ad]',
    title_changed: 'bg-[#ce9d40]',
    priority_changed: 'bg-[#ce9d40]',
    details_edited: 'bg-[#ce9d40]',
    attachment_added: 'bg-[#7468b6]',
    visibility_changed: 'bg-[#7468b6]',
    hidden: 'bg-[#ca4e44]',
    unhidden: 'bg-[#2e9f91]',
  };
  return map[action] ?? 'bg-[#98a1ad]';
}

function eventIcon(action: string) {
  switch (action) {
    case 'verified':
    case 'resolved':
      return <Check size={9} />;
    case 'rejected':
    case 'closed':
      return <X size={9} />;
    case 'reopened':
      return <RefreshCw size={8} />;
    case 'status_changed':
    case 'verification_changed':
      return <ArrowRightLeft size={8} />;
    case 'submitted':
      return <Inbox size={8} />;
    case 'reply_enabled':
    case 'reply_disabled':
      return <MessageSquare size={8} />;
    case 'title_changed':
    case 'priority_changed':
    case 'details_edited':
      return <FileEdit size={8} />;
    case 'visibility_changed':
    case 'hidden':
      return <EyeOff size={8} />;
    case 'unhidden':
      return <Eye size={8} />;
    default:
      return <UserRound size={8} />;
  }
}

function statusLabel(value: string | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (!value) return '';
  return t(`status.${value}`);
}

function verificationLabel(value: string | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (!value) return '';
  return t(`verification.${value}`);
}

function auditLabel(item: HistoryItem, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (item.action) {
    case 'submitted':
      return t('detail.audit.submitted');
    case 'verified':
      return t('detail.audit.verified');
    case 'rejected':
      return t('detail.audit.rejected');
    case 'status_changed':
      return `${t('detail.audit.statusChanged')}${item.fromStatus && item.toStatus ? `: ${statusLabel(item.fromStatus, t)} → ${statusLabel(item.toStatus, t)}` : ''}`;
    case 'verification_changed':
      return `${t('detail.audit.verificationChanged')}: ${verificationLabel(item.fromVerification, t) || '—'} → ${verificationLabel(item.toVerification, t) || '—'}`;
    case 'reopened':
      return t('detail.audit.reopened');
    case 'reply_enabled':
      return t('detail.audit.replyEnabled');
    case 'reply_disabled':
      return t('detail.audit.replyDisabled');
    case 'title_changed':
      return t('detail.audit.titleChanged');
    case 'priority_changed':
      return t('detail.audit.priorityChanged');
    case 'details_edited':
      return t('detail.audit.detailsEdited');
    case 'attachment_added':
      return t('detail.audit.attachmentAdded');
    case 'visibility_changed':
      return `${t('detail.audit.visibilityChanged')}${item.fromValue && item.toValue ? `: ${visibilityLabel(item.fromValue, t)} → ${visibilityLabel(item.toValue, t)}` : ''}`;
    case 'hidden':
      return t('detail.audit.hidden');
    case 'unhidden':
      return t('detail.audit.unhidden');
    default:
      return item.action.replaceAll('_', ' ');
  }
}

function auditDetail(item: HistoryItem, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  switch (item.action) {
    case 'verified':
    case 'rejected':
      return item.details ?? null;
    case 'title_changed':
      return item.fromValue && item.toValue
        ? `“${item.fromValue}” → “${item.toValue}”`
        : null;
    case 'priority_changed':
      return item.fromValue && item.toValue
        ? `${priorityLabel(item.fromValue, t)} → ${priorityLabel(item.toValue, t)}`
        : null;
    case 'status_changed':
      return item.fromStatus && item.toStatus
        ? `${statusLabel(item.fromStatus, t)} → ${statusLabel(item.toStatus, t)}`
        : null;
    case 'verification_changed':
      return item.fromVerification && item.toVerification
        ? `${verificationLabel(item.fromVerification, t)} → ${verificationLabel(item.toVerification, t)}`
        : null;
    case 'visibility_changed':
      return item.fromValue && item.toValue
        ? `${visibilityLabel(item.fromValue, t)} → ${visibilityLabel(item.toValue, t)}`
        : null;
    default:
      return item.details ?? null;
  }
}

function visibilityLabel(value: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t(`visibility.${value}`);
}

function priorityLabel(value: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t(`priority.${value}`);
}

/** Resolves a stored field key back to its catalog label. */
function fieldLabel(report: ReportDetail, key: string): string {
  // The ticket's own option/subcategory tell us which catalog to search.
  const option = findOption(report.category);
  const sub = BUG_SUBCATEGORIES.find((s) => s.id === report.subtype);
  const haystack = [...(option?.fields ?? []), ...(sub?.fields ?? [])];
  return haystack.find((f) => f.key === key)?.label ?? key.replaceAll('_', ' ');
}

function ComposerFiles({
  files,
  onRemove,
}: {
  files: ChatFile[];
  onRemove: (localId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="mb-2 space-y-1.5">
      {files.map((f) => (
        <li key={f.localId} className="flex items-center gap-2 rounded-lg border border-[#eeeae2] bg-[#fbfaf7] px-2.5 py-1.5">
          <Paperclip size={11} className="shrink-0 text-[#8a94a1]" />
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#455267]">{f.file.name}</span>
          {f.status === 'uploading' && <span className="text-[9px] font-bold text-[#ce9d40]">{t('detail.uploading')}</span>}
          {f.status === 'ready' && <CheckCircle2 size={12} className="shrink-0 text-[#39824b]" />}
          {f.status === 'error' && (
            <span className="max-w-[140px] truncate text-[9px] font-bold text-[#ca4e44]">{f.error ?? t('detail.failed')}</span>
          )}
          <button
            onClick={() => onRemove(f.localId)}
            className="rounded p-0.5 text-[#98a1ad] transition hover:text-[#ca4e44]"
            aria-label={t('detail.removeFile', { name: f.file.name })}
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
