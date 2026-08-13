import type {
  AuthIdentity,
  PortalNotification,
  PortalReport,
  PortalUser,
  ReportAttachment,
  ReportHistory,
  ReportMessage,
} from "@workspace/db";
import { AUTH_PROVIDER_LABELS, effectiveRole, TRUSTED_PROVIDERS } from "./auth";
import { staffStageOf } from "./statuses";
import { effectiveVisibilityOf } from "./visibility";

function iso(date: Date): string {
  return date.toISOString();
}

function authMethodToJson(identity: AuthIdentity) {
  const metadata = identity.metadata ?? {};
  let label: string | null = null;
  if (identity.provider === "discord") {
    label = typeof metadata.username === "string" ? metadata.username : null;
  } else if (identity.provider === "nulls_connect") {
    label = typeof metadata.name === "string" ? metadata.name : null;
  }
  return {
    provider: identity.provider,
    name: AUTH_PROVIDER_LABELS[identity.provider] ?? identity.provider,
    label,
    linkedAt: iso(identity.createdAt),
  };
}

export function userToJson(user: PortalUser, identities: AuthIdentity[] = []) {
  return {
    id: user.id,
    tag: user.tag ?? null,
    displayName: user.displayName,
    role: effectiveRole(user),
    blocked: user.blocked,
    nullsConnectId: user.nullsConnectId ?? null,
    nullsConnectName: user.nullsConnectName ?? null,
    avatarPath: user.avatarPath ?? null,
    discordId: user.discordId ?? null,
    discordUsername: user.discordUsername ?? null,
    preferences: user.preferences ?? {},
    authMethods: identities.map(authMethodToJson),
    hasTrustedAuth: identities.some((i) => TRUSTED_PROVIDERS.has(i.provider)),
    createdAt: iso(user.createdAt),
  };
}

export function reportSummaryToJson(
  report: PortalReport,
  ownerName: string,
  ownerTag: string | null,
  verifiedByName: string | null = null,
) {
  return {
    id: report.id,
    ticketNumber: report.ticketNumber,
    ownerId: report.ownerId,
    ownerName,
    ownerTag,
    anonymous: report.anonymous,
    game: report.game,
    category: report.category,
    subtype: report.subtype,
    issueType: report.issueType,
    title: report.title,
    status: report.status,
    verification: report.verification,
    staffStage: staffStageOf(report.status, report.verification),
    visibility: report.visibility,
    effectiveVisibility: effectiveVisibilityOf(report),
    hidden: report.hidden,
    hiddenReason: report.hiddenReason ?? null,
    verifiedByName,
    verifiedAt: report.verifiedAt ? iso(report.verifiedAt) : null,
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
    fromVerification: history.fromVerification ?? null,
    toVerification: history.toVerification ?? null,
    fromValue: history.fromValue ?? null,
    toValue: history.toValue ?? null,
    actorRole: history.actorRole ?? null,
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
  authorRole: string | null = null,
) {
  return {
    id: message.id,
    reportId: message.reportId,
    authorId: message.authorId,
    authorName,
    authorRole,
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
