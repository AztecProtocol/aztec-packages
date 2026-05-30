#!/usr/bin/env node
// Persistent serve+tunnel for BrowserStack MSM runs. Starts the msm-webgpu
// Vite dev server (with RESULTS/PROGRESS JSONL middleware) and a Cloudflare
// quick tunnel, writes the public base URL to /tmp/bs-base-url.txt, then stays
// alive. Drive many BrowserStack workers (one config at a time) against the
// same tunnel via the MCP browserstack tools; tail /tmp/msm-webgpu-results.jsonl
// for each run's final row. Kill this process to tear everything down.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(__dirname, "../../..");
const PORT = process.env.MSM_PORT || "5210";
const RESULTS = process.env.MSM_WEBGPU_RESULTS_FILE || "/tmp/msm-webgpu-results.jsonl";
const PROGRESS = process.env.MSM_WEBGPU_PROGRESS_FILE || "/tmp/msm-webgpu-progress.jsonl";

writeFileSync(RESULTS, "");
writeFileSync(PROGRESS, "");

const vite = spawn(path.join(TS_ROOT, "node_modules/.bin/vite"),
  ["--config", "dev/msm-webgpu/vite.config.ts", "--port", PORT, "--strictPort", "--no-open", "--host", "127.0.0.1"],
  { cwd: TS_ROOT, env: { ...process.env, MSM_WEBGPU_RESULTS_FILE: RESULTS, MSM_WEBGPU_PROGRESS_FILE: PROGRESS }, stdio: ["ignore", "pipe", "pipe"] });
vite.stdout.on("data", d => process.stderr.write(`[vite] ${d}`));
vite.stderr.on("data", d => process.stderr.write(`[vite!] ${d}`));

async function waitVite() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/dev/msm-webgpu/msm-correctness.html`); if (r.status === 200) return; } catch {}
    await sleep(500);
  }
  throw new Error("vite not reachable");
}
await waitVite();
process.stderr.write(`[bs-serve] vite up on ${PORT}\n`);

const cf = spawn("/tmp/bin/cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
let buf = "";
const onData = d => { buf += d.toString(); process.stderr.write(`[cf] ${d}`); };
cf.stdout.on("data", onData);
cf.stderr.on("data", onData);

let base = null;
for (let i = 0; i < 180 && !base; i++) {
  const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m) base = m[0];
  else await sleep(500);
}
if (!base) throw new Error("no tunnel url");

// Probe end-to-end.
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${base}/dev/msm-webgpu/msm-correctness.html`); if (r.status === 200) break; } catch {}
  await sleep(2000);
}
writeFileSync("/tmp/bs-base-url.txt", base);
process.stderr.write(`[bs-serve] READY base=${base}\n`);

process.on("SIGTERM", () => { try { cf.kill(); } catch {} try { vite.kill(); } catch {} process.exit(0); });
await new Promise(() => {}); // stay alive
