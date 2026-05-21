#!/usr/bin/env node
// Minimal static file server for the production build emitted by
// `vite.build.config.ts` (default docroot `dev/msm-webgpu/dist`). It also
// re-implements the `/progress` + `/results` JSONL collector from
// `vite.config.ts` so the autorun pages can POST their outcome back and a
// BrowserStack harness can tail the JSONL.
//
// Why this exists: the interactive Vite dev server serves the page as
// hundreds of on-demand-transpiled ESM modules, which never finishes
// loading on a real mobile device behind a Cloudflare Quick Tunnel. A
// bundled static build loads in one shot.
//
// Usage:
//   node dev/msm-webgpu/scripts/serve-static.mjs --port 5199
// Env:
//   MSM_WEBGPU_RESULTS_FILE   (default /tmp/msm-webgpu-results.jsonl)
//   MSM_WEBGPU_PROGRESS_FILE  (default /tmp/msm-webgpu-progress.jsonl)

import http from "node:http";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, "../dist");

const { values: argv } = parseArgs({
  options: { port: { type: "string", default: "5199" } },
});
const port = parseInt(String(argv.port), 10);
const resultsFile = process.env.MSM_WEBGPU_RESULTS_FILE ?? "/tmp/msm-webgpu-results.jsonl";
const progressFile = process.env.MSM_WEBGPU_PROGRESS_FILE ?? "/tmp/msm-webgpu-progress.jsonl";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 8 * 1024 * 1024) reject(new Error("payload too large (>8MB)"));
    });
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

for (const f of [resultsFile, progressFile]) {
  await mkdir(path.dirname(f), { recursive: true });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  process.stdout.write(`[req] ${new Date().toISOString()} ${req.method} ${u.pathname} ua=${(req.headers["user-agent"] ?? "").slice(0, 60)}\n`);
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "POST" && (u.pathname === "/results" || u.pathname === "/progress")) {
    let body = "";
    try {
      body = await readBody(req);
      const parsed = JSON.parse(body);
      const row = { ts: new Date().toISOString(), ...parsed };
      await appendFile(u.pathname === "/results" ? resultsFile : progressFile, JSON.stringify(row) + "\n");
      process.stdout.write(`[post] ${u.pathname} ok bytes=${body.length}\n`);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      process.stdout.write(`[post] ${u.pathname} REJECTED bytes=${body.length} err=${String(e).slice(0, 120)}\n`);
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  let pathname = decodeURIComponent(u.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = path.normalize(path.join(distRoot, pathname));
  if (!filePath.startsWith(distRoot)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", MIME[path.extname(filePath)] ?? "application/octet-stream");
    // The page is reached cross-origin via the tunnel; keep assets fetchable.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`serve-static on http://127.0.0.1:${port} (docroot ${distRoot})\n`);
});
