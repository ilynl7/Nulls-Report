// Full-stack dev orchestration: API server + Vite web app.
//
//   PORT        (optional) port for the web app (Freebuff injects it)
//   API_DEV_PORT (optional) port for the API server (default 8080)
//   BASE_PATH   (optional) base path for the web app (default "/")
//
// The web app proxies /api to the API server in dev, so both must be running
// for the preview to work end to end.
//
// This script owns the API lifecycle:
//  - On start it replaces a STALE API process left over from a previous
//    session (an orphan still holding the port would otherwise keep serving
//    old code forever, even after a preview restart).
//  - It watches backend source files and restarts the API on change, so new
//    routes/schema edits go live without a manual restart.
//  - If the API crashes it respawns it (with a small backoff to avoid a
//    crash loop when e.g. DATABASE_URL is missing).
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiPort = process.env.API_DEV_PORT ?? "8080";
const webPort = process.env.PORT ?? process.env.WEB_DEV_PORT ?? "5173";
const basePath = process.env.BASE_PATH ?? "/";

const BACKEND_WATCH_DIRS = [
  path.join(repoRoot, "artifacts", "api-server", "src"),
  path.join(repoRoot, "lib", "db", "src"),
  path.join(repoRoot, "lib", "api-spec"),
];
const BACKEND_WATCH_FILES = [
  path.join(repoRoot, "artifacts", "api-server", "package.json"),
  path.join(repoRoot, "lib", "db", "package.json"),
];

const children = [];
let shuttingDown = false;
let apiChild = null;
let apiCrashCount = 0;
let restartTimer = null;

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/** True when the process on the port answers our API's health endpoint. */
async function isOurApi(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === "ok";
  } catch {
    return false;
  }
}

/** Best-effort SIGTERM of whatever is listening on the port. */
function killOnPort(port) {
  const commands = [
    () => execSync(`lsof -ti :${port}`, { encoding: "utf8", timeout: 5000 }),
    () => execSync(`fuser -n tcp ${port} 2>/dev/null`, { encoding: "utf8", timeout: 5000 }),
  ];
  for (const run of commands) {
    try {
      const out = run().trim();
      const pids = [...new Set(out.match(/\d+/g) ?? [])];
      for (const pid of pids) {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {
          // Already gone.
        }
      }
      if (pids.length > 0) return true;
    } catch {
      // Command unavailable or nothing listening.
    }
  }
  return false;
}

async function waitForPortClosed(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function startApi() {
  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "dev"],
    { stdio: "inherit", env: { ...process.env, PORT: apiPort } },
  );
  apiChild = child;
  children.push(child);
  child.on("spawn", () => {
    apiCrashCount = 0;
  });
  child.on("exit", (code, signal) => {
    if (apiChild === child) apiChild = null;
    if (shuttingDown || signal) return;
    // Crashed (not our intentional restart) — respawn with backoff so the
    // preview keeps working once the cause (e.g. a missing key) is fixed.
    apiCrashCount += 1;
    if (apiCrashCount > 5) {
      console.error(
        `\n[dev] api-server exited ${apiCrashCount} times in a row. ` +
          "Not retrying automatically. Check DATABASE_URL (plus DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET for Discord sign-in) in the workspace API Keys.\n",
      );
      return;
    }
    const delay = Math.min(apiCrashCount * 1000, 5000);
    console.log(
      `\n[dev] api-server exited with code ${code}; restarting in ${delay / 1000}s. ` +
        "Make sure DATABASE_URL (plus DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET for Discord sign-in) is set in the workspace API Keys.\n",
    );
    setTimeout(() => {
      if (!shuttingDown) startApi();
    }, delay);
  });
  child.on("error", (err) => {
    console.error("[dev] failed to start api-server:", err.message);
  });
}

function restartApi(reason) {
  if (!apiChild) {
    startApi();
    return;
  }
  console.log(`\n[dev] ${reason} — restarting api-server\n`);
  apiChild.kill("SIGTERM");
  // Give the old process a moment to release the port, then start fresh.
  setTimeout(() => {
    if (!shuttingDown) startApi();
  }, 1200);
}

function stop(signal) {
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function watchBackend() {
  const onEvent = () => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => restartApi("backend sources changed"), 500);
  };
  const watchers = [];
  for (const dir of BACKEND_WATCH_DIRS) {
    try {
      watchers.push(fs.watch(dir, { recursive: true }, onEvent));
    } catch {
      // Recursive watch unsupported — fall back to watching the file list.
    }
  }
  if (watchers.length < BACKEND_WATCH_DIRS.length) {
    for (const file of BACKEND_WATCH_FILES) {
      try {
        watchers.push(fs.watch(file, onEvent));
      } catch {
        // File may not exist yet; ignore.
      }
    }
  }
  return watchers;
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  // Replace a stale API from a previous session that survived the last stop:
  // it would keep serving old routes (404s for newly added endpoints).
  if (await isPortOpen(Number(apiPort))) {
    if (await isOurApi(Number(apiPort))) {
      console.log("\n[dev] stale api-server detected — replacing it with the current build\n");
      if (killOnPort(apiPort)) {
        await waitForPortClosed(Number(apiPort), 10_000);
      }
    }
  }

  startApi();

  const webChild = spawn(
    "pnpm",
    ["--filter", "@workspace/nulls-report", "run", "dev"],
    {
      stdio: "inherit",
      env: { ...process.env, PORT: webPort, BASE_PATH: basePath, API_DEV_PORT: apiPort },
    },
  );
  children.push(webChild);
  webChild.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(
      `\n[dev] nulls-report exited with code ${code}. ` +
        "The api-server keeps running so the preview stays up.\n",
    );
  });
  webChild.on("error", (err) => {
    console.error("[dev] failed to start nulls-report:", err.message);
  });

  watchBackend();

  console.log(`\n[dev] Starting Nulls Report portal`);
  console.log(`[dev]   web:  http://localhost:${webPort}`);
  console.log(`[dev]   api:  http://localhost:${apiPort}/api/healthz\n`);
}

void main();
