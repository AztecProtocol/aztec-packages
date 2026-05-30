#!/usr/bin/env node
// Drive a WebGPU MSM bench/sanity page on a BrowserStack real device.
//
// Pattern mirrors `barretenberg/wasm-bench/scripts/run-browserstack.mjs`
// from the wasm-bench-browserstack skill:
//   1. Start a local Vite dev server (the msm-webgpu dev page) on a port
//      with `MSM_WEBGPU_RESULTS_FILE` + `MSM_WEBGPU_PROGRESS_FILE` set so
//      the in-process middleware appends JSONL.
//   2. Open a Cloudflare Quick Tunnel pointed at the Vite port. Wait for
//      the URL to be reachable end-to-end.
//   3. Create a BrowserStack worker via MCP (when run via Claude/Cloxy
//      tooling) or REST (when env credentials are set). The worker URL
//      points at the chosen dev page (`bench-batch-affine.html?reps=…` or
//      `index.html` for the sanity check) on the tunnel host.
//   4. Tail the results/progress JSONL. Fail fast at `firstProgressMs`
//      if no `/progress` row appears; fail at `stallMs` once progress
//      stops; tear down the worker on every exit path.
//   5. Print the parsed results as JSON to stdout for the caller to
//      consume.
//
// Usage:
//   node dev/msm-webgpu/scripts/run-browserstack.mjs --target s25-ultra --n 16
//
// Runs index.html's GPU-vs-WASM MSM cross-check (?autorun=msm-cross-check)
// on a BrowserStack real device. For a local headless run on the dev
// box's own GPU, use drive-index.mjs instead.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildWorkerBody, listTargets, TARGETS } from "./bs-targets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TS_ROOT = path.resolve(__dirname, "../../..");

const { values: argv } = parseArgs({
  options: {
    target: { type: "string", default: "macos" },
    page: { type: "string", default: "index" },
    reps: { type: "string", default: "3" },
    total: { type: "string" },
    sizes: { type: "string" },
    n: { type: "string" },
    entries: { type: "string" },
    buckets: { type: "string" },
    seed: { type: "string" },
    skew: { type: "string" },
    port: { type: "string", default: "5198" },
    "first-progress-ms": { type: "string" },
    "stall-ms": { type: "string", default: "180000" },
    "deadline-ms": { type: "string", default: "600000" },
    "bs-timeout": { type: "string", default: "1800" },
    "results-file": { type: "string", default: "/tmp/msm-webgpu-results.jsonl" },
    "progress-file": { type: "string", default: "/tmp/msm-webgpu-progress.jsonl" },
    "tunnel-url": { type: "string" },
    "skip-tunnel": { type: "boolean", default: false },
    "list-targets": { type: "boolean", default: false },
    autorun: { type: "string", default: "msm-cross-check" },
    query: { type: "string" },
    "emit-body-only": { type: "boolean", default: false },
    "external-worker-id-file": { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

function err(msg) {
  process.stderr.write(`[run-browserstack] ${msg}\n`);
}

if (argv.help) {
  process.stdout.write(
    `WebGPU MSM BrowserStack driver

Usage:
  node dev/msm-webgpu/scripts/run-browserstack.mjs [options]

Options:
  --target T              BrowserStack preset (default: macos). --list-targets to list.
  --page P                Dev page (only \`index\` is defined). Default: index.
  --n LOGN                ?logn for index.html (log2 of the MSM size). Default: 16.
  --reps R                ?reps query param for the bench page. Default: 3.
  --total N               ?total query param (TOTAL_PAIRS). Optional.
  --sizes A,B,C           ?sizes query param for selective batch sizes. Optional.
  --port P                Local Vite port (default: 5198).
  --first-progress-ms MS  Override first-progress watchdog (default: per-target).
  --stall-ms MS           Max idle between /progress events (default: 180000).
  --deadline-ms MS        Total wall deadline (default: 600000).
  --bs-timeout SEC        BrowserStack worker watchdog seconds (default: 1800).
  --results-file PATH     JSONL output for final-result rows.
  --progress-file PATH    JSONL output for per-batch progress events.
  --tunnel-url URL        Skip cloudflared and use a provided URL (debugging only).
  --skip-tunnel           Bind directly to localhost (only useful in debugging).
  --list-targets          Print known target presets and exit.
  --help                  This help text.
`,
  );
  process.exit(0);
}

if (argv["list-targets"]) {
  for (const t of listTargets()) {
    process.stdout.write(`${t.key.padEnd(18)}  ${t.label}  [webgpu: ${t.webgpu}]  ${t.notes}\n`);
  }
  process.exit(0);
}

const reps = parseInt(String(argv.reps), 10);
if (!Number.isFinite(reps) || reps <= 0 || reps > 50) {
  err(`--reps must be in (0,50]; got ${argv.reps}`);
  process.exit(2);
}
const port = parseInt(String(argv.port), 10);
const stallMs = parseInt(String(argv["stall-ms"]), 10);
const deadlineMs = parseInt(String(argv["deadline-ms"]), 10);
const bsTimeout = parseInt(String(argv["bs-timeout"]), 10);
const firstProgressMs = argv["first-progress-ms"]
  ? parseInt(String(argv["first-progress-ms"]), 10)
  : (TARGETS[argv.target]?.firstProgressMs ?? 120_000);
const resultsFile = String(argv["results-file"]);
const progressFile = String(argv["progress-file"]);

if (!TARGETS[argv.target]) {
  err(`unknown --target ${argv.target}; use --list-targets to list`);
  process.exit(2);
}

const pageMap = {
  index: "/dev/msm-webgpu/index.html",
};
if (!pageMap[argv.page]) {
  err(`unknown --page ${argv.page}; known: ${Object.keys(pageMap).join(", ")}`);
  process.exit(2);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureCleanFile(p) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, "");
}

let viteProc = null;
let cloudflaredProc = null;
let workerId = null;

async function teardown() {
  if (workerId) {
    err(`deleting BS worker ${workerId}`);
    try {
      await deleteWorker(workerId);
    } catch (e) {
      err(`worker delete failed: ${e.message}`);
    }
    workerId = null;
  }
  if (cloudflaredProc) {
    try {
      cloudflaredProc.kill("SIGTERM");
    } catch {}
    cloudflaredProc = null;
  }
  if (viteProc) {
    try {
      viteProc.kill("SIGTERM");
    } catch {}
    viteProc = null;
  }
}

process.on("SIGINT", async () => {
  err("SIGINT");
  await teardown();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  err("SIGTERM");
  await teardown();
  process.exit(143);
});

function startVite() {
  // Run from barretenberg/ts root.
  const cwd = TS_ROOT;
  const viteBin = path.join(cwd, "node_modules/.bin/vite");
  if (!existsSync(viteBin)) {
    throw new Error(
      `vite not found at ${viteBin}. Run \`yarn install\` in ${cwd} first.`,
    );
  }
  const args = [
    "--config",
    "dev/msm-webgpu/vite.config.ts",
    "--port",
    String(port),
    "--strictPort",
    "--no-open",
    "--host",
    "127.0.0.1",
  ];
  err(`starting vite: ${viteBin} ${args.join(" ")}`);
  const env = {
    ...process.env,
    MSM_WEBGPU_RESULTS_FILE: resultsFile,
    MSM_WEBGPU_PROGRESS_FILE: progressFile,
  };
  const proc = spawn(viteBin, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => process.stderr.write(`[vite] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[vite!] ${d}`));
  proc.on("exit", (code, signal) => {
    err(`vite exited code=${code} signal=${signal}`);
    if (viteProc === proc) viteProc = null;
  });
  return proc;
}

async function waitForViteReady() {
  const url = `http://127.0.0.1:${port}${pageMap[argv.page]}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.status === 200) {
        err(`vite reachable at ${url}`);
        return;
      }
    } catch {
      // not yet
    }
    await sleep(500);
  }
  throw new Error(`vite did not become reachable at ${url} within 60s`);
}

function startCloudflared() {
  const bin = "/tmp/bin/cloudflared";
  if (!existsSync(bin)) {
    throw new Error(
      `cloudflared not found at ${bin}. Install with:\n  curl -sL -o ${bin} https://github.com/cloudflare/cloudflared/releases/download/2025.4.0/cloudflared-linux-amd64 && chmod +x ${bin}`,
    );
  }
  const args = [
    "tunnel",
    "--no-autoupdate",
    "--url",
    `http://127.0.0.1:${port}`,
  ];
  err(`starting cloudflared: ${bin} ${args.join(" ")}`);
  const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let buf = "";
  proc.stdout.on("data", (d) => {
    buf += d.toString();
    process.stderr.write(`[cf] ${d}`);
  });
  proc.stderr.on("data", (d) => {
    buf += d.toString();
    process.stderr.write(`[cf] ${d}`);
  });
  proc.on("exit", (code, signal) => {
    err(`cloudflared exited code=${code} signal=${signal}`);
    if (cloudflaredProc === proc) cloudflaredProc = null;
  });
  proc.__getBuf = () => buf;
  return proc;
}

async function waitForTunnelUrl(proc) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const buf = proc.__getBuf();
    const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      const url = m[0];
      err(`tunnel URL: ${url}`);
      // Wait for the edge to actually route traffic (the URL prints
      // fast but the route propagation takes ~20-40s).
      const probeUrl = `${url}${pageMap[argv.page]}`;
      const probeDeadline = Date.now() + 120_000;
      while (Date.now() < probeDeadline) {
        try {
          const r = await fetch(probeUrl, { method: "GET" });
          if (r.status === 200) {
            err(`tunnel reachable end-to-end: ${probeUrl}`);
            return url;
          }
        } catch {
          // not yet
        }
        await sleep(2_000);
      }
      throw new Error(
        `tunnel URL ${url} not reachable end-to-end within 120s of probing`,
      );
    }
    await sleep(500);
  }
  throw new Error("cloudflared did not print a tunnel URL within 90s");
}

async function createWorker(body) {
  const user = process.env.BROWSERSTACK_USERNAME ?? process.env.BROWSERSTACK_USER_NAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!user || !key) {
    throw new Error(
      "BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY must be set to use this script directly. " +
        "When running under Claude/Cloxy, drive `browserstack_create_worker` via MCP instead.",
    );
  }
  const r = await fetch("https://api.browserstack.com/5/worker", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`BS POST /5/worker failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function deleteWorker(id) {
  const user = process.env.BROWSERSTACK_USERNAME ?? process.env.BROWSERSTACK_USER_NAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!user || !key) return; // MCP path handles teardown externally
  const r = await fetch(`https://api.browserstack.com/5/worker/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}`,
    },
  });
  if (!r.ok) {
    err(`BS DELETE /5/worker/${id} failed: ${r.status}`);
  }
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  const txt = readFileSync(path, "utf8");
  return txt
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitForResult(runId) {
  const start = Date.now();
  let lastProgressTs = null;
  let firstProgressSeen = false;
  while (Date.now() - start < deadlineMs) {
    const rows = readJsonl(resultsFile).filter((r) => r.runId === runId);
    if (rows.length > 0) {
      return rows[rows.length - 1];
    }
    const prog = readJsonl(progressFile).filter((r) => r.runId === runId);
    if (prog.length > 0) {
      const last = prog[prog.length - 1];
      const lastTs = Date.parse(last.ts);
      if (!firstProgressSeen) {
        firstProgressSeen = true;
        err(`first /progress event after ${((lastTs - start) / 1000).toFixed(1)}s`);
      }
      lastProgressTs = lastTs;
    }
    if (!firstProgressSeen && Date.now() - start > firstProgressMs) {
      throw new Error(
        `no-first-progress: no /progress event after ${firstProgressMs}ms`,
      );
    }
    if (firstProgressSeen && Date.now() - lastProgressTs > stallMs) {
      throw new Error(
        `stall: no /progress event for ${stallMs}ms (last at ${new Date(lastProgressTs).toISOString()})`,
      );
    }
    await sleep(1_000);
  }
  throw new Error(`deadline: no /results row within ${deadlineMs}ms`);
}

async function main() {
  ensureCleanFile(resultsFile);
  ensureCleanFile(progressFile);

  if (!argv["skip-tunnel"]) {
    viteProc = startVite();
    await waitForViteReady();
    cloudflaredProc = startCloudflared();
  }
  const baseUrl = argv["tunnel-url"]
    ? argv["tunnel-url"]
    : argv["skip-tunnel"]
      ? `http://127.0.0.1:${port}`
      : await waitForTunnelUrl(cloudflaredProc);

  // Build the index.html autorun URL: ?coi=1 gives the cross-origin
  // isolation the threaded WASM needs; --autorun selects msm-cross-check
  // (default) or msm-bench (timed reps with per-phase GPU breakdown).
  const qp = new URLSearchParams();
  qp.set("coi", "1");
  qp.set("autorun", argv.autorun);
  qp.set("logn", String(argv.n ?? "16"));
  if (argv.reps) qp.set("reps", String(argv.reps));
  // Pass through arbitrary extra query params (e.g. "sweep=8,4,2&cachedx=1")
  // so the gpu-bench / noble-check autorun modes can be driven on-device.
  if (argv.query) {
    for (const [k, v] of new URLSearchParams(argv.query)) qp.set(k, v);
  }
  const pageUrl = `${baseUrl}${pageMap[argv.page]}?${qp.toString()}`;
  err(`page URL: ${pageUrl}`);

  // Generate a runId on the client side (the page makes its own random
  // runId). We can't predict it from here, so we accept the first
  // matching `runId` we see in the progress/results JSONL after this
  // call. Take a snapshot of existing runIds to ignore them.
  const seenRunIds = new Set(
    [...readJsonl(resultsFile), ...readJsonl(progressFile)].map((r) => r.runId),
  );

  const stamp = nowIso().replace(/[:.]/g, "-");
  const body = buildWorkerBody(argv.target, pageUrl, {
    name: `msm-webgpu-${argv.page}-${stamp}`,
    build: `msm-webgpu-${new Date().toISOString().slice(0, 10)}`,
    timeoutSec: bsTimeout,
  });
  err(`BS worker body: ${JSON.stringify(body)}`);
  if (argv["emit-body-only"]) {
    writeFileSync("/tmp/msm-webgpu-bs-body.json", JSON.stringify(body));
    err(`wrote BS body to /tmp/msm-webgpu-bs-body.json`);
  }
  let created;
  if (argv["emit-body-only"]) {
    // External orchestrator (Claude via MCP) dispatches the BS worker
    // and writes the returned worker_id to --external-worker-id-file.
    const idFile = argv["external-worker-id-file"];
    if (!idFile) {
      throw new Error(`--emit-body-only requires --external-worker-id-file`);
    }
    err(`waiting for external worker_id at ${idFile} (up to 300s)`);
    const idDeadline = Date.now() + 300_000;
    while (Date.now() < idDeadline) {
      if (existsSync(idFile)) {
        const txt = readFileSync(idFile, "utf8").trim();
        if (txt.length > 0) {
          try {
            created = JSON.parse(txt);
          } catch {
            created = { id: txt, browser_url: "(external)" };
          }
          break;
        }
      }
      await sleep(1_000);
    }
    if (!created) throw new Error(`external worker_id never appeared at ${idFile}`);
  } else {
    created = await createWorker(body);
  }
  workerId = created.id;
  err(`BS worker started: id=${workerId} browser_url=${created.browser_url}`);

  // Identify the new runId once it shows up.
  const idDeadline = Date.now() + firstProgressMs;
  let runId = null;
  while (Date.now() < idDeadline) {
    const rows = [...readJsonl(progressFile), ...readJsonl(resultsFile)];
    const fresh = rows.find((r) => r.runId && !seenRunIds.has(r.runId));
    if (fresh) {
      runId = fresh.runId;
      err(`detected runId: ${runId}`);
      break;
    }
    await sleep(1_000);
  }
  if (!runId) {
    throw new Error(
      `no-first-progress: no JSONL row appeared within ${firstProgressMs}ms — BS worker likely never reached the page`,
    );
  }

  const final = await waitForResult(runId);
  err(`final state: ${final.state} (${final.results?.length ?? 0} batches)`);

  // Headline summary.
  const out = {
    target: argv.target,
    targetLabel: TARGETS[argv.target].label,
    page: argv.page,
    pageUrl,
    workerId,
    browserUrl: created.browser_url,
    runId,
    final,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");

  if (final.state !== "done") {
    process.stderr.write(
      `\n==== headline ====\nstate=${final.state} error=${final.error ?? ""}\n`,
    );
    return 1;
  }
  const summary = JSON.stringify(final.results ?? {});
  process.stderr.write(`\n==== headline ====\nstate=done\n${summary}\n`);
  return 0;
}

main()
  .then(async (code) => {
    await teardown();
    process.exit(code ?? 0);
  })
  .catch(async (e) => {
    err(`fatal: ${e.stack ?? e.message ?? String(e)}`);
    await teardown();
    process.exit(99);
  });
