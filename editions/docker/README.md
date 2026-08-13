# Nulls Report — Docker Edition

A special edition for **Node.js Docker images** (or any plain Node.js host):the entire portal — Express API, Discord + Nulls Connect authentication, every route, database access,
attachment storage, and the prebuilt web app — is bundled into **one single
`server.js` file**. There are no other runtime files: no `node_modules`, no
worker files, no build step.

```bash
node server.js
```

One process, one port, everything included.

---

## Ports & URLs — read this first

The server always prints something like:

```
[nulls-report] listening on 0.0.0.0:8080
```

**That is normal and correct.** `0.0.0.0:8080` is the port *inside* your
server/container — it is **not** the URL you type in the browser. Every host
exposes your app on its **own public port** (e.g. `http://78.154.103.21:13103/`),
and it is the host/panel that decides the mapping. Two cases:

### Case 1 — Docker (`docker run` / a Docker panel)
The container listens on `0.0.0.0:8080`. You tell the panel/host which public
port forwards to it:

```bash
docker run -p 13103:8080 --env-file .env nulls-report
#                 ^^^^^ public port that becomes http://78.154.103.21:13103/
```

The `-p <public>:<container>` pair is the whole story — you can use any public
port (`13103`, `80`, `3000`, …) without changing the app.

### Case 2 — running directly on the host (panel that runs `node server.js`)
Give it the public port directly:

```bash
PORT=13103 node server.js
```

then the app listens on `0.0.0.0:13103` and `http://78.154.103.21:13103/` works
immediately. **If your panel lets you set a port in its UI, use that instead of
PORT** — many panels (Pterodactyl, Plesk, cPanel Node apps, Vercel-style
platforms, …) inject the port themselves via a `PORT` environment variable, and
the app respects it automatically.

> If you do nothing and just run `node server.js`, it defaults to port **8080**
> — that's the container-internal default, and it's only wrong if your host
> isn't forwarding that port to the outside world.

---

## Quick start

```bash
# 1. Extract the archive
tar -xzf nulls-report-docker-edition.tar.gz
cd nulls-report-docker-edition

# 2. Create .env with your values (or set real env vars instead)
cat > .env <<'EOF'
DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
# Optional: enables "Continue with Discord" (Nulls Connect sign-in works without it)
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
# Optional: your public origin so the Discord OAuth callback matches exactly
PUBLIC_URL=https://reports.example.com
EOF

# 3a. Direct run (any Node.js >= 20.11)
node server.js

# 3b. …or build & run with Docker
docker build -t nulls-report .
docker run -p 13103:8080 --env-file .env nulls-report
```

Open `http://<your-host>:<public-port>/` — the portal is live.

---

## Environment variables

Everything is configured at **runtime** — nothing is baked into the build, so
one artifact works for any database.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string, e.g. `postgres://user:pass@host:5432/db?sslmode=require`. Timescale-style URLs are handled automatically. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | – | Optional — enables **Continue with Discord** (OAuth app at discord.com/developers). Without them the Discord button is disabled; Nulls Connect still works. |
| `PUBLIC_URL` | – | Canonical public origin of your deployment, e.g. `https://reports.example.com`. The Discord OAuth callback is derived from it (`PUBLIC_URL + /api/auth/discord/callback`) — it must exactly match the redirect URI registered in the Discord Developer Portal. Defaults to the origin of the incoming request. |
| `ADMIN_TAG` | – | Public tag of the general administrator account (e.g. `ADMIN_TAG=A7K4P2`). That account is elevated to administrator; all other staff is managed in the Admin panel. |
| `PORT` | – | Port to listen on (default `8080`). Your panel may inject this automatically. |
| `STATIC_DIR` | – | Where the web build lives (default `./dist` next to `server.js`). |
| `S3_BUCKET` or `R2_BUCKET` | – | Enables S3-compatible attachment storage (AWS S3, Cloudflare R2, Backblaze, MinIO…). |
| `S3_ENDPOINT` / `R2_ENDPOINT` | – | Custom endpoint (e.g. `https://…r2.cloudflarestorage.com`). |
| `S3_REGION` | – | Bucket region (default `us-east-1`, or `auto` for R2). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | – | Bucket credentials (falls back to `AWS_*`). |
| `ATTACHMENT_DIR` | – | Local attachment folder when no bucket is set (default `<cwd>/.local-uploads`). |

A `.env` file in the folder next to `server.js` (or one level above it) is read
automatically; real environment variables always win over file values.

> **Attachments:** without a bucket, files are written to `<cwd>/.local-uploads`.
> In Docker, mount a volume there (the compose file does this) so uploads
> survive restarts. For durable production storage, set an S3 bucket instead.

---

## Troubleshooting

**"Listening on 0.0.0.0:8080" but my site is on port 13103 / another port.**
See *Ports & URLs* above — set `PORT=<publicPort>` for direct runs, or map the
port in your Docker/panel settings. The app respects whatever `PORT` your
hosting panel injects.

**The panel asks for a "main file" / "entry point" / "start command".**
Point it at `server.js` (the file in the archive root). The start command is
exactly `node server.js`. There are no other files needed — if you only copy
`server.js` to your host, that is enough (plus `dist/` if you keep the archive
layout; set `STATIC_DIR` if you move the web files somewhere else).

**"Cannot find module …" / file-not-found errors.**
Run from the extracted folder, or give the absolute path:
`node /path/to/nulls-report-docker-edition/server.js`. The server finds `dist/`
and `.env` relative to `server.js`, so the current directory doesn't have to be
the archive folder — but attachments without S3 default to the current
directory.

**Error about `DATABASE_URL must be set`.**
The required env var is missing. Set `DATABASE_URL` (env or `.env` file) and
restart. The server refuses to start without a database URL — that's intentional.

**"Discord isn't wired up yet" on the auth page.**
The server is running but `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` are not
set, so the Discord button is disabled. Add them and restart — or sign in with
Nulls Connect, which needs no extra keys.

**Logs look like JSON lines.** That's expected — the edition logs plain JSON to
stdout (great with `docker logs`). Set `LOG_LEVEL=debug` for more detail.

---

## First-run notes

- There are **no registration forms or trial accounts**. Accounts are created
  automatically on the first sign-in through **Discord** or **Nulls Connect**,
  and each account gets a permanent public tag (`#A7K4P2`) generated for it.
- The **first account** created in a fresh database becomes the
  **administrator** automatically. To test the other roles, sign in with two
  more provider accounts and promote/demote them from the Admin tab.

---

## Building from source (optional)

```bash
git clone https://github.com/ilyln7/Nulls-Report.git
cd Nulls-Report
pnpm install
pnpm run build                                   # builds the web app
pnpm --filter @workspace/api-server run build:docker-edition   # bundles server.js
docker build -f editions/docker/Dockerfile -t nulls-report .   # or compose
```

## Endpoints

| Path | What it is |
| --- | --- |
| `/` | The web app (served from `dist/`, SPA routing included) |
| `/api/healthz` | Health check — returns `{"status":"ok"}` |
| `/api/config` | Runtime config for the frontend (e.g. whether Discord sign-in is configured) |
| `/api/*` | Everything else — reports, tickets, chat, notifications, admin, storage, Nulls Connect |

## Upgrading

Replace `server.js` and `dist/` with the files from a newer release archive and
restart. Your data lives in Postgres and (optionally) S3 — upgrades never touch
it. In Docker, `docker compose -f editions/docker/docker-compose.yml up -d
--build` rebuilds from the latest source.
