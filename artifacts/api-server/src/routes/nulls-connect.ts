import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, portalUsersTable } from "@workspace/db";
import { findIdentity, firstAccountRole, generateUniqueTag, linkIdentity } from "../lib/auth";
import { asyncHandler, httpError, type AuthedRequest } from "../lib/http";
import { userToJson } from "../lib/serialize";
import { createSession, setSessionCookie } from "../lib/session";

const router = Router();

/**
 * Nulls Connect authentication.
 *
 * The portal proxies the public Nulls Connect API (connect.nulls.gg)
 * server-side so the browser never talks to it directly. Authentication is a
 * one-shot flow: the user authenticates through their email, Nulls Connect
 * returns their identity, and the portal creates/links the portal account and
 * establishes the session immediately.
 *
 * The identity is the **general Nulls account** (account id / verified email),
 * NOT a game account. Game accounts are separate optional data attached to
 * that identity and are never selected, required, or used as the auth key.
 * The portal supports multiple Nulls games later — authentication stays the
 * same, game accounts just grow as metadata.
 *
 * Only the linked identity (account id/email + display info) is stored as an
 * auth identity — never the Nulls Connect auth token.
 */
const NC_BASE = "https://connect.nulls.gg";
const NC_HEADERS: Record<string, string> = {
  Accept: "application/json",
  Origin: "https://connect.nulls.gg",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  Referer: "https://connect.nulls.gg/",
  "Accept-Language": "ru",
};

async function ncJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { ...NC_HEADERS, ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail =
      (data as { error_type?: string } | null)?.error_type ??
      (typeof data === "string" ? data : null) ??
      `HTTP ${res.status}`;
    throw httpError(res.status >= 500 ? 502 : 400, `Nulls Connect error: ${detail}`);
  }
  return data;
}

function validEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 200) {
    throw httpError(400, "Enter a valid email address");
  }
  return email;
}

/**
 * Builds the login.v2 URL. The account-level flow deliberately omits the
 * game parameter so the returned token authenticates the GENERAL Nulls
 * account (the email identity), never a specific game player. Game-scoped
 * tokens are not used: they would make the portal identity key to a player
 * account instead of the person's Nulls account.
 */
function loginUrl(email: string, pin?: string): string {
  const params = new URLSearchParams({ email, locale: "ru" });
  if (pin) params.set("pin", pin);
  return `${NC_BASE}/api/auth/login.v2?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Step 1 — request a login code for the email
// ---------------------------------------------------------------------------

router.post(
  "/nulls-connect/auth",
  asyncHandler(async (req, res) => {
    const email = validEmail(req.body?.email);
    // Always the account-level flow: the token authenticates the general
    // Nulls account (email), not a specific game player.
    return res.json(await ncJson(loginUrl(email)));
  }),
);

// ---------------------------------------------------------------------------
// Step 2 — verify the code from the email, get the auth token
// ---------------------------------------------------------------------------

router.post(
  "/nulls-connect/verify",
  asyncHandler(async (req, res) => {
    const email = validEmail(req.body?.email);
    const pin = String(req.body?.pin ?? "").trim();
    // Numeric code (up to 6 digits) sent to the account email.
    if (!/^\d{1,6}$/.test(pin)) {
      throw httpError(400, "Enter the code from your email");
    }
    // Always the account-level flow — same as the /auth step.
    return res.json(await ncJson(loginUrl(email, pin)));
  }),
);

// ---------------------------------------------------------------------------
// Step 3 — complete authentication with the token
// ---------------------------------------------------------------------------

type AccountIdentity = {
  accountId: string;
  name: string | null;
  email: string;
};

/** Picks the first present value from a list of candidate keys. */
function pick(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Resolves the general Nulls account behind the token. Tries the account-level
 * "me" endpoints first (the same API family as /api/me/avatar); if none are
 * available the verified email — which the user just authenticated with the
 * code from their inbox — becomes the stable identity.
 */
async function fetchAccountIdentity(token: string, fallbackEmail: string): Promise<AccountIdentity> {
  const attempts = ["/api/me", "/api/account", "/api/user"].map((path) => `${NC_BASE}${path}`);
  for (const url of attempts) {
    try {
      const raw = (await ncJson(url, { Authorization: `Bearer ${token}` })) as
        | Record<string, unknown>
        | null
        | undefined;
      if (!raw || typeof raw !== "object") continue;
      const data = raw as Record<string, unknown>;
      const accountId = pick(data, ["account_id", "id", "user_id", "profile_id", "uid"]);
      const email = pick(data, ["email", "mail", "login"]);
      const name = pick(data, ["name", "display_name", "username", "handle", "nick"]);
      if (accountId || email) {
        return {
          accountId: String(accountId ?? email ?? fallbackEmail),
          name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : null,
          email: String(email ?? fallbackEmail),
        };
      }
    } catch {
      // Try the next endpoint.
    }
  }
  // No account endpoint available — the verified email is the stable identity.
  return { accountId: fallbackEmail, name: null, email: fallbackEmail };
}

type GameLink = {
  game: string;
  playerId: string;
  name: string;
  tag?: string;
};

/** Normalizes a raw link row into { game, playerId, name, tag }. */
function normalizeLink(raw: unknown, game: string): GameLink | null {
  const item = raw as {
    player_id?: string | number;
    game?: string;
    player_info?: { name?: string; tag?: string };
  };
  const playerId = String(item?.player_id ?? "");
  if (!playerId) return null;
  return {
    game: item?.game || game,
    playerId,
    name:
      item.player_info?.name ||
      item.player_info?.tag ||
      `Nulls player ${playerId}`,
    tag: item.player_info?.tag,
  };
}

/**
 * Best-effort: lists the game accounts linked to the account. This is pure
 * metadata enrichment — game accounts are NOT what authentication is about
 * and their absence never blocks login.
 */
async function fetchGameAccounts(token: string): Promise<GameLink[]> {
  const attempts: Array<{ game: string; url: string }> = [
    { game: "laser", url: `${NC_BASE}/api/games/links` },
    { game: "laser", url: `${NC_BASE}/api/games/links?game=laser` },
  ];
  for (const attempt of attempts) {
    try {
      const data = (await ncJson(attempt.url, {
        Authorization: `Bearer ${token}`,
      })) as { links?: unknown[] } | unknown[] | null;
      const rows = Array.isArray(data)
        ? data
        : Array.isArray((data as { links?: unknown[] })?.links)
          ? (data as { links: unknown[] }).links
          : [];
      const links = rows
        .map((row) => normalizeLink(row, attempt.game))
        .filter((l): l is GameLink => l !== null);
      if (links.length > 0) return links;
    } catch {
      // Try the next variant.
    }
  }
  return [];
}

router.post(
  "/nulls-connect/complete",
  asyncHandler(async (req, res) => {
    const viewer = (req as AuthedRequest).portalUser ?? null;
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      throw httpError(400, "Missing Nulls Connect token");
    }
    // The email the user just verified with the code from their inbox. It is
    // the stable identity when no account endpoint is available.
    const email = validEmail(req.body?.email);

    const identity = await fetchAccountIdentity(token, email);
    const gameAccounts = await fetchGameAccounts(token).catch(() => []);

    const metadata = {
      name: identity.name,
      email: identity.email,
      accountId: identity.accountId,
      gameAccounts,
    };

    let user = viewer;
    const existing = await findIdentity("nulls_connect", identity.accountId);

    if (user) {
      // Linking while signed in — the identity must not belong to someone else.
      if (existing && existing.portalUserId !== user.id) {
        throw httpError(409, "That Nulls Connect account is already linked to another portal account");
      }
      await linkIdentity("nulls_connect", identity.accountId, user.id, metadata);
    } else if (existing) {
      // Known identity → authenticate that portal account.
      const owners = await db
        .select()
        .from(portalUsersTable)
        .where(eq(portalUsersTable.id, existing.portalUserId))
        .limit(1);
      if (owners.length === 0) throw httpError(500, "Linked account no longer exists");
      user = owners[0];
      await linkIdentity("nulls_connect", identity.accountId, user.id, metadata);
    } else {
      // First-time sign-in with Nulls Connect → create the portal account.
      // In a fresh database the very first account becomes the administrator.
      const [created] = await db
        .insert(portalUsersTable)
        .values({
          tag: await generateUniqueTag(),
          displayName: identity.name ?? identity.email.split("@")[0] ?? "Nulls account",
          role: await firstAccountRole(),
        })
        .returning();
      user = created;
      await linkIdentity("nulls_connect", identity.accountId, created.id, metadata);
    }

    if (user.blocked) {
      throw httpError(403, "This account has been blocked. Contact an administrator.");
    }

    // Always mint a session when this flow is used to sign in (no session
    // yet). A signed-in user linking a second method keeps their session.
    if (!viewer) {
      const sessionToken = await createSession(user.id);
      setSessionCookie(res, req, sessionToken);
    }

    const { listIdentities } = await import("../lib/auth");
    res.json(userToJson(user, await listIdentities(user.id)));
  }),
);

export default router;
