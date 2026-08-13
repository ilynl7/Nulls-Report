import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Request, Response } from "express";
import { db, sessionsTable } from "@workspace/db";

export const SESSION_COOKIE = "portal_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Extend the session's expiry when less than this much time remains. */
const ROLLING_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Cookie flags. `secure` follows the actual request scheme (X-Forwarded-Proto
 * in front of proxies; never NODE_ENV) so cookies work on https previews, on
 * the Docker edition, and on plain-http hosts alike — a `Secure` cookie on an
 * http page is silently rejected by browsers, which breaks login entirely.
 * The cookie only ever holds the opaque session token — all identity data
 * stays server-side.
 */
export function cookieOptions(req: Request): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
} {
  const forwarded = String(req.headers["x-forwarded-proto"] ?? "")
    .split(",")[0]
    .trim();
  const secure = req.secure || forwarded === "https";
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

export async function createSession(userId: number): Promise<string> {
  const token = newSessionToken();
  await db.insert(sessionsTable).values({
    tokenHash: hashToken(token),
    portalUserId: userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response, req: Request): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

/**
 * Resolves a valid session from the request cookie (hash lookup + expiry),
 * renewing the expiry on activity. Returns the session token + user id, or
 * null when the cookie is missing/expired/unknown.
 */
export async function resolveSession(
  req: Request,
): Promise<{ token: string; userId: number } | null> {
  const cookies = (req as Request & { cookies?: Record<string, string | undefined> }).cookies;
  const token = cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const rows = await db
    .select()
    .from(sessionsTable)
    .where(
      and(eq(sessionsTable.tokenHash, hashToken(token)), gt(sessionsTable.expiresAt, new Date())),
    )
    .limit(1);
  if (rows.length === 0) return null;

  const session = rows[0];
  // Rolling expiry: extend when the session is getting old (throttled to once
  // per request at most; this is cheap enough for this app's scale).
  if (session.expiresAt.getTime() - Date.now() < ROLLING_REFRESH_MS) {
    await db
      .update(sessionsTable)
      .set({
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        lastUsedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));
  } else {
    await db
      .update(sessionsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessionsTable.id, session.id));
  }

  return { token, userId: session.portalUserId };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
}
