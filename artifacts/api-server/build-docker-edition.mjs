// Bundles the Docker edition into a self-contained `server.js` that runs with
// plain `node server.js` — no node_modules required at runtime. All API code,
// routes, and npm dependencies are inlined. pino's worker files are emitted
// next to server.js and must be copied alongside it.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, rmSync, statSync } from "node:fs";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies.
globalThis.require = createRequire(import.meta.url);

const pkgDir = path.dirname(fileURLToPath(import.meta.url)); // artifacts/api-server
const repoRoot = path.resolve(pkgDir, "..", "..");
const editionDir = path.join(repoRoot, "editions", "docker");

// Optional packages that cannot be bundled (native modules / dynamic loads).
// They are only ever required lazily at runtime, and none of the code paths
// used by this app hit them, so externalizing keeps the bundle valid without
// needing them installed.
const EXTERNAL = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "nodemailer",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

// Remove previous generated outputs (never the edition source).
function cleanGenerated() {
  const generated = ["server.js", "server.js.map", "server..js"];
  for (const name of readdirSync(editionDir)) {
    if (name.startsWith("pino-") || name.startsWith("thread-stream-")) {
      generated.push(name);
    }
  }
  for (const name of generated) {
    rmSync(path.join(editionDir, name), { force: true });
  }
}

async function buildEdition() {
  cleanGenerated();
  const result = await esbuild({
    entryPoints: [path.join(editionDir, "src", "server.js")],
    platform: "node",
    bundle: true,
    // ESM output: the app source uses import.meta.url / import.meta.dirname,
    // which only exist in ESM. editions/docker/package.json declares
    // "type": "module" so `node server.js` loads it as ESM.
    format: "esm",
    target: "node20",
    outdir: editionDir,
    outExtension: { ".js": ".js" },
    logLevel: "info",
    external: EXTERNAL,
    // pnpm keeps dependencies in each package's own node_modules; point
    // esbuild at the API server's node_modules so bare imports (express,
    // @workspace/*, …) resolve from the entry under editions/docker.
    nodePaths: [path.join(repoRoot, "artifacts", "api-server", "node_modules")],
    sourcemap: false,
    plugins: [
      // pino relies on workers to handle logging; keep the transports working.
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled
    // continue to work in our esm output file.
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
  const sizeKb = Math.round(statSync(path.join(editionDir, "server.js")).size / 1024);
  const outputs = Object.keys(result.metafile?.outputs ?? {}).map((f) => path.basename(f));
  console.log(`[docker-edition] wrote ${sizeKb} KB bundle + ${outputs.filter((n) => n !== "server.js").join(", ") || "no worker files"}`);
}

buildEdition().catch((err) => {
  console.error(err);
  process.exit(1);
});
