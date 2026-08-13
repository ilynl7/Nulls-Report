import { Router, type IRouter } from "express";
import { publicUrl } from "../lib/url";

const router: IRouter = Router();

/**
 * Public bootstrap config for the web app (no auth required).
 *
 * The frontend fetches this at startup so it knows which sign-in providers
 * are actually wired up (Discord needs OAuth credentials; Nulls Connect is
 * always available). No secrets are ever exposed here.
 */
router.get("/config", (req, res) => {
  res.json({
    // Whether the Discord OAuth provider is wired up (client id/secret present).
    discordConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    // The canonical public origin the server derives OAuth callbacks from
    // (set PUBLIC_URL to override). Non-secret; shown for diagnostics.
    publicUrl: publicUrl(req),
  });
});

export default router;
