import type {
  PortalNotification,
  PortalReport,
  PortalUser,
  ReportAttachment,
  ReportHistory,
  ReportMessage,
} from "@workspace/db";

function iso(date: Date): string {
  return date.toISOString();
}

export function userToJson(user: PortalUser) {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email ?? null,
    displayName: user.displayName,
    role: user.role as "user" | "moderator" | "administrator",
    blocked: user.blocked,
    nullsConnectId: user.nullsConnectId ?? null,
    nullsConnectName: user.nullsConnectName ?? null,
    avatarPath: user.avatarPath ?? null,
    preferences: user.preferences ?? {},
    createdAt: iso(user.createdAt),
  };
}

export function reportSummaryToJson(
  report: PortalReport,
  ownerName: string,
) {
  return {
    id: report.id,
    ticketNumber: report.ticketNumber,
    ownerId: report.ownerId,
    ownerName,
    game: report.game,
    category: report.category,
    subtype: report.subtype,
    title: report.title,
    status: report.status,
    priority: report.priority,
    allowUserMessages: report.allowUserMessages,
    createdAt: iso(report.createdAt),
    updatedAt: iso(report.updatedAt),
  };
}

export function historyToJson(
  history: ReportHistory,
  actorName: string | null,
) {
  return {
    id: history.id,
    action: history.action,
    fromStatus: history.fromStatus ?? null,
    toStatus: history.toStatus ?? null,
    details: history.details ?? null,
    actorName,
    createdAt: iso(history.createdAt),
  };
}

export function attachmentToJson(attachment: ReportAttachment) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    downloadPath: `/api/storage/objects/${encodeURIComponent(attachment.objectPath)}`,
    createdAt: iso(attachment.createdAt),
  };
}

export function messageToJson(
  message: ReportMessage,
  authorName: string,
  attachments: ReportAttachment[] = [],
) {
  return {
    id: message.id,
    reportId: message.reportId,
    authorId: message.authorId,
    authorName,
    body: message.body,
    isInternal: message.isInternal,
    attachments: attachments.map(attachmentToJson),
    createdAt: iso(message.createdAt),
  };
}

export function notificationToJson(notification: PortalNotification) {
  return {
    id: notification.id,
    reportId: notification.reportId ?? null,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt ? iso(notification.readAt) : null,
    createdAt: iso(notification.createdAt),
  };
}
