import path from 'path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

/**
 * In dev, plain `vite` is the command the hosting platform auto-detects and
 * runs. This plugin spawns the Express API server alongside Vite (skipped
 * when the root `dev` orchestration manages the API itself), so a single
 * `vite` process runs the whole stack and `/api` works.
 *
 * The plugin owns the API lifecycle in this mode:
 *  - On startup it replaces a STALE API process left over from a previous
 *    vite session (an orphan still holds the port, so a preview restart
 *    never picked up newly added backend routes).
 *  - It watches backend source files and restarts the API on change, so
 *    route/schema edits go live without a manual preview restart.
 */
function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

/** True when the process on the port answers our API's health endpoint. */
async function isOurApi(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

/** Best-effort: SIGTERM whatever is listening on the port. Returns true if it found something. */
function killOnPort(port: number): boolean {
  const commands = [
    () => execSync(`lsof -ti :${port}`, { encoding: 'utf8', timeout: 5000 }),
    () => execSync(`fuser -n tcp ${port} 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }),
  ];
  for (const run of commands) {
    try {
      const out = run().trim();
      const pids = [...new Set(out.match(/\d+/g) ?? [])];
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM');
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

async function waitForPortClosed(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const API_SRC_DIRS = [
  path.resolve(import.meta.dirname, '..', 'api-server', 'src'),
  path.resolve(import.meta.dirname, '..', 'api-server', 'package.json'),
  path.resolve(import.meta.dirname, '..', '..', 'lib', 'db', 'src'),
  path.resolve(import.meta.dirname, '..', '..', 'lib', 'api-spec'),
];

function apiServerPlugin(): Plugin {
  let child: ChildProcess | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    name: 'spawn-api-server',
    async configureServer(server) {
      if (process.env.NODE_ENV === 'production') return;
      const apiPort = Number(process.env.API_DEV_PORT ?? 8080);
      // The root `dev` orchestration (node ./scripts/dev.mjs) owns the API.
      if (process.env.API_DEV_PORT !== undefined) return;

      const startApi = () => {
        const thisChild = spawn(
          'pnpm',
          ['--filter', '@workspace/api-server', 'run', 'dev'],
          {
            stdio: 'inherit',
            env: { ...process.env, PORT: String(apiPort) },
          },
        );
        child = thisChild;
        thisChild.on('exit', (code, signal) => {
          if (child === thisChild) child = null;
          if (!signal) {
            server.config.logger.error(
              `[api-server] exited with code ${code}. Make sure DATABASE_URL and CLERK_SECRET_KEY are set in the workspace API Keys.`,
            );
          }
        });
      };

      // A stale API from a previous vite session may still hold the port (an
      // orphan survives the old vite process and the next session skips
      // spawning). Replace it so newly added backend routes are served.
      if (await isPortOpen(apiPort)) {
        if (await isOurApi(apiPort)) {
          if (killOnPort(apiPort)) {
            server.config.logger.info('[api-server] replaced a stale API process with the current build');
            await waitForPortClosed(apiPort, 10_000);
          } else {
            server.config.logger.error(
              '[api-server] a stale API process holds the port and could not be stopped — restart the preview from the UI.',
            );
          }
        }
      }

      if (!(await isPortOpen(apiPort))) {
        startApi();
      }

      // Restart the API when its source files change so backend edits go
      // live immediately (the api-server dev script rebuilds on start).
      const scheduleRestart = () => {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          if (child) {
            server.config.logger.info('[api-server] backend sources changed — restarting API');
            child.kill('SIGTERM');
            startApi();
          }
        }, 600);
      };
      server.watcher.add(API_SRC_DIRS);
      const onFile = (file: string) => {
        if (API_SRC_DIRS.some((dir) => file.startsWith(dir))) scheduleRestart();
      };
      server.watcher.on('change', onFile);
      server.watcher.on('add', onFile);
      server.watcher.on('unlink', onFile);

      server.httpServer?.once('close', () => {
        if (restartTimer) clearTimeout(restartTimer);
        child?.kill('SIGTERM');
      });
    },
  };
}

// Freebuff injects PORT for isolated workspaces; default so the config also
// works for plain local builds.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

// In dev the API server runs on its own port; Vite proxies /api to it.
const apiProxyTarget = `http://127.0.0.1:${process.env.API_DEV_PORT ?? 8080}`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    apiServerPlugin(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  // Load env from the monorepo root so keys written to the root .env.local
  // (e.g. by `clerk init` or the platform) reach the app. Real environment
  // variables injected by the platform always take precedence over files.
  envDir: path.resolve(import.meta.dirname, '..', '..'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      // Keep /api/__clerk out of the proxy: in production it is served by the
      // API deployment; in dev Clerk is reached directly from the browser.
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
