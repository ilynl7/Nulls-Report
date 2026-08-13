import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  CreateReportBody,
  CreateReportMessageBody,
  SetReportReplyPermissionBody,
  UpdateReportBody,
  VerifyReportBody,
} from "@workspace/api-zod";
import {
  db,
  pendingUploadsTable,
  portalCountersTable,
  portalNotificationsTable,
  portalReportsTable,
  portalUsersTable,
  reportAttachmentsTable,
  reportMessagesTable,
} from "@workspace/db";
import { requireAuth, requireStaff } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { addHistory, assertCanViewReport, getReportEntity, loadReportJson } from "../lib/access";
import { createNotification, notifyStaff } from "../lib/notify";
import { messageToJson, reportSummaryToJson } from "../lib/serialize";

const router = Router();

// ---------------------------------------------------------------------------
// Game catalogue — only Null's Brawl is enabled for now; the other games are
// wired so they can be enabled later without touching the report flow.
// ---------------------------------------------------------------------------

const ENABLED_GAMES: Record<string, boolean> = {
  "nulls-brawl": true,
  "nulls-clash-of-clans": false,
  "nulls-royale": false,
  "nulls-royale-infinity": false,
};

const GAME_TICKET_PREFIX: Record<string, string> = {
  "nulls-brawl": "NB",
  "nulls-clash-of-clans": "NC",
  "nulls-royale": "NR",
  "nulls-royale-infinity": "NI",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  verifying: "Verifying",
  rejected: "Rejected",
  verified: "Verified",
  forwarded: "Forwarded",
  waiting_for_user: "Waiting for reporter",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const TERMINAL_STATUSES = new Set(["rejected", "resolved", "closed"]);

async function nextTicketNumber(game: string): Promise<string> {
  const prefix = GAME_TICKET_PREFIX[game] ?? "NB";
  const counterName = `report_seq_${prefix.toLowerCase()}`;
  const [counter] = await db
    .insert(portalCountersTable)
    .values({ name: counterName, value: 1 })
    .onConflictDoUpdate({
      target: portalCountersTable.name,
      set: { value: sql`${portalCountersTable.value} + 1` },
    })
    .returning();
  return `${prefix}-${String(counter.value).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// List & create
// ---------------------------------------------------------------------------

router.get(
  "/reports",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    if (viewer.role === "user") {
      conditions.push(eq(portalReportsTable.ownerId, viewer.id));
    }
    if (status) {
      conditions.push(eq(portalReportsTable.status, status));
    }
    if (search && search.trim()) {
      const needle = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(portalReportsTable.title, needle),
          ilike(portalReportsTable.ticketNumber, needle),
          ilike(portalReportsTable.details, needle),
        )!,
      );
    }

    const reports = conditions.length
      ? await db
          .select()
          .from(portalReportsTable)
          .where(and(...conditions))
          .orderBy(desc(portalReportsTable.updatedAt))
          .limit(200)
      : await db
          .select()
          .from(portalReportsTable)
          .orderBy(desc(portalReportsTable.updatedAt))
          .limit(200);

    const ownerIds = [...new Set(reports.map((r) => r.ownerId))];
    const owners = ownerIds.length
      ? await db
          .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
          .from(portalUsersTable)
          .where(inArray(portalUsersTable.id, ownerIds))
      : [];
    const names = new Map(owners.map((o) => [o.id, o.displayName]));

    res.json(reports.map((r) => reportSummaryToJson(r, names.get(r.ownerId) ?? "Unknown")));
  }),
);

router.post(
  "/reports",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const parsed = CreateReportBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid report payload");
    }
    const { game, category, subtype, title, details, anonymous, attachmentIds } = parsed.data;

    if (!ENABLED_GAMES[game]) {
      throw httpError(
        400,
        "This game is not available yet — only Null's Brawl reports are currently accepted.",
      );
    }

    // Claim prepared uploads: they must exist and belong to this user.
    let pending: Array<typeof pendingUploadsTable.$inferSelect> = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const uniqueIds = [...new Set(attachmentIds)];
      pending = await db
        .select()
        .from(pendingUploadsTable)
        .where(inArray(pendingUploadsTable.id, uniqueIds));
      if (pending.length !== uniqueIds.length) {
        throw httpError(400, "One or more attachments are not ready for this report");
      }
      if (pending.some((upload) => upload.uploaderId !== viewer.id)) {
        throw httpError(403, "One or more attachments belong to another user");
      }
    }

    const ticketNumber = await nextTicketNumber(game);
    const [report] = await db
      .insert(portalReportsTable)
      .values({
        ticketNumber,
        ownerId: viewer.id,
        game,
        category,
        subtype,
        title: title.trim(),
        details: details.trim(),
        anonymous,
        status: "submitted",
        priority: "normal",
        allowUserMessages: false,
      })
      .returning();

    for (const upload of pending) {
      await db.insert(reportAttachmentsTable).values({
        reportId: report.id,
        uploaderId: viewer.id,
        objectPath: upload.objectPath,
        fileName: upload.fileName,
        contentType: upload.contentType,
        size: upload.size,
      });
      await db.delete(pendingUploadsTable).where(eq(pendingUploadsTable.id, upload.id));
    }

    await addHistory({
      reportId: report.id,
      actorId: viewer.id,
      action: "submitted",
      toStatus: "submitted",
    });

    await notifyStaff({
      reportId: report.id,
      type: "report_submitted",
      title: `New report ${ticketNumber}`,
      body: `${title} — ${STATUS_LABELS.submitted} and needs review.`,
      exceptUserId: viewer.id,
    });

    res.status(201).json(await loadReportJson(report.id, viewer));
  }),
);

// ---------------------------------------------------------------------------
// Single report
// ---------------------------------------------------------------------------

router.get(
  "/reports/:id",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    res.json(await loadReportJson(Number(req.params.id), viewer));
  }),
);

router.patch(
  "/reports/:id",
  requireAuth(),
  requireStaff(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    const parsed = UpdateReportBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid update");
    }
    const { title, status, priority, details } = parsed.data;
    if (title === undefined && status === undefined && priority === undefined && details === undefined) {
      throw httpError(400, "Provide at least one field to update");
    }

    const changes: Partial<typeof portalReportsTable.$inferInsert> = {};
    if (title !== undefined) {
      changes.title = title.trim();
    }
    if (priority !== undefined) {
      changes.priority = priority;
    }
    if (details !== undefined) {
      changes.details = details.trim();
    }
    if (status !== undefined && status !== report.status) {
      changes.status = status;
      if (status === "resolved" || status === "closed") {
        changes.resolvedBy = actor.id;
        changes.resolvedAt = new Date();
      }
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        action: "status_changed",
        fromStatus: report.status,
        toStatus: status,
      });
      await createNotification({
        userId: report.ownerId,
        reportId: report.id,
        type: "status_changed",
        title: `Ticket ${report.ticketNumber} status updated`,
        body: `Status changed to ${STATUS_LABELS[status] ?? status}.`,
      });
    }

    if (Object.keys(changes).length > 0) {
      await db.update(portalReportsTable).set(changes).where(eq(portalReportsTable.id, report.id));
    }

    res.json(await loadReportJson(report.id, actor));
  }),
);

// ---------------------------------------------------------------------------
// Moderator workflow: verify, reject, forward
// ---------------------------------------------------------------------------

router.post(
  "/reports/:id/verify",
  requireAuth(),
  requireStaff(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    const parsed = VerifyReportBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid verification");
    }
    if (TERMINAL_STATUSES.has(report.status)) {
      throw httpError(400, "This ticket can no longer be verified");
    }

    const verified = parsed.data.verified === true;
    const toStatus = verified ? "verified" : "rejected";
    await db
      .update(portalReportsTable)
      .set({ status: toStatus, verifiedBy: actor.id })
      .where(eq(portalReportsTable.id, report.id));

    await addHistory({
      reportId: report.id,
      actorId: actor.id,
      action: verified ? "verified" : "rejected",
      fromStatus: report.status,
      toStatus,
      details: parsed.data.reason || null,
    });

    await createNotification({
      userId: report.ownerId,
      reportId: report.id,
      type: verified ? "verified" : "rejected",
      title: verified
        ? `Ticket ${report.ticketNumber} verified`
        : `Ticket ${report.ticketNumber} not verified`,
      body: verified
        ? "A moderator confirmed the report and it is now being handled."
        : "A moderator reviewed the report but could not verify the issue.",
    });

    res.json(await loadReportJson(report.id, actor));
  }),
);

router.post(
  "/reports/:id/forward",
  requireAuth(),
  requireStaff(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    if (report.status !== "verified") {
      throw httpError(400, "Only verified tickets can be forwarded to administrators");
    }

    await db
      .update(portalReportsTable)
      .set({ status: "forwarded", forwardedBy: actor.id })
      .where(eq(portalReportsTable.id, report.id));

    await addHistory({
      reportId: report.id,
      actorId: actor.id,
      action: "forwarded",
      fromStatus: "verified",
      toStatus: "forwarded",
      details: "Forwarded to administrators for handling.",
    });

    await createNotification({
      userId: report.ownerId,
      reportId: report.id,
      type: "forwarded",
      title: `Ticket ${report.ticketNumber} forwarded`,
      body: "The verified report has been forwarded to the administrator team.",
    });
    await notifyStaff({
      reportId: report.id,
      type: "forwarded",
      title: `Verified ticket ${report.ticketNumber} forwarded`,
      body: `${report.title} is ready for administrator handling.`,
      exceptUserId: actor.id,
    });

    res.json(await loadReportJson(report.id, actor));
  }),
);

// ---------------------------------------------------------------------------
// Ticket conversation
// ---------------------------------------------------------------------------

router.get(
  "/reports/:id/messages",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    assertCanViewReport(report, viewer);

    const where = viewer.role === "user" ? and(eq(reportMessagesTable.reportId, report.id), eq(reportMessagesTable.isInternal, false)) : eq(reportMessagesTable.reportId, report.id);
    const messages = await db
      .select()
      .from(reportMessagesTable)
      .where(where)
      .orderBy(asc(reportMessagesTable.createdAt), asc(reportMessagesTable.id));

    const authorIds = [...new Set(messages.map((m) => m.authorId))];
    const authors = authorIds.length
      ? await db
          .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
          .from(portalUsersTable)
          .where(inArray(portalUsersTable.id, authorIds))
      : [];
    const names = new Map(authors.map((a) => [a.id, a.displayName]));

    // Attachments sent inside messages, grouped by message.
    const messageIds = messages.map((m) => m.id);
    const attachments = messageIds.length
      ? await db
          .select()
          .from(reportAttachmentsTable)
          .where(
            and(
              eq(reportAttachmentsTable.reportId, report.id),
              inArray(reportAttachmentsTable.messageId, messageIds),
            ),
          )
      : [];
    const attachmentsByMessage = new Map<number, typeof attachments>();
    for (const attachment of attachments) {
      if (attachment.messageId == null) continue;
      const list = attachmentsByMessage.get(attachment.messageId) ?? [];
      list.push(attachment);
      attachmentsByMessage.set(attachment.messageId, list);
    }

    res.json(
      messages.map((m) =>
        messageToJson(m, names.get(m.authorId) ?? "Unknown", attachmentsByMessage.get(m.id) ?? []),
      ),
    );
  }),
);

router.post(
  "/reports/:id/messages",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    const parsed = CreateReportMessageBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid message");
    }
    const { body, isInternal, attachmentIds } = parsed.data;
    const staff = viewer.role !== "user";

    if (!staff) {
      if (report.ownerId !== viewer.id) {
        throw httpError(403, "You do not have access to this report");
      }
      if (!report.allowUserMessages) {
        throw httpError(403, "Replies are disabled for this ticket");
      }
      if (isInternal) {
        throw httpError(403, "You cannot send internal notes");
      }
    }

    // Claim prepared uploads: they must exist and belong to this user.
    let pending: Array<typeof pendingUploadsTable.$inferSelect> = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const uniqueIds = [...new Set(attachmentIds)];
      pending = await db
        .select()
        .from(pendingUploadsTable)
        .where(inArray(pendingUploadsTable.id, uniqueIds));
      if (pending.length !== uniqueIds.length) {
        throw httpError(400, "One or more attachments are not ready for this message");
      }
      if (pending.some((upload) => upload.uploaderId !== viewer.id)) {
        throw httpError(403, "One or more attachments belong to another user");
      }
    }

    const [message] = await db
      .insert(reportMessagesTable)
      .values({
        reportId: report.id,
        authorId: viewer.id,
        body: body.trim(),
        isInternal: isInternal ?? false,
      })
      .returning();

    for (const upload of pending) {
      await db.insert(reportAttachmentsTable).values({
        reportId: report.id,
        messageId: message.id,
        uploaderId: viewer.id,
        objectPath: upload.objectPath,
        fileName: upload.fileName,
        contentType: upload.contentType,
        size: upload.size,
      });
      await db.delete(pendingUploadsTable).where(eq(pendingUploadsTable.id, upload.id));
    }

    if (staff && !isInternal) {
      await createNotification({
        userId: report.ownerId,
        reportId: report.id,
        type: "reply",
        title: `New reply on ${report.ticketNumber}`,
        body,
      });
    } else if (!staff) {
      await notifyStaff({
        reportId: report.id,
        type: "reply",
        title: `New reply on ${report.ticketNumber}`,
        body,
        exceptUserId: viewer.id,
      });
    }

    const sentAttachments = pending.length
      ? await db
          .select()
          .from(reportAttachmentsTable)
          .where(eq(reportAttachmentsTable.messageId, message.id))
      : [];
    res.status(201).json(messageToJson(message, viewer.displayName, sentAttachments));
  }),
);

router.post(
  "/reports/:id/reply-permission",
  requireAuth(),
  requireStaff(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    const parsed = SetReportReplyPermissionBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid reply permission");
    }
    const enabled = parsed.data.enabled;

    if (enabled && !report.allowUserMessages) {
      await db
        .update(portalReportsTable)
        .set({ allowUserMessages: true, status: "waiting_for_user" })
        .where(eq(portalReportsTable.id, report.id));
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        action: "reply_enabled",
        fromStatus: report.status,
        toStatus: "waiting_for_user",
        details: "Replies from the reporter were enabled.",
      });
      await createNotification({
        userId: report.ownerId,
        reportId: report.id,
        type: "reply_enabled",
        title: `Replies enabled on ${report.ticketNumber}`,
        body: "You can now reply on this ticket.",
      });
    } else if (!enabled && report.allowUserMessages) {
      await db
        .update(portalReportsTable)
        .set({ allowUserMessages: false })
        .where(eq(portalReportsTable.id, report.id));
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        action: "reply_disabled",
        fromStatus: report.status,
        toStatus: report.status,
        details: "Replies from the reporter were disabled.",
      });
    }

    res.json(await loadReportJson(report.id, actor));
  }),
);

export default router;
