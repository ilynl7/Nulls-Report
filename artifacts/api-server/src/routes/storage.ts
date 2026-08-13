import { randomUUID } from "node:crypto";
import path from "node:path";
import express, { Router } from "express";
import { RequestUploadUrlBody } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";
import { db, pendingUploadsTable, reportAttachmentsTable } from "@workspace/db";
import { assertTrustedAuth, requireAuth } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { assertCanViewReport, getReportEntity } from "../lib/access";
import {
  createUploadUrl,
  localUploadExists,
  MAX_UPLOAD_BYTES,
  objectStream,
  saveLocalUpload,
  storageMode,
} from "../lib/storage";

const router = Router();

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").trim();
  return base.length > 0 ? base.slice(0, 120) : "file";
}

/**
 * Request an upload slot. Returns a URL the client PUTs the raw bytes to and
 * an objectPath that is later attached to a report (via CreateReportInput.attachmentIds).
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    // Upload slots are only granted to accounts with a trusted authentication
    // method — an unauthenticated account cannot stage files for a report.
    await assertTrustedAuth(viewer);
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, "Invalid upload request");
    }
    const { name, size, contentType } = parsed.data;
    if (size > MAX_UPLOAD_BYTES) {
      throw httpError(400, "File exceeds the 50 MB upload limit");
    }
    const objectPath = `attachments/${viewer.id}/${randomUUID()}/${sanitizeFileName(name)}`;

    const [pending] = await db
      .insert(pendingUploadsTable)
      .values({
        uploaderId: viewer.id,
        objectPath,
        fileName: name.slice(0, 255),
        contentType,
        size,
      })
      .returning();

    const uploadURL =
      storageMode() === "s3"
        ? await createUploadUrl({ objectPath, contentType, size })
        : // Relative so the browser PUTs to the same origin it loaded from
          // (Vite proxies /api to the API server). An absolute URL here would
          // point at the API's internal host, which the browser can't reach.
          `/api/storage/uploads/${pending.id}`;

    res.json({ id: pending.id, uploadURL, objectPath });
  }),
);

/** Local-mode ingest endpoint: raw byte PUT for the returned upload URL. */
router.put(
  "/storage/uploads/:id",
  express.raw({ type: () => true, limit: `${MAX_UPLOAD_BYTES + 1024 * 1024}` }),
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (storageMode() !== "local") {
      throw httpError(404, "Not found");
    }
    const viewer = portalUserOf(req);
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(pendingUploadsTable)
      .where(and(eq(pendingUploadsTable.id, id), eq(pendingUploadsTable.uploaderId, viewer.id)))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "Upload not found");
    }
    const pending = rows[0];
    const data = req.body;
    if (!Buffer.isBuffer(data)) {
      throw httpError(400, "Upload body must be raw bytes");
    }
    if (data.length !== pending.size) {
      throw httpError(
        400,
        `Upload size mismatch: expected ${pending.size} bytes, received ${data.length}`,
      );
    }
    await saveLocalUpload(pending.objectPath, data);
    res.json({ ok: true });
  }),
);

/**
 * Serve an attachment with permission checks: the report owner or any staff
 * member may download files attached to a report they can access.
 */
/**
 * Serve a profile picture. Public on purpose: <img> tags can't send auth
 * headers, and avatars contain no private data.
 */
router.get(
  "/storage/avatars/*splat",
  asyncHandler(async (req, res) => {
    const rawPath = (req.params as { splat?: string | string[] }).splat;
    const objectPath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath ?? "");
    if (!objectPath.startsWith("avatars/")) {
      throw httpError(404, "Avatar not found");
    }
    if (storageMode() === "local" && !(await localUploadExists(objectPath))) {
      throw httpError(404, "Avatar not found");
    }
    const stream = await objectStream(objectPath);
    if (stream.kind === "redirect") {
      res.redirect(302, stream.url);
      return;
    }
    const ext = objectPath.split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(stream.data);
  }),
);

router.get(
  "/storage/objects/*splat",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const rawPath = (req.params as { splat?: string | string[] }).splat;
    const objectPath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath ?? "");
    if (objectPath.length === 0) {
      throw httpError(404, "Attachment not found");
    }

    const rows = await db
      .select()
      .from(reportAttachmentsTable)
      .where(eq(reportAttachmentsTable.objectPath, objectPath))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, "Attachment not found");
    }
    const attachment = rows[0];

    if (storageMode() === "local" && !(await localUploadExists(objectPath))) {
      throw httpError(404, "Attachment file not found");
    }

    const report = await getReportEntity(attachment.reportId);
    // The report's effective visibility decides who can fetch its files:
    // public reports (and their attachments) are community-visible; private,
    // hidden and risk-restricted reports are reporter + staff only.
    assertCanViewReport(report, viewer);

    const stream = await objectStream(objectPath);
    if (stream.kind === "redirect") {
      res.redirect(302, stream.url);
      return;
    }

    const safeName = attachment.fileName.replace(/[\r\n"]/g, "").replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", attachment.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(stream.data.length));
    res.setHeader("Content-Disposition", `attachment; filename="${safeName || "download"}"`);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.send(stream.data);
  }),
);

export default router;
