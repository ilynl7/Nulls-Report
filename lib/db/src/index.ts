import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * pg v8 maps `sslmode=require`/`prefer` to strict certificate verification
 * (verify-full), which breaks against providers that serve a private CA
 * chain (e.g. Timescale Cloud). Append `uselibpqcompat=true` to get libpq
 * semantics where `require` means TLS-encrypted without cert pinning.
 * `verify-full`/`verify-ca` keep full verification and `disable` stays off.
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

export const pool = new Pool({
  connectionString: normalizeUrl(process.env.DATABASE_URL),
  // Fail fast when the database is unreachable instead of queueing requests
  // forever (the default is an infinite connection timeout).
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
