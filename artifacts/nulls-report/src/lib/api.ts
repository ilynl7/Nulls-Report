import { QueryClient } from '@tanstack/react-query';
import { getStorageObject } from '@workspace/api-client-react';
import type { Attachment, User } from '@workspace/api-client-react';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Query keys used by the generated API client (first element is the URL). */
export const API_KEYS = {
  me: ['/api/me'],
  reports: ['/api/reports'],
  notifications: ['/api/notifications'],
  users: ['/api/admin/users'],
} as const;

// These must match the generated client's query keys exactly
// (getGetReportQueryKey / getListReportMessagesQueryKey), otherwise
// invalidations never match and the UI only refreshes on reload.
export function reportKey(id: number) {
  return [`/api/reports/${id}`] as const;
}

export function messagesKey(id: number) {
  return [`/api/reports/${id}/messages`] as const;
}

/** Public URL for a user's uploaded profile picture (or null if none). */
export function avatarUrl(user: Pick<User, 'avatarPath'> | null | undefined): string | null {
  if (!user?.avatarPath) return null;
  return `/api/storage/avatars/${user.avatarPath}`;
}

/** Parses the raw object path out of an Attachment.downloadPath. */
export function objectPathFrom(downloadPath: string): string {
  const marker = '/api/storage/objects/';
  const idx = downloadPath.indexOf(marker);
  if (idx === -1) return downloadPath;
  return decodeURIComponent(downloadPath.slice(idx + marker.length));
}

/** Fetches an attachment's bytes through the authorized API client. */
export async function fetchAttachmentBlob(attachment: Attachment): Promise<Blob> {
  return getStorageObject(objectPathFrom(attachment.downloadPath));
}

/** Downloads an attachment through the authorized API client. */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const blob = await getStorageObject(objectPathFrom(attachment.downloadPath));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.fileName || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Something went wrong. Please try again.';
}
