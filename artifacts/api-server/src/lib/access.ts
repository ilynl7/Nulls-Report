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

/** Throws 403 unless the viewer owns the report or is staff. */
export function assertCanViewReport(report: PortalReport, viewer: PortalUser): void {
  if (viewer.role === "user" && report.ownerId !== viewer.id) {
    throw httpError(403, "You do not have access to this report");
  }
}

export async function addHistory(input: {
  reportId: number;
  actorId: number | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  details?: string | null;
}): Promise<void> {
  await db.insert(reportHistoryTable).values({
    reportId: input.reportId,
    actorId: input.actorId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    details: input.details ?? null,
  });
}

/**
 * Loads a report with owner name, history (with actor names) and attachments,
 * enforcing read permission for the viewer.
 */
export async function loadReportJson(id: number, viewer: PortalUser) {
  const report = await getReportEntity(id);
  assertCanViewReport(report, viewer);

  const owners = await db
    .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
    .from(portalUsersTable)
    .where(eq(portalUsersTable.id, report.ownerId))
    .limit(1);
  const ownerName = owners[0]?.displayName ?? "Unknown";

  const history = await db
    .select()
    .from(reportHistoryTable)
    .where(eq(reportHistoryTable.reportId, report.id))
    .orderBy(desc(reportHistoryTable.createdAt), desc(reportHistoryTable.id))
    .limit(200);
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

  const attachments = await db
    .select()
    .from(reportAttachmentsTable)
    .where(eq(reportAttachmentsTable.reportId, report.id))
    .orderBy(desc(reportAttachmentsTable.createdAt));

  return {
    ...reportSummaryToJson(report, ownerName),
    details: report.details,
    history: history.map((h) => historyToJson(h, actorNames.get(h.actorId ?? -1) ?? null)),
    attachments: attachments.map(attachmentToJson),
  };
}

export function canManageReport(_report: PortalReport, viewer: PortalUser): boolean {
  return isStaff(viewer);
}
