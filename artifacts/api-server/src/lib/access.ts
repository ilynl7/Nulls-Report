import {
  db,
  portalReportsTable,
  portalUsersTable,
  reportAttachmentsTable,
  reportHistoryTable,
  type PortalReport,
  type PortalUser,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { httpError } from "./http";
import { isStaff } from "./auth";
import {
  attachmentToJson,
  historyToJson,
  reportSummaryToJson,
} from "./serialize";
import { assertCanViewReport, effectiveVisibilityOf, isParticipant } from "./visibility";

export async function getReportEntity(id: number): Promise<PortalReport> {
  const rows = await db
    .select()
    .from(portalReportsTable)
    .where(eq(portalReportsTable.id, id))
    .limit(1);
  if (rows.length === 0) {
    throw httpError(404, "Report not found");
  }
  return rows[0];
}

export { assertCanViewReport, effectiveVisibilityOf };

export async function addHistory(input: {
  reportId: number;
  actorId: number | null;
  actorRole?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromVerification?: string | null;
  toVerification?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  details?: string | null;
}): Promise<void> {
  await db.insert(reportHistoryTable).values({
    reportId: input.reportId,
    actorId: input.actorId,
    actorRole: input.actorRole ?? null,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    fromVerification: input.fromVerification ?? null,
    toVerification: input.toVerification ?? null,
    fromValue: input.fromValue ?? null,
    toValue: input.toValue ?? null,
    details: input.details ?? null,
  });
}

/**
 * Loads a report for the viewer, enforcing visibility rules and shaping the
 * payload so the community never receives staff-only information:
 *  - community viewers get the reporter's public tag (never the display name),
 *    no verified-by info, and no staff actor names in the history.
 *  - the reporter and staff see the full identity and audit trail.
 */
export async function loadReportJson(id: number, viewer: PortalUser) {
  const report = await getReportEntity(id);
  assertCanViewReport(report, viewer);

  const participant = isParticipant(report, viewer);

  const owners = await db
    .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName, tag: portalUsersTable.tag })
    .from(portalUsersTable)
    .where(eq(portalUsersTable.id, report.ownerId))
    .limit(1);
  const owner = owners[0] ?? null;
  const ownerTag = owner?.tag ?? null;
  const displayName = owner?.displayName ?? "Unknown";
  const anonymous = report.anonymous;
  // Public identity: the portal tag. The display name (provider username) is
  // only ever revealed to the reporter themself and to staff.
  const ownerName = participant
    ? displayName
    : anonymous
      ? "Anonymous"
      : ownerTag
        ? `#${ownerTag}`
        : "Unknown";

  // Verified-by info so staff can see who verified the ticket and when.
  let verifiedInfo: { verifiedByName: string | null; verifiedAt: string | null } = {
    verifiedByName: null,
    verifiedAt: null,
  };
  if (participant && report.verifiedBy != null) {
    const verifiers = await db
      .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, report.verifiedBy))
      .limit(1);
    verifiedInfo = {
      verifiedByName: verifiers[0]?.displayName ?? null,
      verifiedAt: report.verifiedAt ? report.verifiedAt.toISOString() : null,
    };
  }

  // Hidden-by info (staff only — community never learns who hid it).
  let hiddenByName: string | null = null;
  if (participant && report.hiddenBy != null) {
    const hiders = await db
      .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, report.hiddenBy))
      .limit(1);
    hiddenByName = hiders[0]?.displayName ?? null;
  }

  const history = participant
    ? await db
        .select()
        .from(reportHistoryTable)
        .where(eq(reportHistoryTable.reportId, report.id))
        .orderBy(desc(reportHistoryTable.createdAt), desc(reportHistoryTable.id))
        .limit(200)
    : [];
  const actorIds = [
    ...new Set(
      history
        .map((h) => h.actorId)
        .filter((actorId): actorId is number => actorId !== null),
    ),
  ];
  const actors = actorIds.length
    ? await db
        .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
        .from(portalUsersTable)
        .where(inArray(portalUsersTable.id, actorIds))
    : [];
  const actorNames = new Map(actors.map((a) => [a.id, a.displayName]));

  // For community viewers the audit trail is stripped down to public-safe
  // events with no actor identity (role only).
  const publicHistory =
    participant
      ? history.map((h) => historyToJson(h, actorNames.get(h.actorId ?? -1) ?? null))
      : history
          .filter((h) => PUBLIC_HISTORY_ACTIONS.has(h.action))
          .map((h) => historyToJson(h, null));

  const attachments = await db
    .select()
    .from(reportAttachmentsTable)
    .where(eq(reportAttachmentsTable.reportId, report.id))
    .orderBy(desc(reportAttachmentsTable.createdAt));

  return {
    ...reportSummaryToJson(report, ownerName, ownerTag, verifiedInfo.verifiedByName),
    details: report.details,
    fields: report.fields ?? {},
    anonymous: report.anonymous,
    verifiedByName: verifiedInfo.verifiedByName,
    verifiedAt: verifiedInfo.verifiedAt,
    hiddenByName,
    hiddenAt: report.hiddenAt ? report.hiddenAt.toISOString() : null,
    history: publicHistory,
    attachments: attachments.map(attachmentToJson),
  };
}

/** History actions that are safe to show to the community on public reports. */
const PUBLIC_HISTORY_ACTIONS = new Set([
  "submitted",
  "verified",
  "rejected",
  "status_changed",
  "verification_changed",
  "reopened",
  "resolved",
  "closed",
]);

export function canManageReport(_report: PortalReport, viewer: PortalUser): boolean {
  return isStaff(viewer);
}
