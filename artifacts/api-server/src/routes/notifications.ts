import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, portalNotificationsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { notificationToJson } from "../lib/serialize";

const router = Router();

router.get(
  "/notifications",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const rows = await db
      .select()
      .from(portalNotificationsTable)
      .where(eq(portalNotificationsTable.userId, viewer.id))
      .orderBy(desc(portalNotificationsTable.createdAt), desc(portalNotificationsTable.id))
      .limit(100);
    res.json(rows.map(notificationToJson));
  }),
);

router.post(
  "/notifications/:id/read",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(portalNotificationsTable)
      .where(and(eq(portalNotificationsTable.id, id), eq(portalNotificationsTable.userId, viewer.id)))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "Notification not found");
    }
    if (!rows[0].readAt) {
      await db
        .update(portalNotificationsTable)
        .set({ readAt: new Date() })
        .where(eq(portalNotificationsTable.id, id));
    }
    res.status(204).end();
  }),
);

export default router;
