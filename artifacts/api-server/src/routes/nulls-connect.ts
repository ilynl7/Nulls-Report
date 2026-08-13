import { Router } from "express";
import { eq } from "drizzle-orm";
import { authIdentitiesTable, db, portalUsersTable } from "@workspace/db";
import { findIdentity, firstAccountRole, generateUniqueTag, linkIdentity } from "../lib/auth";
import { asyncHandler, httpError, type AuthedRequest } from "../lib/http";
import { userToJson } from "../lib/serialize";
import { createSession, setSessionCookie } from "../lib/session";

const router = Router();

/**
 * Nulls Connect authentication.
 *
 * The portal proxies the public Nulls Connect API (connect.nulls.gg)
 * server-side so the browser never talks to it directly.
 *
 * Flow (restored account-picker version):
 *   1. POST /nulls-connect/auth      { email }         → pin_required | token
 *   2. POST /nulls-connect/verify    { email, pin }    → token
 *   3. POST /nulls-connect/links     { token }         → the user's game accounts
 *   4. POST /nulls-connect/complete  { token, email, playerId } → chosen game
 *      account becomes the portal identity → creates/links the portal account,
 *      establishes the session.
 *
 * The `game=laser` (Null's Brawl) parameter on the Nulls Connect login is
 * REQUIRED: the token it returns is scoped to the game-account family, which
 * is what lets us list the user's actual game accounts and let them CHOOSE
 * one. No account is ever picked implicitly — the user always sees the picker
 * after entering their PIN.
 *
 * Only the linked player identity (player id + name/tag) is stored as an auth
 * identity — never the Nulls Connect auth token.
 */
const NC_BASE = "https://connect.nulls.gg";
const NC_GAME = "laser";
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

/** login.v2 for the game-account family — the token can list real game accounts. */
function loginUrl(email: string, pin?: string): string {
  const params = new URLSearchParams({ email, game: NC_GAME, locale: "ru" });
  if (pin) params.set("pin", pin);
  return `${NC_BASE}/api/auth/login.v2?${params.toString()}`;
}

type PlayerAccount = {
  playerId: string;
  game: string;
  name: string;
  tag: string | null;
};

function normalizeAccount(raw: unknown): PlayerAccount | null {
  const item = raw as {
    player_id?: string | number;
    game?: string;
    player_info?: { name?: string; tag?: string };
  };
  const playerId = String(item?.player_id ?? "");
  if (!playerId) return null;
  const info = item.player_info ?? {};
  const name = info.name || info.tag || `Nulls player ${playerId}`;
  return {
    playerId,
    game: item.game || NC_GAME,
    name,
    tag: info.tag ?? null,
  };
}

/** The game accounts owned by this token — what the picker shows. */
async function fetchPlayerAccounts(token: string): Promise<PlayerAccount[]> {
  const data = (await ncJson(`${NC_BASE}/api/games/links?game=${NC_GAME}`, {
    Authorization: `Bearer ${token}`,
  })) as { links?: unknown[] } | unknown[] | null;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { links?: unknown[] })?.links)
      ? (data as { links: unknown[] }).links
      : [];
  return rows.map(normalizeAccount).filter((a): a is PlayerAccount => a !== null);
}

/** Verifies the chosen player really belongs to this token. */
async function validatePlayer(token: string, playerId: string): Promise<PlayerAccount> {
  const accounts = await fetchPlayerAccounts(token);
  const match = accounts.find((a) => a.playerId === playerId);
  if (!match) {
    throw httpError(403, "That account does not belong to this Nulls Connect token");
  }
  return match;
}

// ---------------------------------------------------------------------------
// Step 1 — request a login code for the email
// ---------------------------------------------------------------------------

router.post(
  "/nulls-connect/auth",
  asyncHandler(async (req, res) => {
    const email = validEmail(req.body?.email);
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
    return res.json(await ncJson(loginUrl(email, pin)));
  }),
);

// ---------------------------------------------------------------------------
// Step 3 — list the game accounts the user can pick
// ---------------------------------------------------------------------------

router.post(
  "/nulls-connect/links",
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      throw httpError(400, "Missing Nulls Connect token");
    }
    return res.json({ links: await fetchPlayerAccounts(token) });
  }),
);

// ---------------------------------------------------------------------------
// Step 4 — complete authentication with the chosen game account
// ---------------------------------------------------------------------------

router.post(
  "/nulls-connect/complete",
  asyncHandler(async (req, res) => {
    const viewer = (req as AuthedRequest).portalUser ?? null;
    const token = String(req.body?.token ?? "").trim();
    const playerId = String(req.body?.playerId ?? "").trim();
    const email = validEmail(req.body?.email);
    if (!token || !playerId) {
      throw httpError(400, "Missing Nulls Connect account details");
    }

    // The chosen game account is the portal identity for this provider.
    const account = await validatePlayer(token, playerId);
    const metadata = {
      playerId: account.playerId,
      playerName: account.name,
      playerTag: account.tag ?? null,
      game: account.game,
      email,
    };

    let user = viewer;
    let existing = await findIdentity("nulls_connect", account.playerId);

    // Continuity: if the same email already has a Nulls identity on another
    // portal account (e.g. from the earlier account-level flow), reuse that
    // account instead of silently creating a duplicate for the same person.
    if (!existing && !viewer) {
      const all = await db
        .select()
        .from(authIdentitiesTable)
        .where(eq(authIdentitiesTable.provider, "nulls_connect"));
      const emailMatch = all.find(
        (i) => (i.metadata as { email?: string } | null)?.email === email,
      );
      if (emailMatch) existing = emailMatch;
    }

    if (user) {
      // Linking while signed in — the identity must not belong to someone else.
      if (existing && existing.portalUserId !== user.id) {
        throw httpError(
          409,
          "That Nulls Connect account is already linked to another portal account",
        );
      }
      await linkIdentity("nulls_connect", account.playerId, user.id, metadata);
    } else if (existing) {
      // Known identity → authenticate that portal account.
      const owners = await db
        .select()
        .from(portalUsersTable)
        .where(eq(portalUsersTable.id, existing.portalUserId))
        .limit(1);
      if (owners.length === 0) throw httpError(500, "Linked account no longer exists");
      user = owners[0];
      await linkIdentity("nulls_connect", account.playerId, user.id, metadata);
    } else {
      // First-time sign-in with Nulls Connect → create the portal account.
      // In a fresh database the very first account becomes the administrator.
      const [created] = await db
        .insert(portalUsersTable)
        .values({
          tag: await generateUniqueTag(),
          displayName: account.name.slice(0, 80),
          role: await firstAccountRole(),
        })
        .returning();
      user = created;
      await linkIdentity("nulls_connect", account.playerId, created.id, metadata);
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
