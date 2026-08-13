import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { UpdateCurrentUserBody } from "@workspace/api-zod";
import { db, portalUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { listIdentities, requireAuth } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { userToJson } from "../lib/serialize";
import { saveObject } from "../lib/storage";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const router = Router();

router.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = portalUserOf(req);
    res.json(userToJson(user, await listIdentities(user.id)));
  }),
);

router.patch(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = UpdateCurrentUserBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid account details");
    }
    const { displayName, preferences } = parsed.data;
    if (displayName === undefined && preferences === undefined) {
      throw httpError(400, "Provide at least one field to update");
    }
    const actor = portalUserOf(req);
    const updates: Partial<typeof portalUsersTable.$inferInsert> = {};
    if (displayName !== undefined && displayName.trim()) {
      updates.displayName = displayName.trim().slice(0, 80);
    }
    if (preferences !== undefined) {
      updates.preferences = preferences;
    }
    const [updated] = await db
      .update(portalUsersTable)
      .set(updates)
      .where(eq(portalUsersTable.id, actor.id))
      .returning();
    res.json(userToJson(updated, await listIdentities(actor.id)));
  }),
);

/** Upload a profile picture. Raw image bytes in the body, image/* content type. */
router.post(
  "/me/avatar",
  express.raw({ type: () => true, limit: `${MAX_AVATAR_BYTES + 1024 * 1024}` }),
  requireAuth(),
  asyncHandler(async (req, res) => {
    const actor = portalUserOf(req);
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) {
      throw httpError(400, "Upload body must be raw image bytes");
    }
    if (data.length > MAX_AVATAR_BYTES) {
      throw httpError(400, "Avatar exceeds the 5 MB limit");
    }
    const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!AVATAR_TYPES.has(contentType)) {
      throw httpError(400, "Avatar must be a JPEG, PNG, WebP or GIF image");
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[contentType];
    const objectPath = `avatars/${actor.id}/${randomUUID()}.${ext}`;
    await saveObject(objectPath, data, contentType);
    const [updated] = await db
      .update(portalUsersTable)
      .set({ avatarPath: objectPath })
      .where(eq(portalUsersTable.id, actor.id))
      .returning();
    res.json(userToJson(updated, await listIdentities(actor.id)));
  }),
);

export default router;
