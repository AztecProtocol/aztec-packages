#!/usr/bin/env node
/** One-shot BrowserStack runner with progress watchdogs and optional trace capture. */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = new Map();
for (let i = 2; i < process.argv.length; ++i) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const nxt = process.argv[i + 1];
  if (nxt && !nxt.startsWith('--')) {
    args.set(k, nxt);
    i++;
  } else {
    args.set(k, 'true');
  }
}

const config = JSON.parse(await readFile(new URL('../wasm-bench.config.json', import.meta.url), 'utf8'));
const TARGETS = config.targets ?? {};
const defaultBenchmarkName = config.defaultBenchmark ?? Object.keys(config.benchmarks ?? {})[0];
const benchmarkName = args.get('benchmark') ?? defaultBenchmarkName;
const benchmark = config.benchmarks?.[benchmarkName];
if (!benchmark) {
  console.error(`unknown --benchmark "${benchmarkName}". Configured benchmarks: ${Object.keys(config.benchmarks ?? {}).join(', ') || '(none)'}`);
  process.exit(2);
}

const flow = args.get('flow') ?? benchmark.defaultFlow;
if (!flow) {
  console.error(`--flow required because benchmark "${benchmarkName}" has no defaultFlow`);
  process.exit(2);
}
const runs = Number(args.get('runs') ?? '1');
if (!Number.isInteger(runs) || runs <= 0) {
  console.error(`--runs must be a positive integer; got "${args.get('runs') ?? '1'}"`);
  process.exit(2);
}
const threadsArg = args.get('threads') ?? 'auto';
const threadsOverride = threadsArg === 'auto' ? null : Number(threadsArg);
if (threadsOverride !== null && (!Number.isFinite(threadsOverride) || threadsOverride <= 0)) {
  console.error(`--threads must be a positive integer or 'auto'; got "${threadsArg}"`);
  process.exit(2);
}
const trace = args.get('trace') === 'true' || args.get('trace') === '1';
const smoke = args.get('smoke') === 'true' || args.get('smoke') === '1';
const screenshots = args.get('screenshots') === 'true' || args.get('screenshots') === '1';
const tunnelUrl = args.get('url');
const progressFile = resolve(args.get('progress-file') ?? '/tmp/wasm-bench-progress.jsonl');
const resultsFile = resolve(args.get('results-file') ?? '/tmp/wasm-bench-results.jsonl');
const artifactsDir = resolve(args.get('artifacts') ?? '/tmp/wasm-bench-artifacts');

const targetName = args.get('target');
if (targetName === 'true') {
  const defaultMatrix = config.defaultMatrix ?? Object.keys(TARGETS);
  const extendedMatrix = config.extendedMatrix ?? Object.keys(TARGETS);
  const matrixProfiles = config.matrixProfiles ?? {};
  console.log('available concrete --target presets:');
  for (const [k, v] of Object.entries(TARGETS)) console.log(`  ${k.padEnd(20)} ${v.label}  [${v.chip}]`);
  console.log('\navailable WASM_BENCH_PLATFORMS profiles:');
  if (Object.keys(matrixProfiles).length > 0) {
    for (const [k, v] of Object.entries(matrixProfiles)) {
      console.log(`  ${k.padEnd(20)} ${(v.targets ?? []).join(', ')}${v.label ? `  (${v.label})` : ''}`);
    }
    console.log(`  ${'core'.padEnd(20)} ${defaultMatrix.join(', ')}  (alias for default)`);
    console.log(`  ${'extended'.padEnd(20)} ${extendedMatrix.join(', ')}  (alias for all)`);
  } else {
    console.log(`  ${'default'.padEnd(20)} ${defaultMatrix.join(', ')}`);
    console.log(`  ${'all'.padEnd(20)} ${extendedMatrix.join(', ')}`);
  }
  process.exit(0);
}
let caps;
let preset = null;
if (targetName && TARGETS[targetName]) {
  preset = TARGETS[targetName];
  caps = { ...(preset.browserstack?.caps ?? {}) };
} else if (targetName === 'all') {
  console.error('--target all/default is expanded by bootstrap/run-ci-bench; run this script with one concrete target');
  process.exit(2);
} else if (targetName === 'default' || targetName === 'core' || targetName === 'extended' || config.matrixProfiles?.[targetName]) {
  console.error('--target matrix profiles are expanded by bootstrap/run-ci-bench; run this script with one concrete target');
  process.exit(2);
} else if (targetName) {
  console.error(`unknown --target "${targetName}". Try --target true for the list.`);
  process.exit(2);
} else {
  caps = {
    browser: args.get('browser') ?? 'chrome',
    browser_version: args.get('browser-version') ?? 'latest',
    os: args.get('os') ?? 'OS X',
    os_version: args.get('os-version') ?? 'Sequoia',
  };
}
const firstProgressMs = Number(args.get('first-progress-ms') ?? (preset?.timeouts?.firstProgressMs ?? config.timeouts?.firstProgressMs ?? 30_000));
const stallMs = Number(args.get('stall-ms') ?? (preset?.timeouts?.stallMs ?? config.timeouts?.stallMs ?? 240_000));
const deadlineMs = Number(args.get('deadline-ms') ?? (preset?.timeouts?.deadlineMs ?? config.timeouts?.deadlineMs ?? 1_500_000));
const sessionCreateMs = Number(args.get('session-create-ms') ?? (preset?.timeouts?.sessionCreateMs ?? config.timeouts?.sessionCreateMs ?? 90_000));
const sessionAttempts = Math.max(1, Math.floor(Number(args.get('session-attempts') ?? (preset?.timeouts?.sessionAttempts ?? config.timeouts?.sessionAttempts ?? 8))));
const buildLabel = args.get('build') ?? `wasm-bench-${new Date().toISOString().slice(0, 10)}`;
const localIdentifier = args.get('local-identifier');
const threadsTag = threadsOverride === null ? 'auto' : `${threadsOverride}t`;
const targetTag = targetName ?? `${caps.os ?? 'os'}-${caps.browser ?? 'br'}`;
const name = args.get('name') ?? `wasm-bench-${targetTag}-${benchmarkName}-${flow}-${threadsTag}`;

if (!tunnelUrl) {
  console.error('--url required (tunnel URL or page origin serving the wasm-bench bundle)');
  process.exit(2);
}

const user = process.env.BROWSERSTACK_USERNAME || process.env.BROWSERSTACK_USER_NAME;
const key = process.env.BROWSERSTACK_ACCESS_KEY;
if (!user || !key) {
  console.error('BROWSERSTACK_USERNAME (or BROWSERSTACK_USER_NAME) and BROWSERSTACK_ACCESS_KEY must be set');
  process.exit(2);
}
const authHeader = `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`;

function compareVersions(a, b) {
  const aa = String(a).split('.').map((x) => Number(x));
  const bb = String(b).split('.').map((x) => Number(x));
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = Number.isFinite(aa[i]) ? aa[i] : 0;
    const bv = Number.isFinite(bb[i]) ? bb[i] : 0;
    if (av !== bv) return av - bv;
  }
  return String(a).localeCompare(String(b));
}

async function resolveLatestMobileCaps(inputCaps) {
  if (!inputCaps.real_mobile || inputCaps.os_version !== 'latest') return inputCaps;
  const res = await fetch('https://api.browserstack.com/automate/browsers.json', {
    headers: { authorization: authHeader },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`BrowserStack browsers.json: HTTP ${res.status} ${text}`);
  const rows = JSON.parse(text);
  const matches = rows.filter(
    (row) =>
      row.real_mobile === true &&
      row.os === inputCaps.os &&
      row.browser === inputCaps.browser &&
      row.device === inputCaps.device &&
      row.os_version,
  );
  if (matches.length === 0) {
    throw new Error(
      `BrowserStack has no mobile browser rows for device=${inputCaps.device} os=${inputCaps.os} browser=${inputCaps.browser}`,
    );
  }
  matches.sort((a, b) => compareVersions(a.os_version, b.os_version));
  const selected = matches[matches.length - 1];
  console.log(
    `resolved BrowserStack latest mobile target: device=${selected.device} os=${selected.os} os_version=${selected.os_version} browser=${selected.browser}`,
  );
  return { ...inputCaps, os_version: selected.os_version };
}

caps = await resolveLatestMobileCaps(caps);

await mkdir(artifactsDir, { recursive: true });

const benchPayload = { benchmark: benchmarkName, flow, runs, trace, smoke };
if (threadsOverride !== null) benchPayload.threads = threadsOverride;
if (preset?.benchOverrides) Object.assign(benchPayload, preset.benchOverrides);
const cliMemMax = args.get('mem-max-pages');
if (cliMemMax) {
  const m = Number(cliMemMax);
  if (Number.isFinite(m) && m > 0) benchPayload.memMaxPages = m;
}
const bench = Buffer.from(JSON.stringify(benchPayload), 'utf8').toString('base64');
const targetUrl = `${tunnelUrl.replace(/\/$/, '')}/?bench=${bench}`;

const runnerStartedAt = Date.now();
function runnerElapsed() {
  return ((Date.now() - runnerStartedAt) / 1000).toFixed(1);
}
function logRunner(msg) {
  console.log(`[runner +${runnerElapsed()}s] ${msg}`);
}

async function bs(method, path, body, { retries = 0, retryBackoffMs = 2_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.browserstack.com${path}`, {
        method,
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`BrowserStack ${method} ${path}: HTTP ${res.status} ${text}`);
      return text ? JSON.parse(text) : {};
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) break;
      const wait = retryBackoffMs * Math.pow(2, attempt);
      console.warn(`BrowserStack ${method} ${path} attempt ${attempt + 1}/${retries + 1} failed: ${e instanceof Error ? e.message : e} — retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function wd(method, path, body, { retries = 0, retryBackoffMs = 2_000, timeoutMs = 30_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://hub-cloud.browserstack.com/wd/hub${path}`, {
        method,
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let parsed = {};
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
      }
      const value = parsed.value ?? parsed;
      if (parsed.sessionId && value && typeof value === 'object' && !value.sessionId) {
        value.sessionId = parsed.sessionId;
      }
      if (!res.ok) {
        throw new Error(`BrowserStack Automate ${method} ${path}: HTTP ${res.status} ${text}`);
      }
      if (value?.error) {
        throw new Error(`BrowserStack Automate ${method} ${path}: ${JSON.stringify(value)}`);
      }
      return value;
    } catch (e) {
      lastErr = e;
      if (attempt >= retries) break;
      const wait = retryBackoffMs * Math.pow(2, attempt);
      console.warn(`BrowserStack Automate ${method} ${path} attempt ${attempt + 1}/${retries + 1} failed: ${e instanceof Error ? e.message : e} - retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function fileHasContent(path) {
  try {
    const st = await stat(path);
    return st.size > 0;
  } catch {
    return false;
  }
}

async function waitForProgressFile(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fileHasContent(progressFile)) return true;
    await sleep(250);
  }
  return await fileHasContent(progressFile);
}

async function createWorkerRunner() {
  const workerBody = {
    ...caps,
    url: targetUrl,
    timeout: Math.ceil(deadlineMs / 1000) + 60,
    name,
    build: buildLabel,
  };
  if (localIdentifier) {
    workerBody.local = 'true';
    workerBody.localIdentifier = localIdentifier;
  }
  if (!caps.real_mobile) workerBody.resolution = preset?.browserstack?.resolution ?? '1920x1080';
  logRunner(`BrowserStack worker create start target=${targetName ?? '(custom)'}`);
  const created = await bs('POST', '/5/worker', workerBody, { retries: 3, retryBackoffMs: 5_000 });
  const workerId = created.id;
  logRunner(`BrowserStack worker created id=${workerId}`);
  return {
    kind: 'worker',
    id: workerId,
    async screenshot(label) {
      const res = await bs('GET', `/5/worker/${workerId}/screenshot.json`);
      if (!res.url) return null;
      const png = await fetch(res.url);
      const buf = Buffer.from(await png.arrayBuffer());
      const out = resolve(artifactsDir, `${label}.png`);
      await writeFile(out, buf);
      return out;
    },
    async teardown() {
      await bs('DELETE', `/5/worker/${workerId}`, undefined, { retries: 2 });
    },
  };
}

async function createAutomateRunner() {
  let sessionId = null;
  const browserNames = {
    android: 'Chrome',
    chrome: 'Chrome',
    chromium: 'Chrome',
    edge: 'Edge',
    firefox: 'Firefox',
    iphone: 'Safari',
    ipad: 'Safari',
    safari: 'Safari',
  };
  const browserName = browserNames[String(caps.browser ?? '').toLowerCase()] ?? caps.browser ?? 'Chrome';
  const bstackOptions = {
    userName: user,
    accessKey: key,
    projectName: 'wasm-bench',
    buildName: buildLabel,
    sessionName: name,
    debug: true,
    networkLogs: true,
    consoleLogs: 'info',
    idleTimeout: Math.min(300, Math.max(120, Math.ceil(stallMs / 1000) + 30)),
    local: Boolean(localIdentifier),
  };
  if (localIdentifier) bstackOptions.localIdentifier = localIdentifier;
  if (caps.real_mobile) {
    bstackOptions.deviceName = caps.device;
    bstackOptions.osVersion = caps.os_version;
    bstackOptions.realMobile = true;
  } else {
    bstackOptions.os = caps.os;
    bstackOptions.osVersion = caps.os_version;
  }
  const automateCaps = {
    browserName,
    acceptInsecureCerts: true,
    'bstack:options': bstackOptions,
  };
  if (!caps.real_mobile && caps.browser_version) automateCaps.browserVersion = caps.browser_version;
  try {
    let lastSessionResponse = null;
    for (let attempt = 0; attempt < sessionAttempts; attempt++) {
      let created;
      const retrying = attempt + 1 < sessionAttempts;
      const wait = Math.min(15_000, 5_000 * (attempt + 1));
      try {
        logRunner(`BrowserStack Automate session create attempt=${attempt + 1}/${sessionAttempts}`);
        created = await wd('POST', '/session', { capabilities: { alwaysMatch: automateCaps } }, { timeoutMs: sessionCreateMs });
      } catch (e) {
        lastSessionResponse = e instanceof Error ? e.message : String(e);
        console.warn(`BrowserStack Automate session create failed: ${lastSessionResponse}${retrying ? ` - retrying in ${wait}ms` : ''}`);
        if (retrying) await sleep(wait);
        continue;
      }
      sessionId = created.sessionId ?? created?.capabilities?.sessionId;
      if (sessionId) break;
      lastSessionResponse = created;
      console.warn(`BrowserStack Automate session response missing sessionId: ${JSON.stringify(created)}${retrying ? ` - retrying in ${wait}ms` : ''}`);
      if (retrying) await sleep(wait);
    }
    if (!sessionId) throw new Error(`BrowserStack Automate session response missing sessionId: ${JSON.stringify(lastSessionResponse)}`);
    logRunner(`BrowserStack Automate session created id=${sessionId}`);
    logRunner(`BrowserStack Automate navigate start url=${targetUrl}`);
    await wd('POST', `/session/${sessionId}/url`, { url: targetUrl }, { timeoutMs: firstProgressMs });
    logRunner('BrowserStack Automate navigate returned');
    if (targetUrl.startsWith('https://')) {
      const acceptSslDelayMs = Number(args.get('accept-ssl-delay-ms') ?? '3000');
      if (Number.isFinite(acceptSslDelayMs) && acceptSslDelayMs > 0) await sleep(acceptSslDelayMs);
      logRunner('BrowserStack Automate acceptSsl start');
      await wd('POST', `/session/${sessionId}/execute/sync`, {
        script: 'browserstack_executor: {"action":"acceptSsl"}',
        args: [],
      }, { timeoutMs: 30_000 });
      logRunner('BrowserStack Automate acceptSsl returned');
      const renavigateAfterSsl = args.get('renavigate-after-ssl') ?? 'true';
      if (renavigateAfterSsl !== 'false' && renavigateAfterSsl !== '0') {
        const progressGraceMs = Number(args.get('post-ssl-progress-grace-ms') ?? '5000');
        if (Number.isFinite(progressGraceMs) && progressGraceMs > 0 && await waitForProgressFile(progressGraceMs)) {
          logRunner('BrowserStack Automate post-SSL navigate skipped; page progress observed');
        } else {
          logRunner(`BrowserStack Automate post-SSL navigate start url=${targetUrl}`);
          await wd('POST', `/session/${sessionId}/url`, { url: targetUrl }, { timeoutMs: firstProgressMs });
          logRunner('BrowserStack Automate post-SSL navigate returned');
        }
      }
    }
  } catch (e) {
    if (sessionId) {
      try {
        await wd('DELETE', `/session/${sessionId}`, undefined, { timeoutMs: 30_000 });
      } catch {}
    }
    throw e;
  }
  return {
    kind: 'automate',
    id: sessionId,
    async screenshot(label) {
      const base64 = await wd('GET', `/session/${sessionId}/screenshot`, undefined, { timeoutMs: 30_000 });
      if (typeof base64 !== 'string') return null;
      const out = resolve(artifactsDir, `${label}.png`);
      await writeFile(out, Buffer.from(base64, 'base64'));
      return out;
    },
    async keepAlive() {
      await wd('GET', `/session/${sessionId}/title`, undefined, { timeoutMs: 10_000 });
    },
    async teardown() {
      await wd('DELETE', `/session/${sessionId}`, undefined, { retries: 2, timeoutMs: 30_000 });
    },
  };
}

console.log(`launching BrowserStack ${preset?.driver === 'automate' ? 'Automate session' : 'worker'}  target=${targetName ?? '(custom)'} benchmark=${benchmarkName} flow=${flow} threads=${threadsOverride ?? 'auto'} trace=${trace} smoke=${smoke}`);
console.log(`  caps: ${JSON.stringify(caps)}`);
console.log(`  bench: ${JSON.stringify(benchPayload)}`);
console.log(`  stall=${stallMs}ms first-progress=${firstProgressMs}ms session-create=${sessionCreateMs}msx${sessionAttempts} deadline=${deadlineMs}ms`);
console.log(`  url:  ${targetUrl}`);
logRunner('BrowserStack launch start');
const runner = preset?.driver === 'automate' ? await createAutomateRunner() : await createWorkerRunner();
logRunner(`BrowserStack launch ready kind=${runner.kind} id=${runner.id}`);

async function screenshot(label) {
  try {
    return await runner.screenshot(label);
  } catch (e) {
    console.warn(`screenshot ${label} failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function readLastResultRow() {
  try {
    const raw = (await readFile(resultsFile)).toString('utf8').trim().split('\n');
    for (let i = raw.length - 1; i >= 0; --i) {
      const line = raw[i].trim();
      if (!line.startsWith('{')) continue;
      return JSON.parse(line);
    }
  } catch {}
  return null;
}

function rowStatus(row) {
  const payload = row?.payload;
  if (payload?.ok === false) return { kind: 'payload-failed', healthyRuns: 0, sample: payload.error ?? 'payload ok=false' };
  const data = payload?.data;
  const features = data?.features;
  if (features && features.crossOriginIsolated !== true) {
    return { kind: 'feature-failed', healthyRuns: 0, sample: 'crossOriginIsolated=false' };
  }
  if (features && features.sharedArrayBuffer !== true) {
    return { kind: 'feature-failed', healthyRuns: 0, sample: 'SharedArrayBuffer missing' };
  }
  if (data?.smoke === true && payload?.ok === true) return { kind: 'all-ok', healthyRuns: 0 };
  const runs = data?.runs;
  if (!Array.isArray(runs) || runs.length === 0) return { kind: 'no-runs', healthyRuns: 0 };
  const healthy = runs.filter((r) => !r.proveError && Number(r.proveMs ?? 0) > 0);
  if (healthy.length === 0) {
    const sample = runs[0]?.proveError ?? row?.payload?.error ?? 'unknown';
    return { kind: 'all-failed', healthyRuns: 0, sample };
  }
  if (healthy.length < runs.length) return { kind: 'partial', healthyRuns: healthy.length };
  return { kind: 'all-ok', healthyRuns: healthy.length };
}

function avg(nums) {
  const filtered = nums.filter((n) => Number.isFinite(n));
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

async function printHeadline() {
  const row = await readLastResultRow();
  const data = row?.payload?.data ?? {};
  printColdStartSummary(data);
  const allRuns = row?.payload?.data?.runs;
  if (!Array.isArray(allRuns) || allRuns.length === 0) {
    if (data.smoke) {
      console.log('');
      console.log('==== smoke ====');
      console.log(`  benchmark:       ${data.benchmark ?? benchmarkName}`);
      console.log(`  flow:            ${data.flow ?? flow}`);
      console.log('  status:          cold-start smoke completed without running chonk_setup/chonk_prove');
      console.log('================');
      console.log('');
    }
    return;
  }
  const status = rowStatus(row);
  const healthyRuns = allRuns.filter((r) => !r.proveError && Number(r.proveMs ?? 0) > 0);
  const headlineRuns = healthyRuns.length > 0 ? healthyRuns : allRuns;
  const setup = avg(headlineRuns.map((r) => Number(r.phases?.chonk_setup ?? r.setupMs ?? 0))) ?? 0;
  const prove = avg(headlineRuns.map((r) => Number(r.phases?.chonk_prove ?? r.proveMs ?? 0))) ?? 0;
  const wall = avg(headlineRuns.map((r) => Number(r.wallMs ?? 0))) ?? 0;
  const proveTotalMs = setup + prove;
  const threads = [...new Set(headlineRuns.map((r) => r.configuredThreads ?? '?'))].join(',');
  const run = headlineRuns[0];
  console.log('');
  console.log('==== headline ====');
  console.log(`  flow:            ${run.flow ?? '?'}`);
  console.log(`  threads:         ${threads}`);
  console.log(`  runs:            ${healthyRuns.length}/${allRuns.length} healthy`);
  console.log(`  chonk_setup:     ${setup.toFixed(0)} ms`);
  console.log(`  chonk_prove:     ${prove.toFixed(0)} ms`);
  console.log(`  proveTotalMs:    ${proveTotalMs.toFixed(0)} ms   (setup + prove — the barretenberg proving time devs care about)`);
  console.log(`  wallMs:          ${wall.toFixed(0)} ms`);
  if (status.kind !== 'all-ok') {
    console.log(`  status:          ${status.kind}${status.sample ? ` — ${status.sample}` : ''}`);
  }
  console.log('==================');
  console.log('');
}

function printColdStartSummary(data) {
  const coldStart = data?.coldStart;
  const preamble = data?.preamble;
  if (!coldStart && !preamble) return;
  console.log('');
  console.log('==== cold start ====');
  const fields = [
    ['mainBundleLoadedMs', coldStart?.mainBundleLoadedMs],
    ['workerFirstMessageMs', coldStart?.workerFirstMessageMs],
    ['fetchWasmHeadersMs', coldStart?.fetchWasmHeadersMs],
    ['fetchWasmMs', coldStart?.fetchWasmMs ?? preamble?.fetchWasmMs],
    ['wasmGzipBytes', coldStart?.wasmGzipBytes],
    ['wasmBytes', coldStart?.wasmBytes],
    ['compileStreamingMs', coldStart?.compileStreamingMs],
    ['compileWasmMs', coldStart?.compileWasmMs],
    ['fetchInputsMs', preamble?.fetchInputsMs],
    ['inputMsgpackDecodeMs', coldStart?.inputMsgpackDecodeMs],
    ['inputInflateMs', coldStart?.inputInflateMs],
    ['inputDecodeMs', coldStart?.inputDecodeMs],
    ['inputBytes', coldStart?.inputBytes],
    ['inputDecodedBytes', coldStart?.inputDecodedBytes],
  ];
  for (const [name, value] of fields) {
    if (value === undefined || value === null) continue;
    const suffix = name.endsWith('Bytes') ? ' bytes' : name.endsWith('Ms') ? ' ms' : '';
    const display = typeof value === 'number' && name.endsWith('Ms') ? value.toFixed(0) : value;
    console.log(`  ${`${name}:`.padEnd(22)} ${display}${suffix}`);
  }
  console.log('====================');
  console.log('');
}

let tornDown = false;
async function teardown(reason, exitCode) {
  if (tornDown) return;
  tornDown = true;
  if (screenshots) {
    try {
      await screenshot(`final-${reason}`);
    } catch {}
  }
  try {
    await runner.teardown(reason);
  } catch (e) {
    console.warn(`teardown: DELETE ${runner.kind} ${runner.id} failed: ${e instanceof Error ? e.message : e}`);
  }
  if (reason === 'ok' || reason === 'ok-after-final') {
    try { await printHeadline(); } catch {}
  }
  console.log(`teardown reason=${reason} exit=${exitCode} artifacts=${artifactsDir}`);
  process.exit(exitCode);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.error(`received ${sig}, tearing down ${runner.kind} ${runner.id}`);
    teardown(`signal-${sig}`, 130).catch(() => process.exit(130));
  });
}
process.on('uncaughtException', (e) => {
  console.error(`uncaught: ${e instanceof Error ? e.stack ?? e.message : e}`);
  teardown('uncaught', 1).catch(() => process.exit(1));
});
process.on('unhandledRejection', (e) => {
  console.error(`unhandledRejection: ${e instanceof Error ? e.stack ?? e.message : e}`);
  teardown('unhandledRejection', 1).catch(() => process.exit(1));
});

let progressOffset = 0;
async function readNewProgress() {
  try {
    const st = await stat(progressFile);
    if (st.size <= progressOffset) return [];
    const fd = await readFile(progressFile);
    const slice = fd.subarray(progressOffset);
    progressOffset += slice.length;
    return slice.toString('utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function resultExists() {
  try {
    const st = await stat(resultsFile);
    return st.size > 0;
  } catch {
    return false;
  }
}

const start = Date.now();
let lastProgressAt = start;
let lastKeepAliveAt = start;
let firstProgressSeen = false;
let finalSeen = false;

while (true) {
  const lines = await readNewProgress();
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    lastProgressAt = Date.now();
    firstProgressSeen = true;
    const phase = parsed.phase ?? '?';
    const elapsed = parsed.elapsedMs ?? 0;
    const phaseMs = parsed.phaseMs ?? 0;
    const source = parsed.source ?? 'worker';
    const detailParts = [];
    const details = parsed.details && typeof parsed.details === 'object' ? parsed.details : parsed;
    for (const key of [
      'bytes',
      'gzipBytes',
      'wasmBytes',
      'inputBytes',
      'compileStreamingMs',
      'compileWasmMs',
      'fallbackFetchMs',
      'g1Bytes',
      'grumpkinG1Bytes',
      'circuits',
      'threads',
      'run',
      'trace',
      'smoke',
    ]) {
      const value = details[key];
      if (value !== undefined && value !== null) detailParts.push(`${key}=${value}`);
    }
    const detailsText = detailParts.length ? ` ${detailParts.join(' ')}` : '';
    console.log(`  [runner +${runnerElapsed()}s | page +${(elapsed / 1000).toFixed(1)}s | +${(phaseMs / 1000).toFixed(2)}s] ${source} phase=${phase}${detailsText}${parsed.error ? ` ERROR=${parsed.error}` : ''}`);
    if (parsed.final) finalSeen = true;
  }
  if (await resultExists()) {
    console.log('result row landed');
    const row = await readLastResultRow();
    const status = rowStatus(row);
    if (status.kind !== 'all-ok' && status.kind !== 'partial') {
      console.warn(`bench result failed status=${status.kind}${status.sample ? ` sample=${status.sample}` : ''}`);
      await teardown('all-failed', 7);
    }
    await teardown('ok', 0);
  }
  const now = Date.now();
  if (runner.keepAlive && now - lastKeepAliveAt > 30_000) {
    lastKeepAliveAt = now;
    runner.keepAlive().catch((e) => {
      console.warn(`BrowserStack Automate keepalive failed: ${e instanceof Error ? e.message : e}`);
    });
  }
  if (now - start > deadlineMs) {
    console.error(`hit deadline (${deadlineMs}ms) without final result`);
    await teardown('deadline', 4);
  }
  if (!firstProgressSeen && now - start > firstProgressMs) {
    console.error(
      `no /progress event in ${firstProgressMs}ms after BrowserStack launch; the session did not reach executing page JS. ` +
      `This is a cold-start/session problem, not a Chonk proving timeout.`,
    );
    await teardown('no-first-progress', 6);
  }
  if (firstProgressSeen && now - lastProgressAt > stallMs) {
    console.error(`stalled (no progress for ${stallMs}ms, last phase delta exceeded threshold)`);
    await teardown('stall', 5);
  }
  if (finalSeen) {
    await sleep(2_000);
    if (await resultExists()) await teardown('ok-after-final', 0);
    await teardown('final-no-result', 6);
  }
  await sleep(1_000);
}
