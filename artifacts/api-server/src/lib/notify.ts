import { db, portalNotificationsTable, portalUsersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

interface NotificationInput {
  userId: number;
  reportId?: number | null;
  type: string;
  title: string;
  body: string;
}

export async function createNotification(input: NotificationInput): Promise<void> {
  await db.insert(portalNotificationsTable).values({
    userId: input.userId,
    reportId: input.reportId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
  });
}

/**
 * Creates a notification for every moderator/administrator, optionally
 * excluding one user (e.g. the actor who triggered the event).
 */
export async function notifyStaff(
  input: Omit<NotificationInput, "userId"> & { exceptUserId?: number },
): Promise<void> {
  const staff = await db
    .select({ id: portalUsersTable.id })
    .from(portalUsersTable)
    .where(inArray(portalUsersTable.role, ["moderator", "administrator"]));
  if (staff.length === 0) {
    return;
  }
  const targets = staff
    .filter((member) => member.id !== input.exceptUserId)
    .map((member) => ({
      userId: member.id,
      reportId: input.reportId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
    }));
  if (targets.length === 0) {
    return;
  }
  await db.insert(portalNotificationsTable).values(targets);
}
