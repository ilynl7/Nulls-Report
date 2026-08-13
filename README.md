# Nulls Report — Community Support Portal

A production-grade report/ticket portal for the **Null's private-server community**. Players
submit reports with attachments, moderators review and verify them, and administrators handle
the verified tickets — with real authentication, per-account data isolation, persistent
notifications, a full ticket history, and an optional **Nulls Connect** integration.

**One portal for every Nulls server** — Null's Brawl is live today; Null's Clash of Clans,
Null's Royale, and Null's Royale Infinity are wired in and ready to be enabled.

---

## Features

### Accounts & authentication
- **Exactly two sign-in methods: Discord and Nulls Connect.** There is no email, no
  password, no display-name registration, no guest or trial accounts. The auth screen
  shows exactly two buttons: **Continue with Discord** and **Continue with Nulls Connect**.
- **Accounts are created automatically** the first time you authenticate through either
  provider. The portal generates a permanent, public user tag (`#A7K4P2`) that is never
  derived from database IDs and never reveals provider IDs or emails.
- **One account, two linked identities.** Discord and Nulls Connect are authentication
  methods on the same internal account — connect both from Settings and sign in with either
  one. The same provider identity always resolves to the same portal account; no duplicates
  are ever created. Providers can be connected/disconnected without losing the account.
- The **internal portal account is the permanent identity**; Discord/Nulls Connect are just
  the keys to it. Only the minimum provider info is stored (Discord username, Nulls player
  ID/name) — never tokens, emails, or other private provider data.
- **Logout**, avatar upload, and connect/disconnect for both authentication methods live in
  the Settings page. Roles, reports, messages, attachments, and notifications are all
  scoped to the internal account with permissions enforced on the **API**, not just hidden
  in the UI.

### Community report system
A submitted report becomes a **community-visible issue** with a unique ID (`NB-0001`, …),
and the report area is a public feed, not a private "my tickets" page:

```
Submit (Public/Private) → Moderator verifies → Administrator handles → Resolved/Closed
                               └→ rejected (never reaches administrators)
```

- **Visibility is a first-class property, enforced server-side.** Reports are **Public**
  (visible to the whole community) or **Private** (reporter + staff only), chosen at submit
  time. Community viewers browse public reports and see the reporter only as their public
  tag (`Reported by #A7K4P2`) — never emails, provider IDs, or staff info.
- **Risk override:** a report marked **Critical** is automatically restricted (reporter +
  staff only) regardless of what the reporter chose. Moderators/admins can also **hide** a
  public report from the community, with the original setting preserved in the audit log
  (`Public → Hidden by <staff>`).
- **Separate concepts never overwrite each other:** visibility, verification state
  (unverified/verified/rejected), workflow status, staff stage, and priority are tracked
  independently and every staff change is recorded in the immutable audit log.
- **Users** submit reports (Public/Private + priority), track their own reports, and view
  the community feed. They cannot edit a report, change status, or message staff unless a
  moderator/administrator enables replies (`allowUserMessages`).
- **Moderators** review reports in the **Inbox**: verify, reject, forward to administrators,
  reply, edit report info, change statuses/priority, hide/unhide, and add **internal notes**
  (visible only to staff).
- **Administrators** have full report management, respond to users, resolve/close reports,
  and manage users & roles.

### Conversation (per-ticket chat)
Each ticket has an internal conversation between the reporter and staff. Messages can carry
**attachments**. Staff can post reporter-visible replies or staff-only internal notes.
Everything — messages, status changes, verification, forwarding — is recorded in the ticket's
**history** with the acting user and timestamps.

### Attachments
- Any file type, up to **50 MB per file**, attached to reports **and** to chat messages.
- Uploads are streamed through the API with ownership + permission checks (only the ticket
  owner and staff can view/download), stored as opaque object keys so files can never expose
  server paths or other users' files.
- Inline **preview** (images, video, audio, PDFs, text) + download, right in the ticket view.
- Storage: S3-compatible buckets (R2, Backblaze, MinIO, …) via presigned URLs when
  configured; otherwise local disk (dev mode).

### Notifications
Persisted per account for every relevant event: report submitted, verified, rejected,
forwarded, status changed, reply posted, replies enabled, resolved/closed. Read/unread state
is stored server-side.

### Admin tools
- **User search** — filter accounts live by display name, public tag, connected provider,
  role, or ID.
- **Role management** — promote/demote users between reporter, moderator, administrator.
- **Block / unblock** — blocked accounts get `403` on every API call and can't use the portal.
- **Remove account** — permanently deletes the account and everything it owns (reports,
  attachments, messages, notifications) with correct foreign-key cleanup.
- **Clear user database** — danger zone: wipes every account/report/message/attachment/
  notification. Requires typing `DELETE` in the confirmation dialog **and** `{confirm: true}`
  on the API. The next sign-up becomes the first administrator again.

### Landing page
A light, community-focused homepage covering the whole Nulls network (not just Brawl):
live community status per server, what you can report, how the workflow works, privacy
section, FAQ, and clear calls to action into sign-in (Discord or Nulls Connect).

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Workspace | pnpm workspaces · Node.js · TypeScript |
| Web | React 19 · Vite · wouter · Tailwind CSS v4 · TanStack Query |
| API | Express 5 · Zod (generated from OpenAPI) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Server-side sessions (HttpOnly cookie) + linked identities (Discord, Nulls Connect) |
| API contract | OpenAPI spec → generated React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) via Orval |

---

## Getting started (local development)

### Prerequisites
- **Node.js** 20+ and **pnpm** (`corepack enable` or `npm i -g pnpm`)
- A **PostgreSQL** database (any provider: Timescale, Neon, Supabase, R2-adjacent, local
  Postgres) — you only need its **connection string**
- Optional: a **Discord** OAuth app for the Discord sign-in button (without it the
  button is disabled and Nulls Connect still works — only `DATABASE_URL` is truly
  required)

### 1. Install

```bash
git clone https://github.com/ilynl7/Nulls-Report.git
cd Nulls-Report
pnpm install
```

### 2. Configure environment

Create a `.env.local` file at the repo root (or use your platform's secret manager):

```bash
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=require
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

| Variable | What it is | Required |
| --- | --- | --- |
| `DATABASE_URL` | Connection string for your Postgres database. The server refuses to start without it. Timescale-style URLs (`sslmode=require`) are handled automatically (TLS without cert pinning). | ✅ |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Enables **Continue with Discord** (OAuth app at discord.com/developers). Optional — without them the Discord button is disabled; Nulls Connect still works. | – |
| `PUBLIC_URL` | The canonical public origin users actually access the site on, e.g. `https://reports.nulls.gg` (no trailing slash). The server derives Discord's OAuth callback (`<PUBLIC_URL>/api/auth/discord/callback`) from it. **Set this on any hosted/preview deployment** — without it the callback is guessed from request headers, which causes Discord's `invalid redirect_uri` error when the guessed origin differs from what you registered. | – (recommended with Discord) |
| `ADMIN_TAG` | The public tag of the **general administrator** account, e.g. `ADMIN_TAG=A7K4P2` (the `#` is optional). The account keeps its stored role in the database — the env tag only elevates it to administrator at session time, so it also works on a fresh database before anyone signs up. Everything else (promoting moderators, blocking, removal) is managed from the Administration panel. | – |
| `S3_BUCKET` / `R2_BUCKET` | Enables S3-compatible presigned attachment storage (optional; local disk otherwise) | – |

> **Discord OAuth callback consistency.** The redirect URI is always built from one
> server-side value: `PUBLIC_URL + /api/auth/discord/callback`. Register that exact URI
> (scheme, host, path, no trailing slash differences) in the Discord Developer Portal
> under **OAuth2 → Redirects**. The URI sent in the authorization request and the URI
> used during the code exchange are the same value, as Discord requires. If you ever
> see `Invalid OAuth2 URL`, the registered URI and `PUBLIC_URL` disagree. The API logs
> a warning at startup when Discord keys are present but `PUBLIC_URL` is not, and
> `GET /api/config` returns the exact origin being used.

> **What is `DATABASE_URL`?** It's just the *address* of your database. You create the
> database once on a provider like Neon or Timescale Cloud, and it gives you a one-line
> connection string. The app connects, creates the tables automatically, and stores all
> tickets, messages, notifications, accounts and sessions there.

### 3. Run

```bash
pnpm run dev
```

This starts the **API server** (port `8080`) and the **Vite web app** (port `5173` or the
`PORT` you set), and applies the database schema automatically (`drizzle-kit push`).
Open the web app and create an account — **the very first account ever created in a
fresh database becomes the administrator** (after a "clear database", the next sign-up
gets the role again).

Useful commands:

```bash
pnpm run typecheck      # typecheck every package
pnpm run build          # typecheck + build all packages
pnpm --filter @workspace/db run push --force   # sync the DB schema manually
pnpm --filter @workspace/api-spec run codegen  # regenerate client + Zod from the OpenAPI spec
```

---

## Trying every role

There is no registration form — sign in through a provider and the portal account (with its
random tag such as `#A7K4P2`) is created automatically. **The first account in a fresh
database becomes the administrator**, so to test all three roles:

1. Sign in **three times with three different provider accounts** (e.g. Discord accounts)
   — or sign in with Discord and Nulls Connect, plus a second Nulls player.
2. The very first account is already an **Administrator**.
3. Sign in as the admin → **Admin** tab → find the other two users and change their roles
   to **Moderator** and **Reporter**.
4. Submit from the **Submit report** page — both Discord and Nulls Connect count as
   trusted authentication, so any of the three accounts can submit.

| Role | What you can do |
| --- | --- |
| **Reporter** | Submit reports (Public/Private) with attachments, track your reports, view status/history/conversation and the community feed. Cannot edit reports or message staff unless enabled. |
| **Moderator** | Review reports in the **Inbox**: verify, reject, forward to administrators, reply, edit report info, change status/priority, hide/unhide, add internal notes. |
| **Administrator** | Everything a moderator can, plus resolve/close reports and the **Admin** tab: user search, role changes, block/unblock, remove accounts, clear database. |

### Suggested walkthrough
1. Sign in as **Reporter** → **Submit a report** → choose **Public**, pick a game/category,
   write the details, attach a file → submit.
2. Open the **Community** feed as a second account → the report is visible with
   `Reported by #…` — and a **Private** report is not.
3. Sign in as **Moderator** → **Inbox** shows the report → **verify** it (or reject to see
   that path) → **forward** it to administrators → reply to the reporter.
4. Sign in as **Administrator** → the verified report is in the inbox → reply, set status →
   **resolve/close** it.
5. Back as the reporter → the report shows its live status + history + the conversation
   (with the attachment preview), and notifications appeared along the way.

---

## Deployment

The app is a standard Vite + Express build and runs on any Node host (VPS, Render, Railway,
Fly, or a managed platform):

1. Set `DATABASE_URL` (required) plus the optional Discord OAuth keys
   (`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`) if you want Discord sign-in.
   The web app reads its runtime config from `GET /api/config`, so nothing is baked in.
2. Build: `pnpm run build` (frontend → `dist/`, API → `dist/` bundle).
3. Start: `pnpm --filter @workspace/api-server run start` (serves the built frontend too).

## Docker edition (single `server.js`)

A special edition built for **Node.js Docker images**: the entire portal — Express API,
Discord + Nulls Connect authentication, all routes, database access, attachment storage, and
the prebuilt web app — is bundled into **one self-contained `server.js`**. The container runs
exactly one process:

```bash
node server.js
```

Everything is configured at **runtime** via environment variables (`DATABASE_URL`, optional
`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`, `PORT`, …) — nothing is baked into the build,
so the same artifact works with any database. Only `DATABASE_URL` is required; Discord is an
optional sign-in provider, and Nulls Connect works without any extra keys.

**Get it:** download `nulls-report-docker-edition.tar.gz` from the GitHub release (contains
`server.js`, the prebuilt `dist/`, `Dockerfile`, `docker-compose.yml`, and a README), or
build it from source:

```bash
pnpm install
pnpm run build
pnpm --filter @workspace/api-server run build:docker-edition   # -> editions/docker/server.js
docker build -f editions/docker/Dockerfile -t nulls-report .
docker run -p 8080:8080 --env-file .env nulls-report
```

Full details in [`editions/docker/README.md`](editions/docker/README.md).

> **Discord over plain http:** the app itself works over both http and https
> (cookies are scheme-aware), but **Discord only accepts https redirect URIs**
> (except `localhost`), so Discord sign-in needs an https callback. On an
> http-only host, put TLS in front (Caddy/nginx/tunnel) and set `PUBLIC_URL`
> to the https origin — or use **Nulls Connect**, which works over plain http
> and signs in with the account-picker flow (email → code → choose game
> account).

## Branches & releases

The repository is organized as **two independent branches that are never merged**:

| Branch | What it contains | Releases |
| --- | --- | --- |
| **`main`** | The full portal source: web app, Express API, database schema, scripts, **and** the Docker edition build source under `editions/docker/` (this is the "factory" — it produces the Docker artifact). | `mainv2`, `mainv3`, … |
| **`dockermain`** | Only the Docker edition, standalone at the repository root: the self-contained `server.js`, the prebuilt `dist/` web app, `Dockerfile`, compose files, and this edition's README. Nothing else — no monorepo, no build tooling. | `dockermainv2`…, `dockermainv3`, … |

- **Never merge `dockermain` into `main`** (or the reverse). They diverge on purpose: `main`
  is the portal, `dockermain` is the prebuilt Docker product line.
- **How a Docker release is made:** changes land on `main` → rebuild the edition
  (`pnpm --filter @workspace/api-server run build:docker-edition` + fresh web build) → copy
  the artifacts onto `dockermain` → tag a `dockermainvX` release. The `editions/docker/`
  source folder on `main` stays in sync with what gets shipped on `dockermain`.
- **Version numbering is parallel:** a `mainvX` portal release and its matching
  `dockermainvX` Docker release contain the same application, built the same way.

## Project structure

```
├── artifacts/
│   ├── api-server/          # Express API: routes/, lib/ (auth, storage, notify, serialize)
│   └── nulls-report/        # Web app: src/pages/, src/components/, src/lib/
├── lib/
│   ├── api-spec/            # openapi.yaml — the API contract (source of truth)
│   ├── api-client-react/    # Generated React Query hooks + types
│   ├── api-zod/             # Generated Zod validators
│   └── db/                  # Drizzle schema (src/schema/portal.ts) + connection
├── scripts/
│   └── dev.mjs              # Full-stack dev orchestration (API lifecycle owner)
└── pnpm-workspace.yaml
```

## Notes

- **Schema changes** are applied automatically on dev start. The source of truth is
  `lib/db/src/schema/portal.ts`; regenerate the API client after changing the API contract
  in `lib/api-spec/openapi.yaml`.
- **Role bootstrap**: the first account ever created in a database becomes the
  administrator. After a "clear database", the next sign-up gets the role again.
- The portal is designed for the **whole Nulls network**: only Null's Brawl is enabled
  today, but the other servers are one flag away (`lib` catalog + form options) with no
  redesign needed.
