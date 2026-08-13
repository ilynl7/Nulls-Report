# ============================================================================
# Nulls Report — Docker edition
#
# Build (from the repository root):
#   docker build -f editions/docker/Dockerfile -t nulls-report .
#
# Run:
#   docker run -p 8080:8080 --env-file .env nulls-report
#
# The final image contains exactly two things: `server.js` (the whole
# application bundled into a single file — API, auth, routes, everything)
# and `dist/` (the prebuilt web app). The container runs ONE process:
#
#   CMD ["node", "server.js"]
#
# All configuration comes from environment variables (DATABASE_URL,
# DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL, ADMIN_TAG, PORT, …).
# Nothing is baked in, so the same image works in dev, staging, and production.
# ============================================================================

# ---- Build stage: install deps, build the web app, bundle server.js ----
FROM node:20-alpine AS build

# pnpm is required by this repo (the preinstall script enforces it).
RUN corepack enable

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm --filter @workspace/api-server run build:docker-edition

# ---- Runtime stage: node + server.js + dist, nothing else ----
FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY --from=build /repo/editions/docker/package.json /app/package.json
COPY --from=build /repo/editions/docker/server.js /app/server.js
COPY --from=build /repo/artifacts/nulls-report/dist/public /app/dist

EXPOSE 8080

CMD ["node", "server.js"]
