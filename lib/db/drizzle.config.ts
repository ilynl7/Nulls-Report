import { defineConfig } from "drizzle-kit";
import path from "path";
import { existsSync } from "fs";

// drizzle-kit runs with cwd = lib/db, so pick up env files from the repo
// root (e.g. .env.local written by `clerk init` or the platform) and from
// the package dir. Real environment variables are never overridden.
for (const file of [
  path.join(process.cwd(), "..", "..", ".env.local"),
  path.join(process.cwd(), "..", "..", ".env"),
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * pg v8 maps `sslmode=require`/`prefer` to strict certificate verification
 * (verify-full), which breaks against providers that serve a private CA
 * chain (e.g. Timescale Cloud). Ask pg for libpq semantics instead, so
 * `require` means TLS-encrypted without cert pinning. The runtime pool
 * (lib/db/src/index.ts) applies the same behavior via its ssl option.
 */
function normalizeUrl(url: string): string {
  if (
    /(?:^|[?&])sslmode=(require|prefer|no-verify)(?:&|$)/.test(url) &&
    !/uselibpqcompat/.test(url)
  ) {
    return `${url}${url.includes("?") ? "&" : "?"}uselibpqcompat=true`;
  }
  return url;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeUrl(process.env.DATABASE_URL),
  },
  // Managed Postgres providers install extensions that own views/functions in
  // the same schema (pg_buffercache, timescaledb, ...). Only sync our tables
  // so `push` never tries to drop extension-owned objects. New tables must
  // keep one of these prefixes (or be added here).
  tablesFilter: ["portal_*", "report_*", "pending_*"],
});
