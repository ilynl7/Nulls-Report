// Nulls Report — Docker edition entry point.
//
// This file is bundled (with all dependencies) into a single self-contained
// `server.js` by `pnpm --filter @workspace/api-server run build:docker-edition`.
// The Docker image runs exactly one process: `node server.js`, which serves
// BOTH the API (everything under /api) and the prebuilt web app (./dist).
//
// Configuration comes entirely from environment variables (or a .env file in
// the working directory), so the SAME prebuilt artifact works with any
// database and any auth keys:
//
//   DATABASE_URL             required — Postgres connection string
//   PUBLIC_URL               optional — canonical public origin (Discord OAuth
//                            callback is derived from it; defaults to the
//                            request origin)
//   DISCORD_CLIENT_ID        optional — enables "Continue with Discord"
//   DISCORD_CLIENT_SECRET    optional — Discord OAuth secret
//   ADMIN_TAG                optional — public tag of the general administrator
//   PORT                     optional — default 8080
//   STATIC_DIR               optional — where the web build lives (default ./dist)
//   S3_BUCKET / R2_BUCKET    optional — S3-compatible attachment storage
//   S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY

// Load .env files BEFORE the app module evaluates (the database layer reads
// DATABASE_URL at import time). Import order matters: this side-effect import
// must stay first.
import "./env.mjs";

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

// The whole application: Express API + Discord/Nulls Connect auth + every
// route. Bundled in. (repo/editions/docker/src ->
// repo/artifacts/api-server/src/app.ts)
import app from "../../../artifacts/api-server/src/app.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Serve the prebuilt web app (./dist) and fall back to index.html for
// client-side routes (wouter). /api keeps its own handlers registered above.
// ---------------------------------------------------------------------------
const distDir = process.env.STATIC_DIR || path.join(here, "dist");

app.use(express.static(distDir, { index: false, maxAge: "1h" }));
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next();
  });
});

// ---------------------------------------------------------------------------
// Listen — bind 0.0.0.0 so Docker port mapping works.
// ---------------------------------------------------------------------------
const rawPort = process.env.PORT ?? "8080";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`[nulls-report] listening on 0.0.0.0:${port}`);
  console.log(
    `[nulls-report] the address above is the INTERNAL port. To reach it from the internet,\n` +
      `[nulls-report] either set PORT=<publicPort> when starting, or map the host port to it\n` +
      `[nulls-report] (e.g. docker run -p <publicPort>:${port} ...). The host URL you type in the\n` +
      `[nulls-report] browser (http://<host>:<publicPort>/) is decided by your server/hosting panel.`,
  );
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    const publicUrl = (process.env.PUBLIC_URL ?? "").trim();
    console.log(
      `[nulls-report] NOTE: Discord sign-in requires an https callback (Discord rejects http redirect URIs).\n` +
        `[nulls-report] If this host is plain http, Discord login will not work - add TLS in front (Caddy/nginx/tunnel)\n` +
        `[nulls-report] and set PUBLIC_URL to the https origin, or use Nulls Connect which works over http.` +
        (publicUrl.startsWith("http://")
          ? ` (PUBLIC_URL is currently http: ${publicUrl})`
          : ""),
    );
  }
});
