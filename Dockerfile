# ============================================================================
# Nulls Report — Docker edition (standalone / prebuilt)
#
# This branch (dockermain) ships the PREBUILT edition: `server.js` (the whole
# application — Express API, Discord + Nulls Connect auth, every route, the
# prebuilt web app — bundled into one file) plus `dist/` (the web app). There
# is no build step: the image just copies the artifacts and runs ONE process:
#
#   CMD ["node", "server.js"]
#
# Build (from this folder):
#   docker build -t nulls-report .
#
# Run:
#   docker run -p 8080:8080 --env-file .env nulls-report
#
# All configuration comes from environment variables at runtime — nothing is
# baked into the image:
#   DATABASE_URL             required — Postgres connection string
#   DISCORD_CLIENT_ID        optional — enables "Continue with Discord"
#   DISCORD_CLIENT_SECRET    optional — Discord OAuth secret
#   PUBLIC_URL               optional — canonical public origin (Discord OAuth
#                            callback is derived from it; must be https for
#                            Discord sign-in to work)
#   ADMIN_TAG                optional — public tag of the general administrator
#   PORT                     optional — default 8080
# ============================================================================

FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY dist ./dist

EXPOSE 8080

CMD ["node", "server.js"]
