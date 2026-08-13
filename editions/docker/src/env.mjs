// Loads .env files before the application module graph evaluates (the database
// layer reads DATABASE_URL at import time). Real environment variables always
// win over file values. Works on any Node.js >= 18 (no process.loadEnvFile
// dependency), so it runs on any Node Docker image.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file) {
  const content = readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

// Search order: next to server.js → repo root of a source checkout. Both
// depths are tried because this module runs from src/ in a source checkout
// but is inlined into editions/docker/server.js in the bundled artifact.
for (const file of [
  path.join(here, ".env.local"),
  path.join(here, ".env"),
  path.join(here, "..", "..", ".env.local"),
  path.join(here, "..", "..", ".env"),
  path.join(here, "..", "..", "..", ".env.local"),
  path.join(here, "..", "..", "..", ".env"),
]) {
  if (existsSync(file)) {
    try {
      loadEnvFile(file);
    } catch {
      // Unreadable env file — continue with real environment variables.
    }
  }
}
