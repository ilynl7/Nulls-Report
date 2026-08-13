import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, portalUsersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { asyncHandler, httpError, portalUserOf } from "../lib/http";
import { userToJson } from "../lib/serialize";

const router = Router();

/**
 * Nulls Connect integration. The portal proxies the public Nulls Connect API
 * (connect.nulls.gg) server-side so the browser never talks to it directly,
 * and only the linked player identity (player id + name) is stored on the
 * portal user — never the Nulls Connect auth token.
 *
 * Flow (mirrors the official client):
 *   1. POST /nulls-connect/auth      { email }              -> pin_required | token
 *   2. POST /nulls-connect/verify    { email, pin }         -> token
 *   3. POST /nulls-connect/links     { token }              -> [{ player_id, player_info }]
 *   4. POST /nulls-connect/link      { token, playerId }    -> saves the link
 *   5. POST /nulls-connect/refresh   { token }              -> refresh game tokens
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

router.post(
  "/nulls-connect/auth",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const email = validEmail(req.body?.email);
    const url = `${NC_BASE}/api/auth/login.v2?email=${encodeURIComponent(email)}&game=laser&locale=ru`;
    res.json(await ncJson(url));
  }),
);

router.post(
  "/nulls-connect/verify",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const email = validEmail(req.body?.email);
    const pin = String(req.body?.pin ?? "").trim();
    // Numeric code (up to 6 digits) sent to the account email.
    if (!/^\d{1,6}$/.test(pin)) {
      throw httpError(400, "Enter the code from your email");
    }
    const url = `${NC_BASE}/api/auth/login.v2?email=${encodeURIComponent(email)}&game=laser&locale=ru&pin=${pin}`;
    res.json(await ncJson(url));
  }),
);

router.post(
  "/nulls-connect/links",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      throw httpError(400, "Missing Nulls Connect token");
    }
    res.json(
      await ncJson(`${NC_BASE}/api/games/links?game=laser`, { Authorization: `Bearer ${token}` }),
    );
  }),
);

router.post(
  "/nulls-connect/refresh",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      throw httpError(400, "Missing Nulls Connect token");
    }
    res.json(
      await ncJson(`${NC_BASE}/api/games/refresh_tokens`, { Authorization: `Bearer ${token}` }),
    );
  }),
);

router.post(
  "/nulls-connect/link",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const viewer = portalUserOf(req);
    const token = String(req.body?.token ?? "").trim();
    const playerId = String(req.body?.playerId ?? "").trim();
    const playerName = String(req.body?.playerName ?? "").trim().slice(0, 120);
    if (!token || !playerId) {
      throw httpError(400, "Missing Nulls Connect account details");
    }

    // Only allow linking an account the token actually owns.
    const links = (await ncJson(`${NC_BASE}/api/games/links?game=laser`, {
      Authorization: `Bearer ${token}`,
    })) as {
      links?: Array<{
        player_id?: string | number;
        player_info?: { name?: string; tag?: string };
      }>;
    };
    const match = (links.links ?? []).find((l) => String(l.player_id ?? "") === playerId);
    if (!match) {
      throw httpError(403, "That account does not belong to this Nulls Connect token");
    }

    const name =
      playerName ||
      match.player_info?.name ||
      match.player_info?.tag ||
      "Nulls account";
    const [updated] = await db
      .update(portalUsersTable)
      .set({ nullsConnectId: playerId, nullsConnectName: name })
      .where(eq(portalUsersTable.id, viewer.id))
      .returning();
    res.json(userToJson(updated));
  }),
);

export default router;
