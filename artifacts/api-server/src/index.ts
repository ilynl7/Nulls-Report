// Load .env files before ./app so the database and auth providers are
// configured in time (imports are evaluated in order, so this must come first).
import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Discord OAuth help: without PUBLIC_URL the callback URL is derived from the
// request headers, which is fragile behind proxies/tunnels. Warn early so a
// "invalid redirect_uri" in the Discord portal is easy to diagnose.
if (
  process.env.DISCORD_CLIENT_ID &&
  process.env.DISCORD_CLIENT_SECRET &&
  !process.env.PUBLIC_URL
) {
  logger.warn(
    "[discord] DISCORD_CLIENT_ID/SECRET are set but PUBLIC_URL is not. OAuth callbacks are derived from request headers — set PUBLIC_URL (e.g. https://your-domain) and register <PUBLIC_URL>/api/auth/discord/callback in the Discord developer portal.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
