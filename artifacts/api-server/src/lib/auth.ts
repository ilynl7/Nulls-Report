import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  authIdentitiesTable,
  db,
  portalUsersTable,
  type AuthIdentity,
  type PortalUser,
} from "@workspace/db";
import { httpError, portalUserOf, type AuthedRequest } from "./http";
import { destroySession, resolveSession } from "./session";

/**
 * The only accepted authentication providers. An account is created through
 * one of them on first sign-in, and the same provider identity always maps
 * to the same portal account. Every account therefore has trusted auth.
 */
export const TRUSTED_PROVIDERS = new Set(["discord", "nulls_connect"]);

export const AUTH_PROVIDER_LABELS: Record<string, string> = {
  discord: "Discord",
  nulls_connect: "Nulls Connect",
};

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

/**
 * Optional env-configured general administrator, keyed by the account's public
 * tag (e.g. `ADMIN_TAG=A7K4P2` or `ADMIN_TAG=#A7K4P2`). The account keeps its
 * stored role in the database — the env tag only elevates it. Everything else
 * (moderators, blocking, removal) is managed from the administration panel.
 */
const ADMIN_TAG = (process.env.ADMIN_TAG ?? "").trim().replace(/^#/, "");

/** The effective role of a user: the env ADMIN_TAG wins over the stored role. */
export function effectiveRole(user: PortalUser): PortalUser["role"] {
  if (ADMIN_TAG && user.tag === ADMIN_TAG) return "administrator";
  return user.role;
}

export function isAdministrator(user: PortalUser): boolean {
  return effectiveRole(user) === "administrator";
}

// ---------------------------------------------------------------------------
// User tags
// ---------------------------------------------------------------------------

// No I, O, 0, 1, L — avoids ambiguous characters in the generated tag.
const TAG_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAG_LENGTH = 6;

export function generateUserTag(): string {
  let tag = "";
  for (let i = 0; i < TAG_LENGTH; i++) {
    tag += TAG_ALPHABET[Math.floor(Math.random() * TAG_ALPHABET.length)];
  }
  return tag;
}

/** Generates a random permanent tag, retrying on the rare unique collision. */
export async function generateUniqueTag(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tag = generateUserTag();
    const existing = await db
      .select({ id: portalUsersTable.id })
      .from(portalUsersTable)
      .where(eq(portalUsersTable.tag, tag))
      .limit(1);
    if (existing.length === 0) return tag;
  }
  throw httpError(500, "Could not generate a unique user tag. Try again.");
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Resolves the portal session cookie (if any) and attaches the portal user to
 * the request. Public routes stay reachable; protected routes call requireAuth.
 */
export function sessionMiddleware(): RequestHandler {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const session = await resolveSession(req);
      if (session) {
        const rows = await db
          .select()
          .from(portalUsersTable)
          .where(eq(portalUsersTable.id, session.userId))
          .limit(1);
        if (rows.length > 0) {
          // Apply the env ADMIN_TAG elevation so every downstream check and
          // serializer sees the effective role consistently.
          req.portalUser = { ...rows[0], role: effectiveRole(rows[0]) };
          req.portalSessionToken = session.token;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(): RequestHandler {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const user = req.portalUser;
      if (!user) {
        throw httpError(
          401,
          "Authentication required. Sign in to your portal account to continue.",
        );
      }
      if (user.blocked) {
        throw httpError(403, "This account has been blocked. Contact an administrator.");
      }
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
      if (effectiveRole(user) === "user") {
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
      if (!isAdministrator(user)) {
        throw httpError(403, "Administrator access required");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function isStaff(user: PortalUser): boolean {
  return effectiveRole(user) !== "user";
}

/**
 * Fresh databases have no staff. The very first account ever created becomes
 * the administrator (documented bootstrap); every later account is a normal
 * user. After a "clear database" the next sign-up gets the role again.
 */
export async function firstAccountRole(): Promise<"administrator" | "user"> {
  const rows = await db.select({ id: portalUsersTable.id }).from(portalUsersTable).limit(1);
  return rows.length === 0 ? "administrator" : "user";
}

// ---------------------------------------------------------------------------
// Auth identities
// ---------------------------------------------------------------------------

export async function listIdentities(userId: number): Promise<AuthIdentity[]> {
  return db
    .select()
    .from(authIdentitiesTable)
    .where(eq(authIdentitiesTable.portalUserId, userId))
    .orderBy(authIdentitiesTable.createdAt);
}

export async function findIdentity(
  provider: string,
  providerUserId: string,
): Promise<AuthIdentity | null> {
  const rows = await db
    .select()
    .from(authIdentitiesTable)
    .where(
      and(
        eq(authIdentitiesTable.provider, provider),
        eq(authIdentitiesTable.providerUserId, providerUserId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Inserts a provider identity; returns the existing row if it already exists. */
export async function linkIdentity(
  provider: string,
  providerUserId: string,
  portalUserId: number,
  metadata: Record<string, unknown> = {},
): Promise<AuthIdentity> {
  const [inserted] = await db
    .insert(authIdentitiesTable)
    .values({ provider, providerUserId, portalUserId, metadata })
    .onConflictDoNothing({
      target: [authIdentitiesTable.provider, authIdentitiesTable.providerUserId],
    })
    .returning();
  if (inserted) return inserted;
  const existing = await findIdentity(provider, providerUserId);
  if (!existing) {
    throw httpError(500, "Could not link authentication method");
  }
  // Refresh metadata when the identity is already linked to this account.
  if (existing.portalUserId === portalUserId) {
    await db
      .update(authIdentitiesTable)
      .set({ metadata })
      .where(eq(authIdentitiesTable.id, existing.id));
    return { ...existing, metadata };
  }
  return existing;
}

/** Removes a linked identity from an account. */
export async function unlinkIdentity(
  portalUserId: number,
  provider: string,
): Promise<boolean> {
  const rows = await db
    .delete(authIdentitiesTable)
    .where(
      and(
        eq(authIdentitiesTable.portalUserId, portalUserId),
        eq(authIdentitiesTable.provider, provider),
      ),
    )
    .returning();
  return rows.length > 0;
}

export async function hasTrustedAuth(userId: number): Promise<boolean> {
  const identities = await listIdentities(userId);
  return identities.some((i) => TRUSTED_PROVIDERS.has(i.provider));
}

/** Server-side enforcement: reports require at least one trusted method. */
export async function assertTrustedAuth(user: PortalUser): Promise<void> {
  if (!(await hasTrustedAuth(user.id))) {
    throw httpError(
      403,
      "Authentication required. Connect Discord or Nulls Connect before submitting a report.",
    );
  }
}

export async function destroyCurrentSession(req: AuthedRequest): Promise<void> {
  if (req.portalSessionToken) {
    await destroySession(req.portalSessionToken);
  }
}
