import { useEffect, useState } from 'react';
import type { Attachment } from '@workspace/api-client-react';
import { Download, Eye, FileText, X } from 'lucide-react';
import { apiErrorMessage, downloadAttachment, fetchAttachmentBlob } from '@/lib/api';
import { formatBytes } from '@/lib/format';

function previewKind(contentType: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('text/')) return 'text';
  return 'none';
}

export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setBlob(null);
    setUrl(null);
    setText('');
    setError('');
    void fetchAttachmentBlob(attachment)
      .then(async (data) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setBlob(data);
        setUrl(objectUrl);
        if (previewKind(attachment.contentType) === 'text') {
          const body = await data.text();
          if (!cancelled) setText(body);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kind = previewKind(attachment.contentType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101a2b]/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.fileName}`}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#eeeae2] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1eee7] text-[#536174]">
              <Eye size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-[#2d394b]">{attachment.fileName}</p>
              <p className="text-[10px] text-[#98a1ad]">{formatBytes(attachment.size)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void downloadAttachment(attachment).catch(() => undefined)}
              className="flex items-center gap-1.5 rounded-lg bg-[#202f46] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#2c3b53]"
            >
              <Download size={12} /> Download
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[#8a94a1] hover:bg-[#f1eee7] hover:text-[#2d394b]"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-auto bg-[#f4f2ec] p-5">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText size={26} className="text-[#c3c9d1]" />
              <p className="text-xs font-semibold text-[#ca4e44]">{error}</p>
              <button
                onClick={() => void downloadAttachment(attachment).catch(() => undefined)}
                className="rounded-lg border border-[#e4e0d7] bg-white px-3 py-2 text-[10px] font-bold text-[#536174]"
              >
                Download instead
              </button>
            </div>
          ) : !blob || !url ? (
            <div className="flex items-center justify-center py-24">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#e2ded5] border-t-[#ef6358]" />
            </div>
          ) : kind === 'image' ? (
            <img src={url} alt={attachment.fileName} className="mx-auto max-h-[65dvh] rounded-xl object-contain" />
          ) : kind === 'video' ? (
            <video src={url} controls autoPlay className="mx-auto max-h-[65dvh] rounded-xl" />
          ) : kind === 'audio' ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-[#e6e2d9] bg-white p-8">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1eee7] text-[#536174]">
                <FileText size={22} />
              </span>
              <p className="text-xs font-bold text-[#455267]">{attachment.fileName}</p>
              <audio src={url} controls className="w-full" />
            </div>
          ) : kind === 'pdf' ? (
            <iframe src={url} title={attachment.fileName} className="h-[65dvh] w-full rounded-xl border border-[#e6e2d9] bg-white" />
          ) : kind === 'text' ? (
            <pre className="scrollbar-thin max-h-[65dvh] overflow-auto whitespace-pre-wrap rounded-xl border border-[#e6e2d9] bg-white p-5 font-mono text-xs leading-5 text-[#455267]">
              {text || '…'}
            </pre>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText size={26} className="text-[#c3c9d1]" />
              <p className="text-xs font-semibold text-[#87909c]">
                No inline preview for {attachment.contentType || 'this file type'}.
              </p>
              <button
                onClick={() => void downloadAttachment(attachment).catch(() => undefined)}
                className="flex items-center gap-1.5 rounded-lg bg-[#202f46] px-3 py-2 text-[10px] font-bold text-white"
              >
                <Download size={12} /> Download {attachment.fileName}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
