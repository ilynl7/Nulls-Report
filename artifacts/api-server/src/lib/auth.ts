import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { db, portalUsersTable, type PortalUser } from "@workspace/db";
import { count, eq } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { httpError, portalUserOf, type AuthedRequest } from "./http";

/**
 * Mounts Clerk's request middleware when a secret key is configured.
 * When CLERK_SECRET_KEY is missing the middleware is a no-op and protected
 * routes report a clear 503 instead of crashing.
 */
export function authMiddleware(): RequestHandler {
  const secretKey = process.env.CLERK_SECRET_KEY;
  // Clerk's middleware also requires a publishable key server-side. Prefer
  // the server-side name, but fall back to the frontend value so a single
  // pasted key works for both.
  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }
  return clerkMiddleware({ secretKey, publishableKey });
}

type ClerkAuth = ReturnType<typeof getAuth>;

function claimString(claims: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = claims?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Finds the portal user row for a Clerk session, creating it on first sign-in.
 * Role and profile defaults live here; display name is only back-filled when
 * the user has not customized it.
 */
export async function getOrCreatePortalUser(auth: ClerkAuth): Promise<PortalUser> {
  if (!auth?.userId) {
    throw httpError(401, "Authentication required");
  }
  const userId = auth.userId;
  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  let email = claimString(claims, "email");
  let firstName = claimString(claims, "first_name");
  let lastName = claimString(claims, "last_name");
  let username = claimString(claims, "username");

  // Backfill profile data (especially the email for the admin list) from the
  // Clerk API when the session token doesn't carry it.
  if (!email || !firstName || !lastName || !username) {
    const profile = await fetchClerkProfile(userId);
    if (profile) {
      email = email ?? profile.primaryEmailAddress?.emailAddress ?? undefined;
      firstName = firstName ?? profile.firstName ?? undefined;
      lastName = lastName ?? profile.lastName ?? undefined;
      username = username ?? profile.username ?? undefined;
    }
  }

  const derivedName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    username ||
    email?.split("@")[0] ||
    "Nulls reporter";

  const existing = await db
    .select()
    .from(portalUsersTable)
    .where(eq(portalUsersTable.clerkUserId, userId))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    const updates: Partial<typeof portalUsersTable.$inferInsert> = {};
    if (email && email !== user.email) {
      updates.email = email;
    }
    if (!user.displayName || user.displayName === "Nulls reporter") {
      updates.displayName = derivedName;
    }
    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(portalUsersTable)
        .set(updates)
        .where(eq(portalUsersTable.id, user.id))
        .returning();
      return updated;
    }
    return user;
  }

  try {
    // Bootstrap: the very first account in the system becomes an
    // administrator so the owner can promote moderators from the Admin page.
    const existing = await db
      .select({ n: count() })
      .from(portalUsersTable)
      .limit(1);
    const isFirstAccount = (existing[0]?.n ?? 0) === 0;
    const [created] = await db
      .insert(portalUsersTable)
      .values({
        clerkUserId: userId,
        email,
        displayName: derivedName,
        role: isFirstAccount ? "administrator" : "user",
      })
      .returning();
    return created;
  } catch (err) {
    // Concurrent first sign-in: another request may have created the row.
    const retried = await db
      .select()
      .from(portalUsersTable)
      .where(eq(portalUsersTable.clerkUserId, userId))
      .limit(1);
    if (retried.length > 0) {
      return retried[0];
    }
    throw err;
  }
}

export function requireAuth(): RequestHandler {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const auth = getAuth(req);
      if (!auth?.userId) {
        if (!process.env.CLERK_SECRET_KEY) {
          throw httpError(
            503,
            "Authentication is not configured. Set CLERK_SECRET_KEY in the workspace API Keys and restart.",
          );
        }
        throw httpError(401, "Authentication required");
      }
      const portalUser = await getOrCreatePortalUser(auth);
      if (portalUser.blocked) {
        throw httpError(403, "This account has been blocked. Contact an administrator.");
      }
      req.portalUser = portalUser;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireStaff(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = portalUserOf(req);
      if (user.role === "user") {
        throw httpError(403, "Moderator or administrator access required");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAdmin(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = portalUserOf(req);
      if (user.role !== "administrator") {
        throw httpError(403, "Administrator access required");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function isStaff(user: PortalUser): boolean {
  return user.role !== "user";
}

/**
 * Session tokens don't include profile data (email, names) by default, so
 * fetch the user's profile from the Clerk API to backfill it. Failures are
 * non-fatal — auth still succeeds, the fields are just left unset.
 */
async function fetchClerkProfile(userId: string) {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return null;
    }
    return await clerkClient.users.getUser(userId);
  } catch (err) {
    console.error("[auth] failed to load Clerk profile:", err);
    return null;
  }
}
