import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { UpdatePortalUserRoleBody, UpdatePortalUserBlockBody } from "@workspace/api-zod";
import {
  db,
  pendingUploadsTable,
  portalCountersTable,
  portalNotificationsTable,
  portalReportsTable,
  portalUsersTable,
  reportAttachmentsTable,
  reportHistoryTable,
  reportMessagesTable,
} from "@workspace/db";
import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { userToJson } from "../lib/serialize";

const router = Router();

/**
 * Session tokens don't carry email addresses, so backfill emails for every
 * portal user from the Clerk API before listing. Keeps the admin user list
 * accurate even for accounts that signed in before the backfill existed.
 */
async function backfillEmails(users: Array<{ id: number; clerkUserId: string | null; email: string | null }>) {
  const missing = users.filter((u) => !u.email && u.clerkUserId);
  if (missing.length === 0 || !process.env.CLERK_SECRET_KEY) {
    return;
  }
  try {
    const clerkUsers = await clerkClient.users.getUserList({ limit: 500 });
    const emailByClerkId = new Map(
      clerkUsers.data
        .map((u) => [u.id, u.primaryEmailAddress?.emailAddress ?? null] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
    for (const user of missing) {
      const email = emailByClerkId.get(user.clerkUserId ?? "");
      if (email) {
        await db
          .update(portalUsersTable)
          .set({ email })
          .where(eq(portalUsersTable.id, user.id));
      }
    }
  } catch (err) {
    // Non-fatal: the list still loads, emails just stay empty.
    console.error("[admin] failed to backfill emails from Clerk:", err);
  }
}

router.get(
  "/admin/users",
  requireAuth(),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const users = search
      ? await db
          .select()
          .from(portalUsersTable)
          .where(
            or(
              ilike(portalUsersTable.displayName, `%${search}%`),
              ilike(portalUsersTable.email, `%${search}%`),
            )!,
          )
          .orderBy(desc(portalUsersTable.createdAt))
      : await db
          .select()
          .from(portalUsersTable)
          .orderBy(desc(portalUsersTable.createdAt));

    await backfillEmails(users);
    const refreshed =
      users.some((u) => !u.email) && process.env.CLERK_SECRET_KEY
        ? await db.select().from(portalUsersTable).orderBy(desc(portalUsersTable.createdAt))
        : users;
    res.json(refreshed.map(userToJson));
  }),
);

router.patch(
  "/admin/users/:id/role",
  requireAuth(),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const targetId = Number(req.params.id);
    if (targetId === actor.id) {
      throw httpError(400, "You cannot change your own role");
    }
    const parsed = UpdatePortalUserRoleBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid role");
    }
    const rows = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, targetId))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "User not found");
    }
    const [updated] = await db
      .update(portalUsersTable)
      .set({ role: parsed.data.role })
      .where(eq(portalUsersTable.id, targetId))
      .returning();
    res.json(userToJson(updated));
  }),
);

router.patch(
  "/admin/users/:id/block",
  requireAuth(),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const targetId = Number(req.params.id);
    if (targetId === actor.id) {
      throw httpError(400, "You cannot block your own account");
    }
    const parsed = UpdatePortalUserBlockBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid block state");
    }
    const rows = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, targetId))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "User not found");
    }
    const [updated] = await db
      .update(portalUsersTable)
      .set({ blocked: parsed.data.blocked })
      .where(eq(portalUsersTable.id, targetId))
      .returning();
    res.json(userToJson(updated));
  }),
);

/**
 * Remove a user from the portal along with everything they own: their reports
 * (and the attachments, messages and notifications on them), messages they
 * authored, and their pending uploads.
 */
router.delete(
  "/admin/users/:id",
  requireAuth(),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const targetId = Number(req.params.id);
    if (targetId === actor.id) {
      throw httpError(400, "You cannot remove your own account");
    }
    const rows = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.id, targetId))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "User not found");
    }
    const target = rows[0];

    const ownedReports = await db
      .select({ id: portalReportsTable.id })
      .from(portalReportsTable)
      .where(eq(portalReportsTable.ownerId, targetId));
    const reportIds = ownedReports.map((r) => r.id);
    // All messages on their reports (any author) plus messages they authored.
    const messageConditions = [eq(reportMessagesTable.authorId, targetId)];
    if (reportIds.length > 0) {
      messageConditions.push(inArray(reportMessagesTable.reportId, reportIds));
    }
    const reportMessages = await db
      .select({ id: reportMessagesTable.id })
      .from(reportMessagesTable)
      .where(or(...messageConditions)!);
    const messageIds = reportMessages.map((m) => m.id);

    // Attachments: anything on their reports, on those messages, or uploaded by them.
    const attachmentConditions = [
      eq(reportAttachmentsTable.uploaderId, targetId),
    ];
    if (reportIds.length > 0) {
      attachmentConditions.push(inArray(reportAttachmentsTable.reportId, reportIds));
    }
    if (messageIds.length > 0) {
      attachmentConditions.push(inArray(reportAttachmentsTable.messageId, messageIds));
    }
    await db.delete(reportAttachmentsTable).where(or(...attachmentConditions)!);

    if (messageIds.length > 0) {
      await db.delete(reportMessagesTable).where(inArray(reportMessagesTable.id, messageIds));
    }
    if (reportIds.length > 0) {
      await db.delete(reportHistoryTable).where(inArray(reportHistoryTable.reportId, reportIds));
      await db.delete(portalNotificationsTable).where(inArray(portalNotificationsTable.reportId, reportIds));
      await db.delete(portalReportsTable).where(inArray(portalReportsTable.id, reportIds));
    }
    await db
      .delete(reportHistoryTable)
      .where(eq(reportHistoryTable.actorId, targetId));
    await db
      .delete(portalNotificationsTable)
      .where(eq(portalNotificationsTable.userId, targetId));
    await db.delete(pendingUploadsTable).where(eq(pendingUploadsTable.uploaderId, targetId));
    await db.delete(portalUsersTable).where(eq(portalUsersTable.id, targetId));

    res.json({ removed: targetId });
  }),
);

/** Clear the entire user database — every account, report, message and notification. */
router.delete(
  "/admin/users",
  requireAuth(),
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const confirmed = (req.body as { confirm?: unknown } | undefined)?.confirm === true;
    if (!confirmed) {
      throw httpError(400, "Confirmation required: send { confirm: true } to clear the user database");
    }
    const counts = await db.transaction(async (tx) => {
      const attachments = (await tx.delete(reportAttachmentsTable).returning({ id: reportAttachmentsTable.id })).length;
      const messages = (await tx.delete(reportMessagesTable).returning({ id: reportMessagesTable.id })).length;
      const history = (await tx.delete(reportHistoryTable).returning({ id: reportHistoryTable.id })).length;
      const notifications = (await tx.delete(portalNotificationsTable).returning({ id: portalNotificationsTable.id })).length;
      const reports = (await tx.delete(portalReportsTable).returning({ id: portalReportsTable.id })).length;
      const pending = (await tx.delete(pendingUploadsTable).returning({ id: pendingUploadsTable.id })).length;
      const counters = (await tx.delete(portalCountersTable).returning({ name: portalCountersTable.name })).length;
      const users = (await tx.delete(portalUsersTable).returning({ id: portalUsersTable.id })).length;
      return { attachments, messages, history, notifications, reports, pending, counters, users };
    });
    res.json({ cleared: true, ...counts });
  }),
);

export default router;
