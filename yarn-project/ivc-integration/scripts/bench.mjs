#!/usr/bin/env node
// One command to drive the WebGPU bench across every device from this box.
//
//   node scripts/bench.mjs devices                 # discover + identify all devices
//   node scripts/bench.mjs probe                   # capability probe (diag) on every device
//   node scripts/bench.mjs probe --mode gpu-smoke  # GPU device-loss / TDR ladder (phones)
//   node scripts/bench.mjs chonk                   # chonk e2e off-vs-on across every device
//   node scripts/bench.mjs msm   --logn 16         # MSM-isolation GPU↔WASM cross-check
//
//   --devices all|mac,s23,...   which registry devices to run (default: all resolved)
//   --mode <m>                  chonk: off-on|on-only|off-only|paired-sweep ; probe: diag|gpu-smoke
//   --flow <flow>               chonk pinned flow
//   --logn <N>                  msm logN (default 14)
//   --levels <csv>              gpu-smoke iteration ladder
//   --serial / --parallel       force device execution order (defaults per bench)
//   --timeout <sec>             per-run global deadline override
//   --force                     run GPU even on devices flagged caps.webgpuMsm=device-lost
//   --dry-run                   resolve devices + print URLs, launch nothing
//   --out <file>                markdown report path
//
// The Mac is driven over CDP (9222 reverse tunnel); the phones over the Mac's
// tunneled adb server (5037). Every device just opens an `?autorun=` URL and POSTs
// its result to the dev server's /results JSONL sink, which this script tails and
// attributes back per device via the `target` field. See scripts/SETUP.md.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';

import * as adb from './adb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(path.join(__dirname, 'devices.json'), 'utf8'));
const HISTORY = '/tmp/zac-webgpu/bench-history.jsonl';
const DEFAULT_FLOW = 'ecdsar1+transfer_1_recursions+sponsored_fpc';
// Page server port the devices load from. Override with PAGE_PORT when the default
// 8080 -L forward is wedged on the Mac and a virgin local port is forwarded instead
// (the box server still listens on 8080; the Mac maps e.g. 9080 -> box:8080).
const PAGE_PORT = Number(process.env.PAGE_PORT) || 8080;
// Host the devices load the page from. Defaults to 127.0.0.1 (IPv4, per SETUP.md),
// but if only the IPv6 `localhost` (::1) forward is live on the Mac, set PAGE_HOST=localhost.
const PAGE_HOST = process.env.PAGE_HOST || '127.0.0.1';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowMs = () => Date.now();
function log(msg) {
  process.stderr.write(`[bench] ${msg}\n`);
}

// ─── bench definitions ──────────────────────────────────────────────────────
// Each maps a subcommand to a served page, its autorun param, the JSONL sink to
// tail, and how to render its result rows. chonk/probe share the chonk page+sink.
const chonkSink = {
  results: process.env.CHONK_RESULTS_FILE ?? '/tmp/zac-webgpu/chonk-bs-results.jsonl',
  progress: process.env.CHONK_PROGRESS_FILE ?? '/tmp/zac-webgpu/chonk-bs-progress.jsonl',
};
const chonkServerHint = 'start the chonk page: (cd yarn-project/ivc-integration && yarn serve:chonk-webgpu)';

const BENCHES = {
  chonk: {
    port: PAGE_PORT,
    pagePath: '/',
    results: chonkSink.results,
    progress: chonkSink.progress,
    parallelDefault: true,
    deadlineMs: 30 * 60 * 1000,
    serverHint: chonkServerHint,
    defaultMode: 'off-on',
    needsGpu: o => o.mode !== 'off-only',
    buildUrl(dev, o) {
      const p = new URLSearchParams({ autorun: 'chonk-bench', target: dev.key, mode: o.mode, flow: o.flow });
      if (dev.threads) p.set('threads', String(dev.threads));
      return urlFor(this.port, this.pagePath, p);
    },
    render: renderChonk,
  },
  probe: {
    port: PAGE_PORT,
    pagePath: '/',
    results: chonkSink.results,
    progress: chonkSink.progress,
    parallelDefault: true,
    deadlineMs: 8 * 60 * 1000,
    serverHint: chonkServerHint,
    defaultMode: 'diag',
    // Never gated: diag does no GPU work, and gpu-smoke IS the device-loss probe
    // (it recreates the device after each loss) — we want it on the S23 especially.
    needsGpu: () => false,
    buildUrl(dev, o) {
      const p = new URLSearchParams({ autorun: 'chonk-bench', target: dev.key, mode: o.mode });
      if (o.levels) p.set('levels', o.levels);
      return urlFor(this.port, this.pagePath, p);
    },
    render: (devs, opts) => (opts.mode === 'gpu-smoke' ? renderGpuSmoke(devs) : renderDiag(devs)),
  },
  msm: {
    port: 5173,
    pagePath: '/dev/msm-webgpu/index.html',
    results: process.env.MSM_WEBGPU_RESULTS_FILE ?? '/tmp/msm-webgpu-results.jsonl',
    progress: process.env.MSM_WEBGPU_PROGRESS_FILE ?? '/tmp/msm-webgpu-progress.jsonl',
    // The MSM page's /progress rows don't carry `target`; serialize so the watchdog
    // attributes unambiguously. (/results rows do carry target via the autorun tweak.)
    parallelDefault: false,
    deadlineMs: 12 * 60 * 1000,
    serverHint: 'start the MSM page: (cd barretenberg/ts && yarn dev:msm-webgpu)',
    defaultMode: 'msm-cross-check',
    needsGpu: () => true,
    buildUrl(dev, o) {
      const p = new URLSearchParams({ autorun: 'msm-cross-check', target: dev.key, logn: String(o.logn), coi: '1' });
      return urlFor(this.port, this.pagePath, p);
    },
    render: renderMsm,
  },
};

// Devices load from PAGE_HOST:port — default 127.0.0.1 (IPv4): the Mac's `-L`
// forward and the phone's `adb reverse` bind IPv4 loopback, so `localhost` risks an
// IPv6 (::1) miss. Override PAGE_HOST/PAGE_PORT only to route around a wedged forward.
function urlFor(port, pagePath, params) {
  return `http://${PAGE_HOST}:${port}${pagePath}?${params.toString()}`;
}

// ─── device resolution ──────────────────────────────────────────────────────
// Match the live adb devices to registry entries by their `match` regex, and keep
// the cdp entries as-is. Returns { resolved, liveAdb, unmatched, missing }.
async function resolveDevices() {
  let liveAdb = [];
  let adbError = null;
  try {
    await adb.assertServerReachable();
    liveAdb = (await adb.listDevices()).filter(
      d => d.state === 'device' || d.state === 'unauthorized' || d.state === 'offline',
    );
  } catch (e) {
    adbError = e.message;
  }
  const ready = liveAdb.filter(d => d.state === 'device');

  const resolved = [];
  const usedSerials = new Set();
  for (const [key, entry] of Object.entries(registry)) {
    if (key.startsWith('_')) continue;
    if (entry.driver === 'cdp') {
      resolved.push({ key, ...entry });
      continue;
    }
    const re = entry.match ? new RegExp(entry.match, 'i') : null;
    const hit = re
      ? ready.find(d => !usedSerials.has(d.serial) && re.test(`${d.marketName} ${d.modelName} ${d.model}`))
      : undefined;
    if (hit) {
      usedSerials.add(hit.serial);
      resolved.push({ key, ...entry, serial: hit.serial, marketName: hit.marketName, sdk: hit.sdk });
    } else {
      resolved.push({ key, ...entry, serial: null }); // declared but not currently attached
    }
  }
  const unmatched = ready.filter(d => !usedSerials.has(d.serial)); // attached but no registry entry
  return { resolved, liveAdb, ready, unmatched, adbError };
}

function selectDevices(resolved, selector) {
  const usable = resolved.filter(d => d.driver === 'cdp' || d.serial);
  if (!selector || selector === 'all') return usable;
  const want = selector
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const out = [];
  for (const key of want) {
    const d = resolved.find(r => r.key === key);
    if (!d) {
      log(`⚠ unknown device "${key}" (not in devices.json)`);
      continue;
    }
    if (d.driver === 'adb' && !d.serial) {
      log(`⚠ device "${key}" is declared but not attached — skipping`);
      continue;
    }
    out.push(d);
  }
  return out;
}

// ─── server reachability ────────────────────────────────────────────────────
function ping(port, pagePath) {
  return new Promise(resolve => {
    const req = httpRequest({ host: '127.0.0.1', port, path: pagePath, method: 'GET', timeout: 4000 }, res => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ─── launch ─────────────────────────────────────────────────────────────────
async function launchCdp(dev, url) {
  const browser = await puppeteer.connect({ browserURL: dev.cdpUrl, defaultViewport: null, protocolTimeout: 0 });
  const page = await browser.newPage();
  const origin = new URL(url).origin;
  for (const p of await browser.pages()) {
    if (p === page) continue;
    try {
      if (p.url().startsWith(origin)) await p.close();
    } catch {
      /* ignore */
    }
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  return { browser, page };
}

async function launchAdb(dev, url, port) {
  await adb.reverse(dev.serial, port);
  await adb.wake(dev.serial);
  await adb.stayAwake(dev.serial, true);
  await adb.forceStop(dev.serial); // clear tabs / GPU pool so each run is a clean cold start
  await sleep(600);
  await adb.launchChrome(dev.serial, url);
}

async function cleanup(dev, handle, port) {
  try {
    if (dev.driver === 'cdp' && handle) {
      await handle.page.close().catch(() => {});
      await handle.browser.disconnect();
    } else if (dev.driver === 'adb') {
      await adb.forceStop(dev.serial);
      await adb.removeAllReverse(dev.serial);
      // Leave "stay awake" ON across the session — resetting it lets the screen sleep
      // between runs, which suspends the USB/adb link (the S26U dropped off repeatedly).
    }
  } catch {
    /* best effort */
  }
}

// ─── JSONL tailing ──────────────────────────────────────────────────────────
// Read complete new lines from a JSONL file since the recorded byte offset. Only
// advances past the last newline so a half-flushed final line is re-read next pump.
function readNewRows(file, offsets, key) {
  if (!existsSync(file)) return [];
  const buf = readFileSync(file);
  const start = offsets[key] ?? 0;
  const nl = buf.lastIndexOf(0x0a);
  if (nl < start) return [];
  const chunk = buf.slice(start, nl + 1).toString('utf8');
  offsets[key] = nl + 1;
  const rows = [];
  for (const line of chunk.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip non-JSON noise */
    }
  }
  return rows;
}

// ─── orchestration ──────────────────────────────────────────────────────────
async function orchestrate(devices, bench, opts) {
  const parallel = opts.serial ? false : opts.parallel ? true : bench.parallelDefault;
  const firstProgressMs = (opts.firstProgress ?? 150) * 1000;
  const stallMs = (opts.stall ?? 240) * 1000;
  const deadlineMs = opts.timeout ? opts.timeout * 1000 : bench.deadlineMs;

  // Start tailing from the current end of both sinks so we ignore prior runs' rows.
  const offsets = {
    results: existsSync(bench.results) ? statSync(bench.results).size : 0,
    progress: existsSync(bench.progress) ? statSync(bench.progress).size : 0,
  };

  const state = new Map(); // key -> { dev, handle, launchedAt, progress, firstTs, lastTs, final, row }
  for (const dev of devices) state.set(dev.key, { dev, handle: null, launchedAt: 0, progress: 0, final: null });

  const launchOne = async dev => {
    const s = state.get(dev.key);
    const url = bench.buildUrl(dev, opts);
    log(`▶ ${dev.key} (${dev.label}) ${dev.driver}: ${url}`);
    if (opts.dryRun) {
      s.final = 'dry-run';
      return;
    }
    try {
      s.launchedAt = nowMs();
      s.handle = dev.driver === 'cdp' ? await launchCdp(dev, url) : await launchAdb(dev, url, bench.port);
    } catch (e) {
      s.final = 'launch-error';
      s.error = e.message;
      log(`  ✗ ${dev.key} launch failed: ${e.message}`);
    }
  };

  const soleActiveKey = () => {
    const active = [...state.values()].filter(s => !s.final && s.launchedAt);
    return active.length === 1 ? active[0].dev.key : null;
  };

  const pump = () => {
    for (const row of readNewRows(bench.progress, offsets, 'progress')) {
      const key = row.target ?? soleActiveKey();
      const s = key && state.get(key);
      if (s && !s.final) {
        s.progress++;
        s.lastTs = nowMs();
        if (!s.firstTs) s.firstTs = nowMs();
      }
    }
    for (const row of readNewRows(bench.results, offsets, 'results')) {
      const key = row.target ?? soleActiveKey();
      const s = key && state.get(key);
      if (s && !s.final && (row.state === 'done' || row.state === 'error')) {
        s.final = row.state;
        s.row = row;
        log(`  ◀ ${key}: ${row.state}`);
      }
    }
    // watchdogs (skip devices that errored at launch / dry-run)
    for (const s of state.values()) {
      if (s.final || !s.launchedAt) continue;
      const age = nowMs() - s.launchedAt;
      if (s.progress === 0 && age > firstProgressMs) s.final = 'no-progress';
      else if (s.progress > 0 && nowMs() - s.lastTs > stallMs) s.final = 'stall';
      else if (age > deadlineMs) s.final = 'deadline';
      if (s.final && !s.row) log(`  ⌛ ${s.dev.key}: ${s.final}`);
    }
  };

  const allFinal = () => [...state.values()].every(s => s.final);

  if (parallel) {
    for (const dev of devices) await launchOne(dev);
    while (!allFinal()) {
      await sleep(2000);
      pump();
    }
  } else {
    for (const dev of devices) {
      await launchOne(dev);
      const s = state.get(dev.key);
      while (!s.final) {
        await sleep(2000);
        pump();
      }
      await cleanup(dev, s.handle, bench.port);
    }
  }
  if (parallel) {
    for (const dev of devices) await cleanup(dev, state.get(dev.key).handle, bench.port);
  }
  return state;
}

// ─── renderers ──────────────────────────────────────────────────────────────
const fmtMs = ms =>
  ms == null || !Number.isFinite(ms) ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
const fmtMb = mb => (mb == null || !Number.isFinite(mb) ? '—' : `${Math.round(mb)}`);
const adapterCell = a => (a ?? '—').replace(/\|/g, '/').slice(0, 46);
const finalCell = s => (s.row ? s.row.state : (s.final ?? '—')) + (s.error ? ` (${s.error.slice(0, 40)})` : '');

function renderChonk(state) {
  const h =
    '| device | adapter | off prove | on prove | speedup | vks | wasm MiB | gpu MiB | result |\n' +
    '|---|---|---|---|---|---|---|---|---|';
  const body = [...state.values()].map(s => {
    const r = s.row ?? {};
    const off = r.off ?? {};
    const on = r.on ?? {};
    const speedup = off.proveMs && on.proveMs ? `${(off.proveMs / on.proveMs).toFixed(2)}×` : '—';
    const vks = r.vksMatch == null ? '—' : r.vksMatch ? '✅' : '❌';
    const adapter = r.swiftshaderDetected ? '⚠️ swiftshader' : adapterCell(r.adapter);
    return `| ${s.dev.label} | ${adapter} | ${fmtMs(off.proveMs)} | ${fmtMs(on.proveMs)} | ${speedup} | ${vks} | ${fmtMb(
      on.wasmHeapPeakMb || off.wasmHeapPeakMb,
    )} | ${fmtMb(on.gpuPeakMb)} | ${finalCell(s)} |`;
  });
  return `${h}\n${body.join('\n')}\n`;
}

function renderDiag(state) {
  const h =
    '| device | cores | mem GB | wasm simd | wasm threads | wasm exc | webgpu | result |\n' +
    '|---|---|---|---|---|---|---|---|';
  const yn = b => (b == null ? '—' : b ? '✅' : '❌');
  const body = [...state.values()].map(s => {
    const r = s.row ?? {};
    return `| ${s.dev.label} | ${r.hardwareConcurrency ?? '—'} | ${r.deviceMemoryGb ?? '—'} | ${yn(r.wasmSimd)} | ${yn(
      r.wasmThreads,
    )} | ${yn(r.wasmExceptions)} | ${(r.webgpu ?? '—').slice(0, 30)} | ${finalCell(s)} |`;
  });
  return `${h}\n${body.join('\n')}\n`;
}

function renderGpuSmoke(state) {
  const h = '| device | longest OK dispatch | result |\n|---|---|---|';
  const body = [...state.values()].map(s => {
    const r = s.row ?? {};
    return `| ${s.dev.label} | ${r.maxOkMs != null ? `${Math.round(r.maxOkMs)}ms` : '—'} | ${finalCell(s)} |`;
  });
  return `${h}\n${body.join('\n')}\n`;
}

function renderMsm(state) {
  const h = '| device | cross-check | gpu x | errs | result |\n|---|---|---|---|---|';
  const body = [...state.values()].map(s => {
    const r = s.row ?? {};
    const res = r.results ?? {};
    const cross = res.cross_ok == null ? '—' : res.cross_ok ? '✅ agree' : '❌ disagree';
    const gpux = (res.gpu_line ?? '').replace(/^.*x=/, 'x=').slice(0, 24) || '—';
    return `| ${s.dev.label} | ${cross} | ${gpux} | ${res.err_count ?? '—'} | ${finalCell(s)} |`;
  });
  return `${h}\n${body.join('\n')}\n`;
}

function appendHistory(state, benchName, opts) {
  mkdirSync(path.dirname(HISTORY), { recursive: true });
  const stamp = new Date().toISOString();
  for (const s of state.values()) {
    appendFileSync(
      HISTORY,
      JSON.stringify({
        stamp,
        bench: benchName,
        mode: opts.mode,
        device: s.dev.key,
        label: s.dev.label,
        final: s.final,
        row: s.row ?? null,
      }) + '\n',
    );
  }
}

// ─── subcommands ────────────────────────────────────────────────────────────
async function cmdDevices() {
  const { resolved, ready, unmatched, adbError } = await resolveDevices();
  process.stdout.write('\nRegistry devices\n────────────────\n');
  for (const d of resolved) {
    if (d.driver === 'cdp') {
      const ok = await ping(9222, '/json/version');
      process.stdout.write(
        `  ${d.key.padEnd(8)} cdp   ${d.cdpUrl}  ${ok ? '✅ reachable' : '✗ no CDP (Mac Chrome / 9222 tunnel down)'}  — ${d.label}\n`,
      );
    } else if (d.serial) {
      process.stdout.write(
        `  ${d.key.padEnd(8)} adb   ${d.serial.padEnd(20)} sdk=${d.sdk ?? '?'}  ✅ "${d.marketName}"  — ${d.label}\n`,
      );
    } else {
      process.stdout.write(
        `  ${d.key.padEnd(8)} adb   ${'(not attached)'.padEnd(20)}  ✗ no live device matched /${registry[d.key].match}/\n`,
      );
    }
  }
  if (adbError)
    process.stdout.write(
      `\n⚠ adb server unreachable: ${adbError}\n  → on the Mac: ssh -N -R 5037:localhost:5037 <box>  (and: adb start-server)\n`,
    );
  if (unmatched.length) {
    process.stdout.write('\nAttached but unmatched (add a `match` to devices.json)\n');
    for (const d of unmatched) process.stdout.write(`  ${d.serial}  "${d.marketName}"  (model=${d.modelName})\n`);
  }
  if (ready.length === 0 && !adbError)
    process.stdout.write(
      '\nNo phones in `device` state. Check USB-debugging is authorized (adb devices shows `unauthorized` until you accept the prompt).\n',
    );
  process.stdout.write('\n');
}

async function runBench(benchName, opts) {
  const bench = BENCHES[benchName];
  opts.mode = opts.mode || bench.defaultMode;
  const { resolved } = await resolveDevices();
  let devices = selectDevices(resolved, opts.devices);

  // Drop devices known to lose the GPU for GPU-bearing runs, unless --force.
  if (bench.needsGpu(opts) && !opts.force) {
    devices = devices.filter(d => {
      if (d.caps?.webgpuMsm === 'device-lost') {
        log(`⚠ skipping ${d.key} (caps.webgpuMsm=device-lost; use --force to include)`);
        return false;
      }
      return true;
    });
  }
  if (devices.length === 0) {
    log('no usable devices selected — run `node scripts/bench.mjs devices` to check connectivity');
    process.exit(2);
  }

  if (!opts.dryRun && !(await ping(bench.port, bench.pagePath))) {
    log(`✗ dev server not reachable on 127.0.0.1:${bench.port}${bench.pagePath}`);
    log(`  → ${bench.serverHint}`);
    process.exit(3);
  }

  log(`${benchName} | mode=${opts.mode} | devices: ${devices.map(d => d.key).join(', ')}`);
  const state = await orchestrate(devices, bench, opts);

  const stamp = new Date().toISOString();
  const table = bench.render(state, opts);
  const title = `# ${benchName} (${opts.mode})${benchName === 'chonk' ? ` — flow \`${opts.flow}\`` : benchName === 'msm' ? ` — logN ${opts.logn}` : ''}\n`;
  const md = `${title}\n- generated: ${stamp}\n\n${table}`;
  process.stdout.write('\n' + md + '\n');

  if (!opts.dryRun) {
    const out = opts.out || `/tmp/zac-webgpu/bench-${benchName}-${stamp.replace(/[:.]/g, '-')}.md`;
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, md);
    appendHistory(state, benchName, opts);
    log(`wrote ${out}  (+ appended ${HISTORY})`);
  }

  const allDone = [...state.values()].every(s => s.final === 'done' || s.final === 'dry-run');
  process.exit(allDone ? 0 : 1);
}

// ─── main ───────────────────────────────────────────────────────────────────
const { values: argv, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    devices: { type: 'string', default: 'all' },
    mode: { type: 'string' },
    flow: { type: 'string', default: DEFAULT_FLOW },
    logn: { type: 'string', default: '14' },
    levels: { type: 'string' },
    serial: { type: 'boolean', default: false },
    parallel: { type: 'boolean', default: false },
    timeout: { type: 'string' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    out: { type: 'string' },
    'first-progress': { type: 'string' },
    stall: { type: 'string' },
  },
});

const cmd = positionals[0];
const opts = {
  devices: argv.devices,
  mode: argv.mode,
  flow: argv.flow,
  logn: parseInt(argv.logn, 10),
  levels: argv.levels,
  serial: argv.serial,
  parallel: argv.parallel,
  timeout: argv.timeout ? parseInt(argv.timeout, 10) : undefined,
  force: argv.force,
  dryRun: argv['dry-run'],
  out: argv.out,
  firstProgress: argv['first-progress'] ? parseInt(argv['first-progress'], 10) : undefined,
  stall: argv.stall ? parseInt(argv.stall, 10) : undefined,
};

try {
  if (cmd === 'devices') await cmdDevices();
  else if (cmd && BENCHES[cmd]) await runBench(cmd, opts);
  else {
    process.stderr.write(
      'usage: node scripts/bench.mjs <devices|probe|chonk|msm> [--devices ...] [--mode ...] [opts]\n',
    );
    process.exit(64);
  }
} catch (e) {
  log(`fatal: ${e.stack ?? e.message ?? String(e)}`);
  process.exit(99);
}
