# Nulls Report — Docker Edition

A single-file edition of the **Nulls Report** portal designed for **Node.js Docker
images**. The whole application — Express API, Clerk authentication, all routes,
database access, attachment storage, and the prebuilt web app — is bundled into
**one `server.js` file**. The container runs exactly one process:

```bash
node server.js
```

No `node_modules`, no build step, no second server. Put `server.js` + the `dist/`
folder into any Node.js Docker image (`node:20-alpine`, `node:22`, …), set a few
environment variables, and it runs.

---

## Two ways to use it

### Option A — prebuilt release archive (fastest)

Download **`nulls-report-docker-edition.tar.gz`** from the GitHub release. It
contains `server.js`, `dist/` (the prebuilt web app), `Dockerfile`,
`docker-compose.yml`, and this README.

```bash
tar -xzf nulls-report-docker-edition.tar.gz
cd nulls-report-docker-edition

# Either run it directly with any Node.js (20.6+):
DATABASE_URL="postgres://…" \
CLERK_SECRET_KEY="sk_test_…" \
CLERK_PUBLISHABLE_KEY="pk_test_…" \
PORT=8080 \
node server.js

# …or build the Docker image:
docker build -t nulls-report .
docker run -p 8080:8080 --env-file .env nulls-report
```

### Option B — build from source

```bash
git clone https://github.com/ilyln7/Nulls-Report.git
cd Nulls-Report
pnpm install

# Build the web app + bundle server.js:
pnpm run build
pnpm --filter @workspace/api-server run build:docker-edition
# → produces editions/docker/server.js (self-contained)

docker build -f editions/docker/Dockerfile -t nulls-report .
# or with compose:
docker compose -f editions/docker/docker-compose.yml up -d --build
```

---

## Environment variables

Everything is configured at **runtime** — nothing is baked into the build, so one
artifact works for any database and any Clerk keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string, e.g. `postgres://user:pass@host:5432/db?sslmode=require`. Timescale-style URLs are handled automatically. |
| `CLERK_SECRET_KEY` | ✅ | Clerk backend secret (`sk_test_…` / `sk_live_…`). |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk frontend publishable key (`pk_test_…` / `pk_live_…`). Served to the browser at runtime via `GET /api/config`. |
| `PORT` | – | HTTP port (default `8080`). |
| `STATIC_DIR` | – | Where the web build lives (default `./dist` next to `server.js`). |
| `S3_BUCKET` or `R2_BUCKET` | – | Enables S3-compatible attachment storage (AWS S3, Cloudflare R2, Backblaze, MinIO…). |
| `S3_ENDPOINT` / `R2_ENDPOINT` | – | Custom endpoint (e.g. `https://…r2.cloudflarestorage.com`). |
| `S3_REGION` | – | Bucket region (default `us-east-1`, or `auto` for R2). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | – | Bucket credentials (falls back to `AWS_*`). |
| `ATTACHMENT_DIR` | – | Local attachment folder when no bucket is set (default `<cwd>/.local-uploads`). |

> **Attachments:** without a bucket, files are written to `<cwd>/.local-uploads`
> — mount a volume there (the compose file does this) so uploads survive
> container restarts. For durable production storage, set an S3 bucket instead.

A `.env` file in the working directory is also read automatically, so you can do:

```bash
cp .env.example .env   # fill in your values
node server.js
```

---

## Endpoints

| Path | What it is |
| --- | --- |
| `/` | The web app (served from `dist/`, SPA routing included) |
| `/api/healthz` | Health check — returns `{"status":"ok"}` |
| `/api/config` | Runtime config for the frontend (Clerk publishable key) |
| `/api/*` | Everything else — reports, tickets, chat, notifications, admin, storage, Nulls Connect |

---

## First-run notes

- The **first account** that signs up in a fresh database becomes the
  **administrator** automatically (promote others from the Admin page).
- Pre-provisioned trial accounts for quick evaluation:

  | Role | Email | Password |
  | --- | --- | --- |
  | Reporter | `trialreporter@gmail.com` | `trialreporter` |
  | Moderator | `trialmoderator@gmail.com` | `trialmod` |
  | Administrator | `trialadministrator@gmail.com` | `trialadministrator` |

- The database schema is created automatically on first boot (`drizzle-kit push`
  runs inside the build; tables are created when the API starts against an empty
  database — see `lib/db` for the schema source of truth).

## Upgrading

Replace `server.js` and `dist/` with the files from a newer release archive and
restart the container. Data lives in your Postgres database and (if configured)
your S3 bucket — it is untouched by upgrades. In Docker, run
`docker compose -f editions/docker/docker-compose.yml up -d --build` to rebuild
from the latest source.
