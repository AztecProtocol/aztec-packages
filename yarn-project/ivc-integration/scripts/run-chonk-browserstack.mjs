#!/usr/bin/env node
// Drive the headless Chonk e2e WebGPU prove on one BrowserStack real device (or, with
// --local-headless, on this box's own Chrome) and print a single summary JSON.
//
// Mirrors barretenberg/ts/dev/msm-webgpu/scripts/run-browserstack.mjs, retargeted from
// the MSM Vite page to the Chonk webpack page:
//   1. Start the node static server (scripts/serve-chonk-webgpu.mjs) on a port with
//      CHONK_RESULTS_FILE + CHONK_PROGRESS_FILE set so its sinks append JSONL.
//   2. Open a Cloudflare quick tunnel at the server port; wait until reachable e2e.
//   3. Create a BrowserStack worker pointed at the tunnel's
//      /?autorun=chonk-bench&flow=…&mode=…&target=… URL (the page autoruns on load and
//      POSTs progress + a final result row — see serve.ts maybeAutorunChonkBench).
//   4. Tail the JSONL: detect the client runId, fail fast at firstProgressMs if no row
//      appears, fail at stallMs once progress stops, tear the worker down on every exit.
//   5. Print the parsed result as JSON to stdout.
//
// --local-headless skips BrowserStack entirely and loads the autorun URL in local
// Puppeteer (already an ivc-integration dep) against SwiftShader — use it to validate
// the autorun + POST + JSONL loop end-to-end before spending any BrowserStack minutes.
//
// Usage from yarn-project/ivc-integration:
//   yarn webpack                                            # build dist/ first
//   node scripts/run-chonk-browserstack.mjs --local-headless
//   BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… \
//     node scripts/run-chonk-browserstack.mjs --target macos
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { TARGETS, buildWorkerBody, listTargets } from './bs-targets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_FLOW = 'ecdsar1+transfer_1_recursions+sponsored_fpc';

const { values: argv } = parseArgs({
  options: {
    target: { type: 'string', default: 'macos' },
    flow: { type: 'string', default: DEFAULT_FLOW },
    mode: { type: 'string', default: 'off-on' },
    port: { type: 'string', default: '8099' },
    'first-progress-ms': { type: 'string' },
    'stall-ms': { type: 'string', default: '240000' },
    'deadline-ms': { type: 'string' },
    'bs-timeout': { type: 'string', default: '1800' },
    'results-file': { type: 'string', default: '/tmp/zac-webgpu/chonk-bs-results.jsonl' },
    'progress-file': { type: 'string', default: '/tmp/zac-webgpu/chonk-bs-progress.jsonl' },
    'tunnel-url': { type: 'string' },
    'skip-tunnel': { type: 'boolean', default: false },
    'local-headless': { type: 'boolean', default: false },
    'list-targets': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

function err(msg) {
  process.stderr.write(`[run-chonk-browserstack] ${msg}\n`);
}

if (argv.help) {
  process.stdout.write(`Chonk e2e WebGPU BrowserStack driver

Usage:
  node scripts/run-chonk-browserstack.mjs [options]

Options:
  --target T              BrowserStack preset (default: macos). --list-targets to list.
  --flow F                Pinned flow name (default: ${DEFAULT_FLOW}).
  --mode M                off-on (default) | on-only | off-only.
  --port P                Local server port (default: 8099).
  --first-progress-ms MS  Override first-progress watchdog (default: per-target).
  --stall-ms MS           Max idle between /progress events (default: 240000).
  --deadline-ms MS        Total wall deadline (default: per-target).
  --bs-timeout SEC        BrowserStack worker watchdog seconds (default: 1800, the max).
  --results-file PATH     JSONL output for the final result row.
  --progress-file PATH    JSONL output for per-phase progress events.
  --tunnel-url URL        Skip cloudflared and use a provided URL (debugging only).
  --skip-tunnel           Bind directly to localhost (debugging only).
  --local-headless        Run in local Puppeteer (SwiftShader) instead of BrowserStack.
  --list-targets          Print known target presets and exit.
  --help                  This help text.
`);
  process.exit(0);
}

if (argv['list-targets']) {
  for (const t of listTargets()) {
    process.stdout.write(`${t.key.padEnd(18)}  ${t.label}  [webgpu: ${t.webgpu}]  ${t.notes}\n`);
  }
  process.exit(0);
}

if (!argv['local-headless'] && !TARGETS[argv.target]) {
  err(`unknown --target ${argv.target}; use --list-targets to list`);
  process.exit(2);
}
if (!['off-on', 'on-only', 'off-only'].includes(argv.mode)) {
  err(`--mode must be off-on | on-only | off-only; got ${argv.mode}`);
  process.exit(2);
}

const port = parseInt(String(argv.port), 10);
const stallMs = parseInt(String(argv['stall-ms']), 10);
const bsTimeout = parseInt(String(argv['bs-timeout']), 10);
const preset = TARGETS[argv.target];
const firstProgressMs = argv['first-progress-ms']
  ? parseInt(String(argv['first-progress-ms']), 10)
  : (preset?.firstProgressMs ?? 180_000);
const deadlineMs = argv['deadline-ms'] ? parseInt(String(argv['deadline-ms']), 10) : (preset?.deadlineMs ?? 1_800_000);
const resultsFile = String(argv['results-file']);
const progressFile = String(argv['progress-file']);

function nowIso() {
  return new Date().toISOString();
}

function ensureCleanFile(p) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, '');
}

let serverProc = null;
let cloudflaredProc = null;
let browser = null;
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
  if (browser) {
    try {
      await browser.close();
    } catch {}
    browser = null;
  }
  for (const [name, proc] of [
    ['cloudflared', cloudflaredProc],
    ['server', serverProc],
  ]) {
    if (proc) {
      try {
        proc.kill('SIGTERM');
      } catch {}
    }
    if (name === 'cloudflared') cloudflaredProc = null;
    if (name === 'server') serverProc = null;
  }
}

process.on('SIGINT', async () => {
  err('SIGINT');
  await teardown();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  err('SIGTERM');
  await teardown();
  process.exit(143);
});

function preflight() {
  const distIndex = path.join(PROJECT_ROOT, 'dist', 'index.js');
  if (!existsSync(distIndex)) {
    throw new Error(`webpack bundle missing at ${distIndex}. Run \`yarn webpack\` in ${PROJECT_ROOT} first.`);
  }
  const pinned = path.join(
    PROJECT_ROOT,
    '..',
    'end-to-end',
    'example-app-ivc-inputs-out',
    argv.flow,
    'ivc-inputs.msgpack',
  );
  if (!existsSync(pinned)) {
    throw new Error(
      `pinned inputs missing for flow="${argv.flow}" at ${pinned}.\n` +
        `Run from barretenberg/cpp:\n  ./scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs`,
    );
  }
}

function startServer() {
  const serverScript = path.join(PROJECT_ROOT, 'scripts', 'serve-chonk-webgpu.mjs');
  const args = [serverScript, '--port', String(port), '--host', '127.0.0.1'];
  err(`starting server: node ${args.join(' ')}`);
  const proc = spawn('node', args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, CHONK_RESULTS_FILE: resultsFile, CHONK_PROGRESS_FILE: progressFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', d => process.stderr.write(`[server] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[server!] ${d}`));
  proc.on('exit', (code, signal) => {
    err(`server exited code=${code} signal=${signal}`);
    if (serverProc === proc) serverProc = null;
  });
  return proc;
}

async function waitForServerReady() {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.status === 200) {
        err(`server reachable at ${url}`);
        return;
      }
    } catch {
      // not yet
    }
    await sleep(500);
  }
  throw new Error(`server did not become reachable at ${url} within 60s`);
}

function startCloudflared() {
  const bin = '/tmp/bin/cloudflared';
  if (!existsSync(bin)) {
    throw new Error(
      `cloudflared not found at ${bin}. Install with:\n  curl -sL -o ${bin} https://github.com/cloudflare/cloudflared/releases/download/2025.4.0/cloudflared-linux-amd64 && chmod +x ${bin}`,
    );
  }
  const args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
  err(`starting cloudflared: ${bin} ${args.join(' ')}`);
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const onData = d => {
    buf += d.toString();
    process.stderr.write(`[cf] ${d}`);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('exit', (code, signal) => {
    err(`cloudflared exited code=${code} signal=${signal}`);
    if (cloudflaredProc === proc) cloudflaredProc = null;
  });
  proc.__getBuf = () => buf;
  return proc;
}

async function waitForTunnelUrl(proc) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const m = proc.__getBuf().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      const url = m[0];
      err(`tunnel URL: ${url}`);
      const probeUrl = `${url}/`;
      const probeDeadline = Date.now() + 120_000;
      while (Date.now() < probeDeadline) {
        try {
          const r = await fetch(probeUrl, { method: 'GET' });
          if (r.status === 200) {
            err(`tunnel reachable end-to-end: ${probeUrl}`);
            return url;
          }
        } catch {
          // not yet
        }
        await sleep(2_000);
      }
      throw new Error(`tunnel URL ${url} not reachable end-to-end within 120s of probing`);
    }
    await sleep(500);
  }
  throw new Error('cloudflared did not print a tunnel URL within 90s');
}

async function createWorker(body) {
  const user = process.env.BROWSERSTACK_USERNAME ?? process.env.BROWSERSTACK_USER_NAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!user || !key) {
    throw new Error('BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY must be set for the REST path.');
  }
  const r = await fetch('https://api.browserstack.com/5/worker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`,
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
  if (!user || !key) return;
  const r = await fetch(`https://api.browserstack.com/5/worker/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}` },
  });
  if (!r.ok) {
    err(`BS DELETE /5/worker/${id} failed: ${r.status}`);
  }
}

function readJsonl(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildPageUrl(baseUrl) {
  const qp = new URLSearchParams();
  qp.set('autorun', 'chonk-bench');
  qp.set('flow', argv.flow);
  qp.set('mode', argv.mode);
  qp.set('target', argv.target);
  return `${baseUrl}/?${qp.toString()}`;
}

// Block until the runId's /results row appears, enforcing the first-progress / stall /
// deadline watchdogs against the progress JSONL.
async function waitForResult(runId) {
  const start = Date.now();
  let lastProgressTs = null;
  let firstProgressSeen = false;
  while (Date.now() - start < deadlineMs) {
    const rows = readJsonl(resultsFile).filter(r => r.runId === runId);
    if (rows.length > 0) {
      return rows[rows.length - 1];
    }
    const prog = readJsonl(progressFile).filter(r => r.runId === runId);
    if (prog.length > 0) {
      const lastTs = Date.parse(prog[prog.length - 1].ts);
      if (!firstProgressSeen) {
        firstProgressSeen = true;
        err(`first /progress event after ${((lastTs - start) / 1000).toFixed(1)}s`);
      }
      lastProgressTs = lastTs;
    }
    if (!firstProgressSeen && Date.now() - start > firstProgressMs) {
      throw new Error(`no-first-progress: no /progress event after ${firstProgressMs}ms`);
    }
    if (firstProgressSeen && Date.now() - lastProgressTs > stallMs) {
      throw new Error(`stall: no /progress event for ${stallMs}ms (last at ${new Date(lastProgressTs).toISOString()})`);
    }
    await sleep(1_000);
  }
  throw new Error(`deadline: no /results row within ${deadlineMs}ms`);
}

// Local Puppeteer path: load the autorun URL on this box's headless Chrome (SwiftShader)
// so the full autorun → POST → JSONL loop is exercised without any BrowserStack spend.
async function runLocalHeadless(pageUrl) {
  const { launch } = await import('puppeteer');
  browser = await launch({
    headless: true,
    protocolTimeout: Math.max(deadlineMs, 600_000),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-webgpu',
      '--enable-webgpu-developer-features',
      '--disable-vulkan-fallback-to-gl-for-testing',
    ],
  });
  const page = await browser.newPage();
  page.on('console', m => process.stderr.write(`[page] ${m.text()}\n`));
  page.on('pageerror', e => err(`pageerror: ${e.message}`));
  err(`local-headless navigating to ${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

async function main() {
  preflight();
  ensureCleanFile(resultsFile);
  ensureCleanFile(progressFile);

  const useTunnel = !argv['local-headless'] && !argv['skip-tunnel'];
  serverProc = startServer();
  await waitForServerReady();
  if (useTunnel) {
    cloudflaredProc = startCloudflared();
  }
  const baseUrl = argv['tunnel-url']
    ? argv['tunnel-url']
    : useTunnel
      ? await waitForTunnelUrl(cloudflaredProc)
      : `http://127.0.0.1:${port}`;

  const pageUrl = buildPageUrl(baseUrl);
  err(`page URL: ${pageUrl}`);

  // The page self-generates its runId; snapshot existing ones so we can spot the new row.
  const seenRunIds = new Set([...readJsonl(resultsFile), ...readJsonl(progressFile)].map(r => r.runId));

  let created = null;
  if (argv['local-headless']) {
    await runLocalHeadless(pageUrl);
  } else {
    const stamp = nowIso().replace(/[:.]/g, '-');
    const body = buildWorkerBody(argv.target, pageUrl, {
      name: `chonk-webgpu-${argv.target}-${stamp}`,
      build: `chonk-webgpu-${nowIso().slice(0, 10)}`,
      timeoutSec: bsTimeout,
    });
    err(`BS worker body: ${JSON.stringify(body)}`);
    created = await createWorker(body);
    workerId = created.id;
    err(`BS worker started: id=${workerId} browser_url=${created.browser_url}`);
  }

  // Identify the new runId once a row shows up.
  const idDeadline = Date.now() + firstProgressMs;
  let runId = null;
  while (Date.now() < idDeadline) {
    const fresh = [...readJsonl(progressFile), ...readJsonl(resultsFile)].find(
      r => r.runId && !seenRunIds.has(r.runId),
    );
    if (fresh) {
      runId = fresh.runId;
      err(`detected runId: ${runId}`);
      break;
    }
    await sleep(1_000);
  }
  if (!runId) {
    throw new Error(
      `no-first-progress: no JSONL row within ${firstProgressMs}ms — the page likely never loaded/autoran`,
    );
  }

  const final = await waitForResult(runId);
  err(`final state: ${final.state}`);

  const speedup = final.off?.proveMs && final.on?.proveMs ? +(final.off.proveMs / final.on.proveMs).toFixed(3) : null;
  const out = {
    target: argv.target,
    targetLabel: preset?.label ?? 'local-headless',
    flow: argv.flow,
    mode: argv.mode,
    pageUrl,
    workerId,
    browserUrl: created?.browser_url ?? null,
    runId,
    speedup,
    final,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return final.state === 'done' ? 0 : 1;
}

main()
  .then(async code => {
    await teardown();
    process.exit(code ?? 0);
  })
  .catch(async e => {
    err(`fatal: ${e.stack ?? e.message ?? String(e)}`);
    await teardown();
    process.exit(99);
  });
