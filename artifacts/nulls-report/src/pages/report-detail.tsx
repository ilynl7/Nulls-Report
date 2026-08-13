import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useAuth } from '@clerk/react';
import {
  getGetReportQueryKey,
  getListReportMessagesQueryKey,
  useCreateReportMessage,
  useForwardReport,
  useGetReport,
  useListReportMessages,
  useRequestUploadUrl,
  useSetReportReplyPermission,
  useUpdateReport,
  useVerifyReport,
} from '@workspace/api-client-react';
import type { Attachment, CreateMessageInput, UpdateReportInput } from '@workspace/api-client-react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Trash2,
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
} from '@/components/portal-ui';
import { AttachmentPreview } from '@/components/attachment-preview';
import { useNotifications, usePortalUser } from '@/lib/hooks';
import { apiErrorMessage, API_KEYS, downloadAttachment, messagesKey, queryClient, reportKey } from '@/lib/api';
import { CATEGORIES, MAX_UPLOAD_BYTES, PRIORITIES, STATUSES, gameById } from '@/lib/catalog';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';

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

export function ReportDetailPage() {
  const [, params] = useRoute('/reports/:id');
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const { user, isLoading: userLoading } = usePortalUser();
  const { unread } = useNotifications();
  const { getToken } = useAuth();

  const queryEnabled = !userLoading && !!user && Number.isFinite(id);
  const reportQuery = useGetReport(id, { query: { queryKey: getGetReportQueryKey(id), enabled: queryEnabled } });
  const messagesQuery = useListReportMessages(id, {
    query: { queryKey: getListReportMessagesQueryKey(id), enabled: queryEnabled },
  });

  const updateReport = useUpdateReport({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const verifyReport = useVerifyReport({
    mutation: { onSuccess: () => invalidateTicket(id) },
  });
  const forwardReport = useForwardReport({
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const report = reportQuery.data;
  const messages = messagesQuery.data ?? [];
  const isStaff = !!user && user.role !== 'user';
  const canUserReply = !!report && !isStaff && report.allowUserMessages;

  useEffect(() => {
    if (report && !editingTitle) {
      setEditTitle(report.title);
      setEditPriority(report.priority);
    }
  }, [report?.id, report?.title, report?.priority, editingTitle]);

  if (!Number.isFinite(id)) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState title="Invalid ticket" detail="That ticket ID is not valid." onRetry={() => navigate('/my-reports')} />
      </AppShell>
    );
  }

  if (userLoading || !user) {
    return (
      <AppShell user={null} unread={0} inboxCount={0}>
        <Spinner label="Loading ticket…" />
      </AppShell>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <Spinner label="Loading ticket…" />
      </AppShell>
    );
  }

  if (reportQuery.error || !report) {
    return (
      <AppShell user={user} unread={unread} inboxCount={0}>
        <ErrorState
          title="Ticket unavailable"
          detail={apiErrorMessage(reportQuery.error)}
          onRetry={() => reportQuery.refetch()}
        />
      </AppShell>
    );
  }

  const uploadChatFile = async (entry: ChatFile) => {
    setChatFiles((prev) => prev.map((f) => (f.localId === entry.localId ? { ...f, status: 'uploading' } : f)));
    try {
      const token = await getToken();
      const res = await requestUpload.mutateAsync({
        data: { name: entry.file.name, size: entry.file.size, contentType: entry.file.type || 'application/octet-stream' },
      });
      const put = await fetch(res.uploadURL, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': entry.file.type || 'application/octet-stream',
        },
        body: entry.file,
      });
      if (!put.ok) throw new Error('Upload failed');
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
        toast.error(`${file.name} exceeds the 50 MB limit`);
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
    const body = messageBody.trim();
    if (!body && chatFiles.length === 0) return;
    if (chatFiles.some((f) => f.status === 'uploading')) {
      toast.error('Wait for attachments to finish uploading');
      return;
    }
    try {
      const ready = chatFiles.filter((f) => f.status === 'ready');
      const payload: CreateMessageInput = { body };
      if (ready.length > 0) {
        payload.attachmentIds = ready.map((f) => f.attachmentId as number);
      }
      await createMessage.mutateAsync({ id, data: payload });
      setMessageBody('');
      setInternalNote(false);
      setChatFiles([]);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const changeStatus = async (status: string) => {
    try {
      await updateReport.mutateAsync({ id, data: { status: status as UpdateReportInput['status'] } });
      toast.success(`Status set to ${STATUSES[status]?.label ?? status}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const saveTitle = async () => {
    try {
      await updateReport.mutateAsync({ id, data: { title: editTitle.trim() } });
      setEditingTitle(false);
      toast.success('Title updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const savePriority = async () => {
    try {
      await updateReport.mutateAsync({ id, data: { priority: editPriority as UpdateReportInput['priority'] } });
      toast.success('Priority updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const doVerify = async (verified: boolean) => {
    try {
      if (!verified && rejectMode) {
        await verifyReport.mutateAsync({ id, data: { verified: false, reason: rejectReason.trim() || undefined } });
        setRejectMode(false);
        setRejectReason('');
      } else if (!verified) {
        setRejectMode(true);
        return;
      } else {
        await verifyReport.mutateAsync({ id, data: { verified: true } });
      }
      toast.success(verified ? 'Ticket verified' : 'Ticket rejected');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const doForward = async () => {
    try {
      await forwardReport.mutateAsync({ id });
      toast.success('Ticket forwarded to administrators');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const toggleReplies = async (enabled: boolean) => {
    try {
      await setReplyPermission.mutateAsync({ id, data: { enabled } });
      toast.success(enabled ? 'Reporter replies enabled' : 'Reporter replies disabled');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const history = report.history;
  const category = CATEGORIES[report.category];
  const game = gameById(report.game);

  return (
    <AppShell user={user} unread={unread} inboxCount={0}>
      <PageEnter>
        <Link href={isStaff ? '/inbox' : '/my-reports'} className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-[#6e7887] hover:text-[#ef6358]">
          <ArrowLeft size={14} /> {isStaff ? 'Back to inbox' : 'Back to my reports'}
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-[#e6e2d9] bg-white p-6 shadow-[0_3px_10px_rgba(35,53,68,.025)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] font-medium text-[#89929f]">{report.ticketNumber}</span>
            <StatusBadge status={report.status} />
            <GameBadge game={report.game} />
            {report.priority !== 'normal' && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#ca4e44]">
                <Flag size={12} fill="currentColor" /> {PRIORITIES[report.priority]?.label ?? report.priority}
              </span>
            )}
            {report.allowUserMessages && (
              <span className="rounded-md bg-[#fff6df] px-2 py-1 text-[10px] font-bold text-[#936b16]">Reply open for you</span>
            )}
          </div>

          {editingTitle && isStaff ? (
            <div className="mt-5 flex items-center gap-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={160}
                className="h-11 flex-1 rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-4 text-base font-bold outline-none focus:border-[#ef6358]"
              />
              <button onClick={() => void saveTitle()} className="rounded-xl bg-[#202f46] px-4 py-2.5 text-xs font-bold text-white">Save</button>
              <button onClick={() => setEditingTitle(false)} className="rounded-xl p-2.5 text-[#98a1ad] hover:bg-[#f1eee7]"><X size={15} /></button>
            </div>
          ) : (
            <div className="mt-4 flex items-start justify-between gap-4">
              <h1 className="font-display text-[clamp(22px,3vw,32px)] font-bold leading-tight tracking-[-.04em] text-[#202f46]">
                {report.title}
              </h1>
              {isStaff && (
                <button onClick={() => setEditingTitle(true)} className="shrink-0 rounded-lg border border-[#e4e0d7] px-2.5 py-1.5 text-[10px] font-bold text-[#6a7584] hover:border-[#ef6358]">
                  Edit title
                </button>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">Reporter</span>
              <strong className="mt-1 block truncate text-xs text-[#46546a]">
                {report.ownerName}{report.ownerId === user.id ? ' (you)' : ''}
              </strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">Category</span>
              <strong className="mt-1 block text-xs text-[#46546a]">{category?.label ?? report.category} · {report.subtype}</strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">Game</span>
              <strong className="mt-1 block text-xs text-[#46546a]">{game.name}</strong>
            </div>
            <div className="rounded-xl bg-[#f7f5f0] p-3">
              <span className="block text-[10px] uppercase tracking-wider text-[#9ba3ad]">Submitted</span>
              <strong className="mt-1 block text-xs text-[#46546a]">{timeAgo(report.createdAt)}</strong>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          {/* Left column */}
          <div className="space-y-5">
            {/* Details + attachments */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">Report details</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5d6a7c]">{report.details}</p>
              {report.attachments.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">
                    <Paperclip size={12} /> Attachments ({report.attachments.length})
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
                            <Eye size={12} /> Preview
                          </button>
                          <button
                            onClick={() => void downloadAttachment(attachment).catch(() => toast.error('Could not download attachment'))}
                            className="flex items-center gap-1.5 rounded-lg border border-[#e4e0d7] px-2.5 py-1.5 text-[10px] font-bold text-[#536174] hover:border-[#ef6358] hover:text-[#ef6358]"
                          >
                            <Download size={12} /> Download
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* History */}
            <section className="rounded-2xl border border-[#e6e2d9] bg-white p-6">
              <h2 className="font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">Ticket history</h2>
              <div className="relative mt-6 space-y-6 pl-2 before:absolute before:bottom-2 before:left-[10px] before:top-2 before:w-px before:bg-[#e7e3dc]">
                {history.length === 0 && <p className="text-xs text-[#98a1ad]">No recorded actions yet.</p>}
                {history.map((item) => (
                  <div key={item.id} className="relative flex gap-4">
                    <span
                      className={`relative z-10 mt-0.5 h-[18px] w-[18px] rounded-full border-4 border-white ${
                        item.action === 'rejected' ? 'bg-[#ca4e44]' : item.action === 'verified' || item.action === 'resolved' ? 'bg-[#2e9f91]' : item.action === 'forwarded' ? 'bg-[#7468b6]' : 'bg-[#ce9d40]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-[#455267]">
                          {historyActionLabel(item.action)}
                        </p>
                        <span className="font-mono text-[10px] text-[#a7afb8]">{formatDate(item.createdAt)}</span>
                      </div>
                      {item.details && <p className="mt-1 text-[11px] leading-5 text-[#87909c]">{item.details}</p>}
                      {item.actorName && <p className="mt-0.5 text-[10px] text-[#a7afb8]">by {item.actorName}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Conversation */}
            <section className="flex min-h-[420px] flex-col rounded-2xl border border-[#e6e2d9] bg-white">
              <div className="flex items-center justify-between border-b border-[#eeeae2] px-5 py-4">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                  <MessageSquare size={16} className="text-[#2e9f91]" /> Conversation
                </h2>
                <span className="font-mono text-[10px] text-[#a0a7af]">{messages.length} message{messages.length === 1 ? '' : 's'}</span>
              </div>

              <div className="scrollbar-thin max-h-[460px] flex-1 space-y-4 overflow-y-auto p-5">
                {messagesQuery.isLoading && <Spinner label="Loading conversation…" />}
                {!messagesQuery.isLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <MessageSquare size={20} className="text-[#c3c9d1]" />
                    <p className="text-xs text-[#98a1ad]">No messages yet. Staff replies will appear here.</p>
                  </div>
                )}
                {messages.map((message) => {
                  const mine = message.authorId === user.id;
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${mine ? 'border-[#202f46] bg-[#202f46] text-white' : message.isInternal ? 'border-dashed border-[#ce9d40] bg-[#fffbf0]' : 'border-[#e6e2d9] bg-[#fbfaf7]'}`}>
                        <div className="mb-1 flex items-center gap-2">
                          {!mine && <Avatar name={message.authorName} size="sm" />}
                          <span className={`text-[10px] font-bold ${mine ? 'text-[#d9e1e9]' : 'text-[#536174]'}`}>
                            {message.authorName}
                            {message.isInternal && <span className="ml-1.5 rounded bg-[#fff6df] px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#936b16]">Staff note</span>}
                          </span>
                        </div>
                        <p className={`whitespace-pre-wrap text-[12px] leading-5 ${mine ? 'text-[#f0f2f5]' : 'text-[#46546a]'}`}>{message.body}</p>
                        {message.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {message.attachments.map((att) => (
                              <button
                                key={att.id}
                                onClick={() => setPreviewAttachment(att)}
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
                  );
                })}
              </div>

              {/* Composer */}
              <div className="border-t border-[#eeeae2] p-4">
                {isStaff ? (
                  <>
                    <div className="mb-2 flex items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold text-[#6a7584]">
                        <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} className="h-3.5 w-3.5 accent-[#ce9d40]" />
                        Internal note (staff only)
                      </label>
                      <span className="text-[10px] text-[#a0a7af]">User replies {report.allowUserMessages ? 'are open' : 'are locked'}</span>
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
                        placeholder={internalNote ? 'Internal note — visible to staff only' : 'Reply to the reporter…'}
                        className="flex-1 resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#ef6358]"
                      />
                      <label
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#e1ded6] bg-[#fbfaf7] text-[#6a7584] transition hover:border-[#2e9f91] hover:text-[#247c70]"
                        title="Attach a file"
                      >
                        <Paperclip size={15} />
                        <input type="file" multiple className="hidden" onChange={(e) => { addChatFiles(e.target.files); e.target.value = ''; }} />
                      </label>
                      <button onClick={() => void sendMessage()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ef6358] text-white" aria-label="Send message">
                        <Send size={15} />
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
                        placeholder="Staff asked for more details — reply here…"
                        className="flex-1 resize-none rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#ef6358]"
                      />
                      <label
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#e1ded6] bg-[#fbfaf7] text-[#6a7584] transition hover:border-[#2e9f91] hover:text-[#247c70]"
                        title="Attach a file"
                      >
                        <Paperclip size={15} />
                        <input type="file" multiple className="hidden" onChange={(e) => { addChatFiles(e.target.files); e.target.value = ''; }} />
                      </label>
                      <button onClick={() => void sendMessage()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ef6358] text-white" aria-label="Send message">
                        <Send size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#d7d2c8] bg-[#fbfaf7] px-4 py-3 text-[11px] text-[#87909c]">
                    <Lock size={13} className="shrink-0 text-[#98a1ad]" />
                    Replies are disabled on this ticket. Staff will open the conversation if they need more information from you.
                  </div>
                )}
              </div>
            </section>

            {/* Staff panel */}
            {isStaff && (
              <section className="rounded-2xl border border-[#e6e2d9] bg-white p-5">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-bold tracking-[-.02em] text-[#253044]">
                  <ShieldCheck size={16} className="text-[#2e9f91]" /> Staff controls
                </h2>

                <div className="mt-4">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(STATUSES).map((s) => (
                      <button
                        key={s.value}
                        onClick={() => void changeStatus(s.value)}
                        disabled={report.status === s.value}
                        className={`rounded-lg border px-2.5 py-2 text-[10px] font-bold transition ${
                          report.status === s.value
                            ? 'border-[#202f46] bg-[#202f46] text-white'
                            : 'border-[#e4e0d7] text-[#6a7584] hover:border-[#ef6358]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => {
                        setEditPriority(e.target.value);
                        void savePriority();
                      }}
                      className="h-10 w-full rounded-xl border border-[#e1ded6] bg-[#fbfaf7] px-3 text-xs font-bold outline-none focus:border-[#ef6358]"
                    >
                      {Object.entries(PRIORITIES).map(([value, p]) => (
                        <option key={value} value={value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#8e98a5]">Reporter replies</label>
                    <button
                      onClick={() => void toggleReplies(!report.allowUserMessages)}
                      className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
                        report.allowUserMessages ? 'border-[#2e9f91] bg-[#e8f6f3] text-[#247c70]' : 'border-[#e4e0d7] text-[#6a7584]'
                      }`}
                    >
                      {report.allowUserMessages ? <><Check size={13} /> Enabled — click to lock</> : <><Lock size={13} /> Disabled — click to open</>}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => void doVerify(true)}
                    disabled={report.status === 'verified' || report.status === 'forwarded' || ['rejected', 'resolved', 'closed'].includes(report.status)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#dceae6] bg-[#f1faf7] py-2.5 text-[11px] font-bold text-[#247c70] transition hover:bg-[#e2f3ee] disabled:opacity-40"
                  >
                    <CheckCircle2 size={13} /> Verify
                  </button>
                  <button
                    onClick={() => void doVerify(false)}
                    disabled={['rejected', 'resolved', 'closed'].includes(report.status)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#efc9c4] bg-[#fff5f3] py-2.5 text-[11px] font-bold text-[#ca4e44] transition hover:bg-[#ffebE8] disabled:opacity-40"
                  >
                    <X size={13} /> Reject
                  </button>
                  <button
                    onClick={() => void doForward()}
                    disabled={report.status !== 'verified'}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[#202f46] py-2.5 text-[11px] font-bold text-white transition hover:bg-[#2c3b53] disabled:opacity-40"
                  >
                    <ArrowLeft size={13} className="rotate-180" /> Forward to admin
                  </button>
                </div>

                {rejectMode && (
                  <div className="mt-4 rounded-xl border border-[#efc9c4] bg-[#fff5f3] p-3">
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#ca4e44]">
                      Reason for rejecting (visible to the reporter)
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Why couldn't this report be verified?"
                      className="w-full resize-none rounded-xl border border-[#eac9c4] bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-[#ca4e44]"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setRejectMode(false)} className="rounded-lg px-3 py-2 text-[10px] font-bold text-[#6a7584]">Cancel</button>
                      <button onClick={() => void doVerify(false)} className="rounded-lg bg-[#ca4e44] px-3 py-2 text-[10px] font-bold text-white">Reject ticket</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Owner hint */}
            {!isStaff && (
              <section className="rounded-2xl border border-[#dceae6] bg-[#f1faf7] p-5 text-xs leading-6 text-[#518b83]">
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#398277]">Your access</p>
                <p className="mt-2">
                  You can view this ticket and its history. You can't edit it or change its status —
                  staff manage the ticket. Replies stay disabled until staff open them.
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

function ComposerFiles({
  files,
  onRemove,
}: {
  files: ChatFile[];
  onRemove: (localId: string) => void;
}) {
  return (
    <ul className="mb-2 space-y-1.5">
      {files.map((f) => (
        <li key={f.localId} className="flex items-center gap-2 rounded-lg border border-[#eeeae2] bg-[#fbfaf7] px-2.5 py-1.5">
          <Paperclip size={11} className="shrink-0 text-[#8a94a1]" />
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#455267]">{f.file.name}</span>
          {f.status === 'uploading' && <span className="text-[9px] font-bold text-[#ce9d40]">Uploading…</span>}
          {f.status === 'ready' && <CheckCircle2 size={12} className="shrink-0 text-[#39824b]" />}
          {f.status === 'error' && (
            <span className="max-w-[140px] truncate text-[9px] font-bold text-[#ca4e44]">{f.error ?? 'Failed'}</span>
          )}
          <button
            onClick={() => onRemove(f.localId)}
            className="rounded p-0.5 text-[#98a1ad] transition hover:text-[#ca4e44]"
            aria-label={`Remove ${f.file.name}`}
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function historyActionLabel(action: string): string {
  const labels: Record<string, string> = {
    submitted: 'Report submitted',
    status_changed: 'Status updated',
    verified: 'Ticket verified',
    rejected: 'Ticket rejected',
    forwarded: 'Forwarded to administrators',
    reply_enabled: 'Replies opened for reporter',
    reply_disabled: 'Replies closed for reporter',
  };
  return labels[action] ?? action.replaceAll('_', ' ');
}
