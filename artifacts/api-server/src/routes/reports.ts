import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  CreateReportBody,
  CreateReportMessageBody,
  SetReportReplyPermissionBody,
  UpdateReportBody,
  UpdateReportVisibilityBody,
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
import { assertTrustedAuth, requireAuth, requireStaff } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { addHistory, assertCanViewReport, getReportEntity, loadReportJson } from "../lib/access";
import { createNotification, notifyAdmins, notifyStaff } from "../lib/notify";
import { messageToJson, reportSummaryToJson } from "../lib/serialize";
import {
  REPORT_PRIORITIES,
  REPORT_VISIBILITIES,
  RISK_PRIORITIES,
  type ReportPriority,
  type ReportVisibility,
} from "../lib/visibility";
import {
  STATUS_LABELS,
  STATUS_PERMISSIONS,
  TERMINAL_STATUSES,
  VERIFICATION_LABELS,
} from "../lib/statuses";

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

const ISSUE_TYPES = new Set(["community", "game"]);

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  private: "Private",
  hidden: "Hidden",
  restricted: "Restricted",
};

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

/**
 * GET /api/reports
 *
 * Scope decides what is listed:
 *  - `community`  — reports whose EFFECTIVE visibility is public (visibility
 *                   public, not hidden, not risk-critical). The community feed.
 *  - `mine`       — the signed-in user's own reports (any visibility).
 *  - default      — users: their own reports; staff: everything (inbox).
 *
 * The visibility rules are enforced in SQL here, never left to the frontend.
 * Optional filters: game, issueType, category, priority, status, verification,
 * search.
 */
router.get(
  "/reports",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const scope = req.query.scope === "community" || req.query.scope === "mine" ? req.query.scope : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const verification =
      typeof req.query.verification === "string" ? req.query.verification : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const game = typeof req.query.game === "string" ? req.query.game : undefined;
    const issueType = typeof req.query.issueType === "string" ? req.query.issueType : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    if (scope === "mine" || (viewer.role === "user" && scope !== "community")) {
      conditions.push(eq(portalReportsTable.ownerId, viewer.id));
    } else if (scope === "community") {
      // Effective public visibility only: original public, never hidden, and
      // never risk-critical (the risk policy is enforced here too).
      conditions.push(eq(portalReportsTable.visibility, "public"));
      conditions.push(eq(portalReportsTable.hidden, false));
      conditions.push(notInArray(portalReportsTable.priority, [...RISK_PRIORITIES]));
    }
    if (status) {
      conditions.push(eq(portalReportsTable.status, status));
    }
    if (verification) {
      conditions.push(eq(portalReportsTable.verification, verification));
    }
    if (game) {
      conditions.push(eq(portalReportsTable.game, game));
    }
    if (issueType) {
      conditions.push(eq(portalReportsTable.issueType, issueType));
    }
    if (category) {
      conditions.push(eq(portalReportsTable.category, category));
    }
    if (priority) {
      conditions.push(eq(portalReportsTable.priority, priority));
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

    // The administrator inbox is a handling queue, not a moderator queue:
    // tickets awaiting administrator action come first, then other verified
    // tickets, then the rest (unverified moderator queue is last for admins).
    const isAdminInbox = viewer.role === "administrator" && !scope;
    const orderBy = isAdminInbox
      ? [
          sql`case when ${portalReportsTable.status} in ('awaiting_admin', 'in_progress') then 0 when ${portalReportsTable.verification} = 'verified' then 1 else 2 end`,
          desc(portalReportsTable.updatedAt),
        ]
      : [desc(portalReportsTable.updatedAt)];

    const reports = conditions.length
      ? await db
          .select()
          .from(portalReportsTable)
          .where(and(...conditions))
          .orderBy(...orderBy)
          .limit(200)
      : await db
          .select()
          .from(portalReportsTable)
          .orderBy(...orderBy)
          .limit(200);

    const ownerIds = [...new Set(reports.map((r) => r.ownerId))];
    const owners = ownerIds.length
      ? await db
          .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName, tag: portalUsersTable.tag })
          .from(portalUsersTable)
          .where(inArray(portalUsersTable.id, ownerIds))
      : [];
    const names = new Map(owners.map((o) => [o.id, o.displayName]));
    const tags = new Map(owners.map((o) => [o.id, o.tag]));

    // Verified-by names so staff can see who verified each ticket.
    const verifierIds = [...new Set(reports.map((r) => r.verifiedBy).filter((id): id is number => id != null))];
    const verifiers = verifierIds.length
      ? await db
          .select({ id: portalUsersTable.id, displayName: portalUsersTable.displayName })
          .from(portalUsersTable)
          .where(inArray(portalUsersTable.id, verifierIds))
      : [];
    const verifierNames = new Map(verifiers.map((v) => [v.id, v.displayName]));

    // Public identity: the community sees the portal tag, never provider
    // usernames. The reporter and staff see the display name.
    const isStaffViewer = viewer.role !== "user";
    res.json(
      reports.map((r) => {
        const ownerId = r.ownerId;
        const ownerTag = tags.get(ownerId) ?? null;
        const ownerName =
          isStaffViewer || ownerId === viewer.id
            ? (names.get(ownerId) ?? "Unknown")
            : r.anonymous
              ? "Anonymous"
              : ownerTag
                ? `#${ownerTag}`
                : "Unknown";
        return reportSummaryToJson(
          r,
          ownerName,
          ownerTag,
          verifierNames.get(r.verifiedBy ?? -1) ?? null,
        );
      }),
    );
  }),
);

router.post(
  "/reports",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    // Report submission requires at least one trusted authentication method.
    // Accounts only exist through Discord or Nulls Connect, so this is always
    // satisfied in practice — kept as defense in depth.
    await assertTrustedAuth(viewer);
    const parsed = CreateReportBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid report payload");
    }
    const { game, category, subtype, title, details, anonymous, attachmentIds } = parsed.data;
    const issueType = parsed.data.issueType ?? "community";
    const fields = parsed.data.fields ?? {};
    const visibility: ReportVisibility = parsed.data.visibility ?? "public";
    const priority: ReportPriority = parsed.data.priority ?? "normal";

    if (!ENABLED_GAMES[game]) {
      throw httpError(
        400,
        "This game is not available yet — only Null's Brawl reports are currently accepted.",
      );
    }
    if (!ISSUE_TYPES.has(issueType)) {
      throw httpError(400, "Invalid issue type");
    }
    if (!REPORT_VISIBILITIES.includes(visibility)) {
      throw httpError(400, "Invalid visibility — choose Public or Private");
    }
    if (!REPORT_PRIORITIES.includes(priority)) {
      throw httpError(400, "Invalid priority");
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
        issueType,
        category,
        subtype,
        title: title.trim(),
        details: details.trim(),
        fields,
        anonymous,
        visibility,
        priority,
        status: "new",
        verification: "unverified",
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

    const riskRestricted = RISK_PRIORITIES.has(priority);
    await addHistory({
      reportId: report.id,
      actorId: viewer.id,
      actorRole: viewer.role,
      action: "submitted",
      toStatus: "new",
      details: `${STATUS_LABELS.new} · ${VISIBILITY_LABELS[visibility] ?? visibility} report${
        riskRestricted
          ? " · risk policy restricts community visibility (critical priority)"
          : ""
      }.`,
    });

    if (pending.length > 0) {
      await addHistory({
        reportId: report.id,
        actorId: viewer.id,
        actorRole: viewer.role,
        action: "attachment_added",
        details: `${pending.length} attachment(s) added at submission.`,
      });
    }

    await notifyStaff({
      reportId: report.id,
      type: "report_submitted",
      title: `New report ${ticketNumber}`,
      body: `${title} — needs moderator review.`,
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

    if (title !== undefined && title.trim() !== report.title) {
      changes.title = title.trim();
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: "title_changed",
        fromValue: report.title,
        toValue: title.trim(),
      });
    }

    if (priority !== undefined && priority !== report.priority) {
      changes.priority = priority;
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: "priority_changed",
        fromValue: report.priority,
        toValue: priority,
        details: RISK_PRIORITIES.has(priority)
          ? "Risk/critical priority restricts community visibility automatically."
          : null,
      });
    }

    if (details !== undefined && details.trim() !== report.details) {
      changes.details = details.trim();
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: "details_edited",
        details: "Report details were edited.",
      });
    }

    const prevStatus = report.status;
    if (status !== undefined && status !== prevStatus) {
      // --- Role gating ---------------------------------------------------
      const allowed = STATUS_PERMISSIONS[actor.role] ?? [];
      if (!allowed.includes(status)) {
        throw httpError(
          403,
          `Your role cannot set the status to ${STATUS_LABELS[status] ?? status}`,
        );
      }
      if (status === "closed" && actor.role === "moderator" && report.verification !== "rejected") {
        throw httpError(403, "Moderators can only close tickets that were rejected");
      }
      if (status === "resolved" && report.verification !== "verified") {
        throw httpError(400, "Only verified tickets can be resolved");
      }

      // --- Reopen --------------------------------------------------------
      const reopening = TERMINAL_STATUSES.has(prevStatus) && !TERMINAL_STATUSES.has(status);
      if (reopening) {
        // A rejected ticket that is reopened must be re-reviewed.
        if (report.verification === "rejected") {
          changes.verification = "unverified";
          await addHistory({
            reportId: report.id,
            actorId: actor.id,
            actorRole: actor.role,
            action: "verification_changed",
            fromVerification: "rejected",
            toVerification: "unverified",
            details: "Verification reset because the ticket was reopened.",
          });
        }
        await addHistory({
          reportId: report.id,
          actorId: actor.id,
          actorRole: actor.role,
          action: "reopened",
          fromStatus: report.status,
          toStatus: status,
          toVerification: changes.verification ?? report.verification,
        });
      }

      changes.status = status;

      // --- waiting_for_user ↔ replies sync ------------------------------
      if (status === "waiting_for_user") {
        changes.allowUserMessages = true;
      } else if (prevStatus === "waiting_for_user") {
        changes.allowUserMessages = false;
      }

      if (status === "resolved" || status === "closed") {
        changes.resolvedBy = actor.id;
        changes.resolvedAt = new Date();
      }

      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: "status_changed",
        fromStatus: prevStatus,
        toStatus: status,
        toVerification: changes.verification ?? report.verification,
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
// Visibility controls (staff). The original public/private choice is always
// preserved; hiding overrides it, and every change lands in the audit log.
// ---------------------------------------------------------------------------

router.post(
  "/reports/:id/visibility",
  requireAuth(),
  requireStaff(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const report = await getReportEntity(Number(req.params.id));
    const parsed = UpdateReportVisibilityBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid visibility update");
    }
    const { visibility, hidden, reason } = parsed.data;
    if (visibility === undefined && hidden === undefined) {
      throw httpError(400, "Provide a visibility value or a hide state");
    }

    const changes: Partial<typeof portalReportsTable.$inferInsert> = {};
    const now = new Date();

    if (visibility !== undefined && visibility !== report.visibility) {
      changes.visibility = visibility;
      await addHistory({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        action: "visibility_changed",
        fromValue: report.visibility,
        toValue: visibility,
        details: `${VISIBILITY_LABELS[report.visibility] ?? report.visibility} → ${
          VISIBILITY_LABELS[visibility] ?? visibility
        }${reason?.trim() ? ` · ${reason.trim()}` : ""}`,
      });
    }

    if (hidden !== undefined && hidden !== report.hidden) {
      if (hidden) {
        changes.hidden = true;
        changes.hiddenBy = actor.id;
        changes.hiddenAt = now;
        changes.hiddenReason = reason?.trim() || null;
        await addHistory({
          reportId: report.id,
          actorId: actor.id,
          actorRole: actor.role,
          action: "hidden",
          fromValue: report.visibility,
          toValue: "hidden",
          details: reason?.trim() || "Hidden from the community by staff.",
        });
        await createNotification({
          userId: report.ownerId,
          reportId: report.id,
          type: "visibility_hidden",
          title: `Report ${report.ticketNumber} was hidden`,
          body: reason?.trim()
            ? `A staff member hid your report from the community. Reason: ${reason.trim()}`
            : "A staff member hid your report from the community. Only you and staff can see it now.",
        });
      } else {
        changes.hidden = false;
        changes.hiddenBy = null;
        changes.hiddenAt = null;
        changes.hiddenReason = null;
        await addHistory({
          reportId: report.id,
          actorId: actor.id,
          actorRole: actor.role,
          action: "unhidden",
          fromValue: "hidden",
          toValue: report.visibility,
          details: reason?.trim() || "Restored to the community.",
        });
      }
    }

    if (Object.keys(changes).length > 0) {
      await db.update(portalReportsTable).set(changes).where(eq(portalReportsTable.id, report.id));
    }

    res.json(await loadReportJson(report.id, actor));
  }),
);

// ---------------------------------------------------------------------------
// Verification: the single moderator gate. Verification persists
// independently from the ticket status — later status changes never erase it.
// Verifying also forwards the ticket to the administrator stage.
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

    if (report.verification === "verified") {
      throw httpError(400, "This ticket is already verified");
    }
    if (report.verification === "rejected" && TERMINAL_STATUSES.has(report.status)) {
      throw httpError(400, "This rejected ticket is closed — reopen it before verifying");
    }

    const verified = parsed.data.verified === true;
    const verification = verified ? "verified" : "rejected";
    const toStatus = verified ? "awaiting_admin" : "closed";
    const now = new Date();

    await db
      .update(portalReportsTable)
      .set({
        verification,
        verifiedBy: actor.id,
        verifiedAt: now,
        status: toStatus,
        ...(verified ? {} : { resolvedBy: actor.id, resolvedAt: now }),
        ...(verified ? { allowUserMessages: false } : {}),
      })
      .where(eq(portalReportsTable.id, report.id));

    await addHistory({
      reportId: report.id,
      actorId: actor.id,
      actorRole: actor.role,
      action: verified ? "verified" : "rejected",
      fromVerification: report.verification,
      toVerification: verification,
      fromStatus: report.status,
      toStatus,
      details: verified ? null : (parsed.data.reason || null),
    });

    await createNotification({
      userId: report.ownerId,
      reportId: report.id,
      type: verified ? "verified" : "rejected",
      title: verified
        ? `Ticket ${report.ticketNumber} verified`
        : `Ticket ${report.ticketNumber} not verified`,
      body: verified
        ? "A moderator confirmed the report and it is now with the administrator team."
        : `A moderator reviewed the report but could not verify the issue.${
            parsed.data.reason ? ` Reason: ${parsed.data.reason}` : ""
          }`,
    });

    if (verified) {
      await notifyAdmins({
        reportId: report.id,
        type: "verified_ready",
        title: `Verified ticket ${report.ticketNumber} ready`,
        body: `${report.title} is verified and awaits administrator handling.`,
        exceptUserId: actor.id,
      });
    }

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
    const participant = viewer.role !== "user" || report.ownerId === viewer.id;

    const where = viewer.role === "user" ? and(eq(reportMessagesTable.reportId, report.id), eq(reportMessagesTable.isInternal, false)) : eq(reportMessagesTable.reportId, report.id);
    const messages = await db
      .select()
      .from(reportMessagesTable)
      .where(where)
      .orderBy(asc(reportMessagesTable.createdAt), asc(reportMessagesTable.id));

    const authorIds = [...new Set(messages.map((m) => m.authorId))];
    const authors = authorIds.length
      ? await db
          .select({
            id: portalUsersTable.id,
            displayName: portalUsersTable.displayName,
            role: portalUsersTable.role,
            tag: portalUsersTable.tag,
          })
          .from(portalUsersTable)
          .where(inArray(portalUsersTable.id, authorIds))
      : [];
    const authorsById = new Map(authors.map((a) => [a.id, a]));

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

    // Community viewers on public reports see the conversation, but author
    // identity is shaped: reporters appear as their tag, staff as their role.
    res.json(
      messages.map((m) => {
        const author = authorsById.get(m.authorId);
        const role = author?.role ?? null;
        const authorName = participant
          ? (author?.displayName ?? "Unknown")
          : role === "user"
            ? (author?.tag ? `#${author.tag}` : "Reporter")
            : roleLabel(role);
        return messageToJson(m, authorName, attachmentsByMessage.get(m.id) ?? [], role);
      }),
    );
  }),
);

function roleLabel(role: string | null): string {
  const map: Record<string, string> = { user: "Reporter", moderator: "Moderator", administrator: "Administrator" };
  return role ? (map[role] ?? role) : "Staff";
}

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
    const dedupeKey = parsed.data.dedupeKey ?? null;
    const staff = viewer.role !== "user";

    if (!staff) {
      if (report.ownerId !== viewer.id) {
        throw httpError(403, "Only the reporter and staff can write on this report");
      }
      if (!report.allowUserMessages) {
        throw httpError(403, "Replies are disabled for this ticket");
      }
      if (isInternal) {
        throw httpError(403, "You cannot send internal notes");
      }
    }

    // --- Duplicate protection --------------------------------------------
    // 1) Idempotency key: the same (report, author, key) can only ever create
    //    one message. A retry or double-submit returns the original message.
    if (dedupeKey) {
      const existing = await db
        .select()
        .from(reportMessagesTable)
        .where(
          and(
            eq(reportMessagesTable.reportId, report.id),
            eq(reportMessagesTable.authorId, viewer.id),
            eq(reportMessagesTable.dedupeKey, dedupeKey),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        const existingMessage = existing[0];
        const priorAttachments = await db
          .select()
          .from(reportAttachmentsTable)
          .where(eq(reportAttachmentsTable.messageId, existingMessage.id));
        return res
          .status(201)
          .json(messageToJson(existingMessage, viewer.displayName, priorAttachments, viewer.role));
      }
    }

    // 2) Window fallback for clients without a key: identical body from the
    //    same author on the same ticket within 10 seconds is a duplicate.
    if (!dedupeKey) {
      const recent = await db
        .select({ id: reportMessagesTable.id })
        .from(reportMessagesTable)
        .where(
          and(
            eq(reportMessagesTable.reportId, report.id),
            eq(reportMessagesTable.authorId, viewer.id),
            eq(reportMessagesTable.body, body.trim()),
            sql`${reportMessagesTable.createdAt} > now() - interval '10 seconds'`,
          ),
        )
        .limit(1);
      if (recent.length > 0) {
        throw httpError(409, "That message was already sent — please wait a moment");
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
        dedupeKey,
      })
      .onConflictDoNothing({
        target: [reportMessagesTable.reportId, reportMessagesTable.authorId, reportMessagesTable.dedupeKey],
      })
      .returning();

    let created = message;
    if (!created && dedupeKey) {
      // Lost the race with an identical concurrent request — return the
      // message the other request created instead of duplicating.
      const raced = await db
        .select()
        .from(reportMessagesTable)
        .where(
          and(
            eq(reportMessagesTable.reportId, report.id),
            eq(reportMessagesTable.authorId, viewer.id),
            eq(reportMessagesTable.dedupeKey, dedupeKey),
          ),
        )
        .limit(1);
      if (raced.length > 0) {
        created = raced[0];
        const racedAttachments = await db
          .select()
          .from(reportAttachmentsTable)
          .where(eq(reportAttachmentsTable.messageId, created.id));
        return res
          .status(201)
          .json(messageToJson(created, viewer.displayName, racedAttachments, viewer.role));
      }
      throw httpError(500, "Could not create message");
    }
    if (!created) {
      throw httpError(500, "Could not create message");
    }

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
    return res.status(201).json(messageToJson(message, viewer.displayName, sentAttachments, viewer.role));
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
        actorRole: actor.role,
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
        actorRole: actor.role,
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
