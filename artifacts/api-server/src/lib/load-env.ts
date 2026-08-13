import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads .env files for the API server before any other module runs.
 *
 * Precedence (highest wins):
 *   1. Real environment variables (injected by the platform / shell)
 *   2. <repo root>/.env.local   (written by `clerk init`, Freebuff keys, ...)
 *   3. <repo root>/.env
 *   4. artifacts/api-server/.env.local
 *   5. artifacts/api-server/.env
 *
 * `process.loadEnvFile` never overrides variables that are already present
 * in process.env, so importing this module first is safe and idempotent.
 */
const rootDir = path.resolve(import.meta.dirname, "..", "..", "..");
const pkgDir = path.resolve(import.meta.dirname, "..", "..");

for (const file of [
  path.join(rootDir, ".env.local"),
  path.join(rootDir, ".env"),
  path.join(pkgDir, ".env.local"),
  path.join(pkgDir, ".env"),
]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
