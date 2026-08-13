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
- **Sign up / sign in** with email + password via **Clerk** — no more guest or nickname-only
  access. Sessions are secure, persistent, and survive refreshes/restarts.
- Every user has their own **isolated account**: reports, messages, attachments,
  notifications, preferences, and roles are scoped to the account. No user can read another
  user's data — permissions are enforced on the **API**, not just hidden in the UI.
- **Logout**, account persistence, and profile management (display name + **avatar upload**)
  from the Settings page.
- Optional **Nulls Connect** integration (Settings → Nulls Connect): link a Nulls account via
  the official Connect flow (email → code → linked account). It is **never required** to use
  the portal. Only the player ID and display name are stored — never the token.

### Ticket system
A submitted report becomes a **ticket with a unique ID** (`NB-0001`, …) and a status:

```
User submits → Moderator verifies → forwarded → Administrator handles → Resolved/Closed
                    └→ rejected (never reaches administrators)
```

- **Users** can submit reports, view their own tickets + status + history, and view the
  permitted conversation. They **cannot** edit a ticket, change status, or message staff —
  unless a moderator/administrator enables replies for that ticket (`allowUserMessages`).
- **Moderators** review tickets, verify or reject them, forward verified tickets to
  administrators, reply, edit ticket info, change statuses, and add **internal notes**
  (visible only to staff).
- **Administrators** have full report management, respond to users, resolve/close tickets,
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
- **User search** — filter accounts live by name, email, role, or ID.
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
section, FAQ, and clear calls to action into sign-up.

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Workspace | pnpm workspaces · Node.js · TypeScript |
| Web | React 19 · Vite · wouter · Tailwind CSS v4 · TanStack Query |
| API | Express 5 · Zod (generated from OpenAPI) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Clerk (`@clerk/react` client, `@clerk/express` server) |
| API contract | OpenAPI spec → generated React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) via Orval |

---

## Getting started (local development)

### Prerequisites
- **Node.js** 20+ and **pnpm** (`corepack enable` or `npm i -g pnpm`)
- A **PostgreSQL** database (any provider: Timescale, Neon, Supabase, R2-adjacent, local
  Postgres) — you only need its **connection string**
- A **Clerk** application (free tier) — you only need its two keys

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
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

| Variable | What it is | Required |
| --- | --- | --- |
| `DATABASE_URL` | Connection string for your Postgres database. The server refuses to start without it. Timescale-style URLs (`sslmode=require`) are handled automatically (TLS without cert pinning). | ✅ |
| `CLERK_SECRET_KEY` | Clerk API secret — backend auth. Get it at dashboard.clerk.com → your app → **API Keys**. | ✅ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key — frontend auth. Same dashboard page. The API also falls back to this value server-side if `CLERK_PUBLISHABLE_KEY` is unset. | ✅ |
| `S3_BUCKET` / `R2_BUCKET` | Enables S3-compatible presigned attachment storage (optional; local disk otherwise) | – |

> **What is `DATABASE_URL`?** It's just the *address* of your database. You create the
> database once on a provider like Neon or Timescale Cloud, and it gives you a one-line
> connection string. The app connects, creates the tables automatically, and stores all
> tickets, messages, notifications, and accounts there.

### 3. Run

```bash
pnpm run dev
```

This starts the **API server** (port `8080`) and the **Vite web app** (port `5173` or the
`PORT` you set), and applies the database schema automatically (`drizzle-kit push`).
Open the web app, sign up — **the very first account becomes the administrator**.

Useful commands:

```bash
pnpm run typecheck      # typecheck every package
pnpm run build          # typecheck + build all packages
pnpm --filter @workspace/db run push --force   # sync the DB schema manually
pnpm --filter @workspace/api-spec run codegen  # regenerate client + Zod from the OpenAPI spec
```

---

## Trial accounts

For quick evaluation of every role, three ready-made accounts exist. **The first account
signed up in a fresh deployment becomes the administrator** — but these three are
pre-provisioned so you can switch roles instantly:

| Role | Email | Password | What you can do |
| --- | --- | --- | --- |
| **Reporter** | `trialreporter@gmail.com` | `trialreporter` | Submit reports with attachments, track your tickets, view status/history/conversation. Cannot edit tickets or message staff unless enabled. |
| **Moderator** | `trialmoderator@gmail.com` | `trialmod` | Review tickets in the **Inbox**: verify, reject, forward to administrators, reply, edit ticket info, change statuses, add internal notes. |
| **Administrator** | `trialadministrator@gmail.com` | `trialadministrator` | Everything a moderator can, plus resolve/close tickets and the **Admin** tab: user search, role changes, block/unblock, remove accounts, clear database. |

### Suggested walkthrough
1. Sign in as **trialreporter@gmail.com** → **Submit a report** → choose **Null's Brawl**,
   pick a category, write the details, attach a file → submit.
2. Sign in as **trialmoderator@gmail.com** → **Inbox** shows the new ticket → **verify** it
   (or reject to see that path) → **forward** it to administrators → reply to the reporter.
3. Sign in as **trialadministrator@gmail.com** → the verified ticket is in the inbox →
   reply, set status → **resolve/close** it.
4. Back as the reporter → the ticket shows its live status + history + the conversation
   (with the attachment preview), and notifications appeared along the way.

---

## Deployment

The app is a standard Vite + Express build and runs on any Node host (VPS, Render, Railway,
Fly, or a managed platform):

1. Set the three env vars in production (`DATABASE_URL`, `CLERK_SECRET_KEY`,
   `VITE_CLERK_PUBLISHABLE_KEY` — note `VITE_*` vars are baked into the frontend build).
2. Build: `pnpm run build` (frontend → `dist/`, API → `dist/` bundle).
3. Start: `pnpm --filter @workspace/api-server run start` (serves the built frontend too).

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
