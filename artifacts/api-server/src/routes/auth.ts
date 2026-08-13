import { randomBytes } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, portalUsersTable } from "@workspace/db";
import {
  findIdentity,
  firstAccountRole,
  generateUniqueTag,
  linkIdentity,
  unlinkIdentity,
} from "../lib/auth";
import { asyncHandler, httpError, portalUserOf, type AuthedRequest } from "../lib/http";
import { userToJson } from "../lib/serialize";
import { clearSessionCookie, createSession, setSessionCookie } from "../lib/session";
import { oauthCallbackUrl, publicUrl } from "../lib/url";

const router = Router();

const OAUTH_STATE_COOKIE = "oauth_state";

/** The exact redirect URI registered in the Discord developer portal. */
function discordRedirectUri(req: AuthedRequest): string {
  return oauthCallbackUrl(req, "/api/auth/discord/callback");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function providerConfig(provider: "discord"): { clientId: string; clientSecret: string } {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw httpError(503, "Discord authentication is not configured yet.");
  }
  return { clientId, clientSecret };
}

async function exchangeCode(
  provider: "discord",
  code: string,
  redirectUri: string,
): Promise<string> {
  const { clientId, clientSecret } = providerConfig(provider);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw httpError(400, `OAuth exchange failed${data.error ? `: ${data.error}` : ""}`);
  }
  return data.access_token;
}

async function discordProfile(accessToken: string): Promise<{
  providerUserId: string;
  metadata: Record<string, unknown>;
}> {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
  if (!res.ok || !data.id) throw httpError(400, "Could not load your Discord profile");
  return {
    providerUserId: data.id,
    metadata: {
      username: data.global_name || data.username || "Discord account",
      handle: data.username ?? null,
    },
  };
}

/**
 * Shared Discord callback logic: the provider identity maps to exactly one
 * portal account — never a new account per provider. First sign-in creates
 * the account automatically (display name from Discord, random public tag).
 */
async function discordCallbackFlow(
  req: AuthedRequest,
  res: Parameters<Parameters<typeof asyncHandler>[0]>[1],
  code: string,
  state: string,
): Promise<void> {
  const stateCookie = (req as AuthedRequest & { cookies?: Record<string, string | undefined> })
    .cookies?.[OAUTH_STATE_COOKIE];
  let expected: { state?: string; returnTo?: string } = {};
  try {
    expected = stateCookie ? (JSON.parse(stateCookie) as typeof expected) : {};
  } catch {
    expected = {};
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });

  const frontend = expected.returnTo ?? "/dashboard";
  const authErrorRedirect = (reason: string) =>
    `/auth?auth=error&reason=${reason}&returnTo=${encodeURIComponent(frontend)}`;
  if (!expected.state || expected.state !== state || !code) {
    return res.redirect(authErrorRedirect("oauth"));
  }

  try {
    const redirectUri = discordRedirectUri(req);
    const accessToken = await exchangeCode("discord", code, redirectUri);
    const { providerUserId, metadata } = await discordProfile(accessToken);

    let user = req.portalUser ?? null;
    const existing = await findIdentity("discord", providerUserId);

    if (user) {
      // Linking while signed in — the identity must not belong to someone else.
      if (existing && existing.portalUserId !== user.id) {
        return res.redirect(authErrorRedirect("linked"));
      }
      await linkIdentity("discord", providerUserId, user.id, metadata);
    } else if (existing) {
      // Known identity → authenticate that portal account.
      const owners = await db
        .select()
        .from(portalUsersTable)
        .where(eq(portalUsersTable.id, existing.portalUserId))
        .limit(1);
      if (owners.length === 0) throw httpError(500, "Linked account no longer exists");
      user = owners[0];
    } else {
      // First-time sign-in → create the portal account automatically. In a
      // fresh database the very first account becomes the administrator.
      const name =
        typeof metadata.username === "string" && metadata.username.trim()
          ? metadata.username.trim().slice(0, 80)
          : "Nulls reporter";
      const [created] = await db
        .insert(portalUsersTable)
        .values({
          tag: await generateUniqueTag(),
          displayName: name,
          role: await firstAccountRole(),
        })
        .returning();
      user = created;
      await linkIdentity("discord", providerUserId, created.id, metadata);
    }

    if (user.blocked) {
      return res.redirect(authErrorRedirect("blocked"));
    }
    const token = await createSession(user.id);
    setSessionCookie(res, req, token);
    return res.redirect(frontend);
  } catch (err) {
    console.error("[oauth:discord] callback failed:", err);
    return res.redirect(authErrorRedirect("oauth"));
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

router.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    const { destroySession } = await import("../lib/session");
    if (authed.portalSessionToken) {
      await destroySession(authed.portalSessionToken);
    }
    clearSessionCookie(res, authed);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Discord OAuth
// ---------------------------------------------------------------------------

router.get(
  "/auth/discord/start",
  asyncHandler(async (req, res) => {
    const { clientId } = providerConfig("discord");
    const returnTo = safeReturnTo(String(req.query.returnTo ?? ""));
    const state = randomBytes(24).toString("hex");
    res.cookie(
      OAUTH_STATE_COOKIE,
      JSON.stringify({ state, returnTo }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
        ...(process.env.NODE_ENV === "production" ||
        req.secure ||
        String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https"
          ? { secure: true }
          : {}),
      },
    );
    const redirectUri = encodeURIComponent(discordRedirectUri(req));
    res.redirect(
      302,
      `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`,
    );
  }),
);

router.get(
  "/auth/discord/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const providerError = typeof req.query.error === "string" ? req.query.error : "";
    if (providerError) {
      // Discord bounced the user back without a code (e.g. access_denied or an
      // invalid redirect_uri mismatch). Clear the CSRF state and surface a
      // friendly error instead of a dead end.
      res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
      const reason = providerError === "access_denied" ? "denied" : "oauth";
      return res.redirect(`/auth?auth=error&reason=${reason}`);
    }
    await discordCallbackFlow(req, res, code, state);
  }),
);

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

const DISCONNECTABLE = new Set(["discord", "nulls_connect"]);

router.post(
  "/auth/methods/:provider/disconnect",
  asyncHandler(async (req, res) => {
    const user = portalUserOf(req);
    const provider = String(req.params.provider ?? "");
    if (!DISCONNECTABLE.has(provider)) {
      throw httpError(400, "Unknown authentication method");
    }
    const removed = await unlinkIdentity(user.id, provider);
    if (!removed) {
      throw httpError(400, "That authentication method is not connected");
    }
    // The account itself is never deleted when a provider is disconnected —
    // only the link is removed.
    res.json(await loadCurrentUser(user.id));
  }),
);

async function loadCurrentUser(userId: number) {
  const rows = await db.select().from(portalUsersTable).where(eq(portalUsersTable.id, userId)).limit(1);
  if (rows.length === 0) throw httpError(404, "Account not found");
  const identities = await import("../lib/auth").then((m) => m.listIdentities(userId));
  return userToJson(rows[0], identities);
}

export default router;

// `publicUrl` is re-exported for the config route so the frontend can show the
// exact public origin the server derives OAuth callbacks from (non-secret).
export { publicUrl };
