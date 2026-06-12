#!/usr/bin/env node
// fastbench.mjs — FAST phone GPU-only MSM bench for the stream-walker.
//
// Replaces drive-v2-random.mjs's slow per-rep-reload + WASM-oracle pattern.
// Does exactly ONE phone page load that runs the new GPU-only autorun branch
// (`autorun=msm-bench&no_wasm=1`): generate inputs once, one warmup, then
// `reps` timed GPU runs — NO WASM boot, NO cross-check, NO per-rep reload.
// Reads the single result row back from the dev server's results JSONL.
//
// The device is occupied for ONE warmed page (SRS already cached in the
// phone's IndexedDB after the first ever run) + `reps` GPU MSMs — vs the
// old harness which reloaded the page `reps` times AND ran the ~560-780 ms
// WASM oracle every rep.
//
// Usage:
//   node fastbench.mjs [--port 5197] [--logn 17] [--reps 5] [--profile A]
//                      [--results <file>] [--timeout-s 600]
//                      [--worktree <path>] [--no-server]
//
// HARD CAP: logn clamped to <= 17 (logn>=19 crashes the host).
//
// By default fastbench ensures its OWN dedicated vite dev server is running
// on --port with its OWN results file, so it never collides with other
// benchers sharing 5198/5200/5201. Pass --no-server to drive an already
// running server on --port (then --results must match that server's
// MSM_WEBGPU_RESULTS_FILE).

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const has = n => argv.includes(`--${n}`);

const PORT = String(arg('port', '5197'));
const LOGN = Math.min(17, parseInt(arg('logn', '17'), 10) || 17); // HARD CAP 17
const REPS = parseInt(arg('reps', '5'), 10);
const PROFILE = String(arg('profile', 'A')).toUpperCase();
const MONTMUL = String(arg('montmul', ''));
if (MONTMUL && MONTMUL !== 'karat' && MONTMUL !== 'cios_unrolled') {
  // A typo here would silently bench the default variant — fail loudly instead.
  console.error(`--montmul must be 'karat' or 'cios_unrolled' (got '${MONTMUL}')`);
  process.exit(2);
}
const TIMEOUT_MS = parseInt(arg('timeout-s', '600'), 10) * 1000;
const WORKTREE = String(arg('worktree', join(homedir(), 'localclaudebox', 'aztec-pr23575', 'barretenberg', 'ts')));
const RESULTS = String(arg('results', join(homedir(), 'localclaudebox', 'phonetests', `fastbench_results_${PORT}.jsonl`)));
const MANAGE_SERVER = !has('no-server');

const CHROME_PKG = 'com.android.chrome';
const CHROME_ACT = `${CHROME_PKG}/com.google.android.apps.chrome.Main`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (a, q) => { try { return execFileSync('adb', a, { encoding: 'utf8' }); } catch (e) { if (!q) console.error(`adb ${a.join(' ')}: ${e.message}`); throw e; } };
const readRows = f => existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
// Pull every "[gpu] returned in X ms" from a result row's log (per-rep walls).
const wallsFromLog = row => (row.log || []).map(l => (l.match(/\[gpu\] returned in\s+([\d.]+)\s*ms/) || [])[1]).filter(Boolean).map(Number);
const wasmInLog = row => (row.log || []).some(l => /\[wasm\]/.test(l));
const stats = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? { median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1], n: s.length } : null; };
const portOpen = p => new Promise(res => { const s = net.connect({ host: '127.0.0.1', port: p }, () => { s.destroy(); res(true); }); s.on('error', () => res(false)); s.setTimeout(800, () => { s.destroy(); res(false); }); });

console.log(`=== fastbench (GPU-only, no WASM): logn=${LOGN} reps=${REPS} profile=${PROFILE} port=${PORT} ===`);

// ── 0. Ensure the dedicated vite server is up (unless --no-server). ──
let serverProc = null;
if (MANAGE_SERVER) {
  if (await portOpen(PORT)) {
    console.log(`server: reusing existing listener on 127.0.0.1:${PORT}`);
  } else {
    if (!existsSync(WORKTREE)) { console.error(`worktree not found: ${WORKTREE}`); process.exit(2); }
    mkdirSync(join(homedir(), 'localclaudebox', 'phonetests'), { recursive: true });
    console.log(`server: starting vite on 127.0.0.1:${PORT} (worktree=${WORKTREE})`);
    serverProc = spawn('yarn', ['dev:msm-webgpu', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], {
      cwd: WORKTREE,
      env: { ...process.env, MSM_WEBGPU_RESULTS_FILE: RESULTS, MSM_WEBGPU_PROGRESS_FILE: RESULTS.replace(/results/, 'progress') },
      stdio: 'ignore',
      detached: false,
    });
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) { if (await portOpen(PORT)) break; await sleep(500); }
    if (!(await portOpen(PORT))) { console.error('server failed to come up in 30s'); serverProc.kill('SIGTERM'); process.exit(2); }
    console.log(`server: up (results -> ${RESULTS})`);
    await sleep(1500);
  }
}

const cleanup = () => { if (serverProc) { try { serverProc.kill('SIGTERM'); } catch {} } };

try {
  // ── 1. adb / phone plumbing (modeled on drive-v2-random.mjs). ──
  let dl = ''; try { dl = adb(['devices'], true); } catch {}
  if (!/\bdevice\b/.test((dl.split('\n')[1] || '').split(/\s+/)[1] || '')) { console.error('no authorized device:\n' + dl); cleanup(); process.exit(2); }
  try { adb(['shell', 'svc', 'power', 'stayon', 'true']); } catch {}
  try { adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']); } catch {}
  try { if (/isKeyguardShowing=true/.test(adb(['shell', 'dumpsys', 'window'], true))) { console.error('PHONE LOCKED — unlock then re-run.'); cleanup(); process.exit(3); } } catch {}
  adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  console.log(`reverse: phone localhost:${PORT} -> mac 127.0.0.1:${PORT}`);

  // ── 2. ONE page load. The GPU-only autorun does warmup + reps internally. ──
  const url = `http://localhost:${PORT}/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&no_wasm=1&logn=${LOGN}&reps=${REPS}&scalar_dist=profile&profile=${PROFILE}${MONTMUL ? `&montmul=${MONTMUL}` : ''}`;
  const baseline = readRows(RESULTS).length;
  console.log(`\n── single load (timeout ${TIMEOUT_MS / 1000}s, incl. first-ever SRS cold-load)`);
  console.log(`   open: ${url}`);
  try { adb(['shell', 'am', 'force-stop', CHROME_PKG]); } catch {}
  await sleep(1500);
  try { adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, '-n', CHROME_ACT]); }
  catch { adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, CHROME_PKG]); }

  // ── 3. Wait for the single result row. ──
  const t0 = Date.now(); let row = null, beat = 0;
  while (Date.now() - t0 < TIMEOUT_MS) {
    await sleep(3000);
    const fresh = readRows(RESULTS).slice(baseline).filter(x => x?.params?.page === 'msm-bench' && x?.params?.no_wasm === true);
    if (fresh.length) { row = fresh[fresh.length - 1]; break; }
    const el = Math.round((Date.now() - t0) / 1000);
    if (el - beat >= 15) { beat = el; console.log(`   …${el}s`); }
  }

  const wall = Math.round((Date.now() - t0) / 1000);
  console.log('\n' + '═'.repeat(64));
  if (!row) { console.log(`✗ TIMEOUT after ${wall}s — no result row`); cleanup(); process.exit(4); }

  // ── 4. Parse + report. ──
  // Per-rep walls come from results.samples (authoritative) with a fallback
  // to the "[gpu] returned in" log lines. Drop the warmup line if present in
  // the log fallback (samples never includes the warmup).
  const sampleWalls = (row.results?.samples ?? []).map(s => s.wallMs).filter(v => Number.isFinite(v));
  let walls = sampleWalls;
  if (!walls.length) { const lw = wallsFromLog(row); walls = lw.length > REPS ? lw.slice(-REPS) : lw; }
  const g = stats(walls);
  const reportedMedian = row.results?.medianWallMs;
  const sawWasm = wasmInLog(row);

  console.log(`fastbench result — state=${row.state} profile=${PROFILE} logn=${LOGN}, Pixel 9a:`);
  if (g) {
    console.log(`  GPU per-rep [gpu] returned in : [${walls.map(w => w.toFixed(1)).join(', ')}] ms  (n=${g.n})`);
    console.log(`  GPU median: ${(reportedMedian ?? g.median).toFixed(1)} ms  (min ${g.min.toFixed(1)}, max ${g.max.toFixed(1)})`);
  } else {
    console.log(`  no per-rep walls parsed; state=${row.state} error=${(row.error || '').split('\n')[0]}`);
  }
  console.log(`  WASM in run path: ${sawWasm ? 'YES (UNEXPECTED!)' : 'no (correct — GPU only)'}`);
  console.log(`  reps captured: ${g ? g.n : 0} (expected ${REPS})`);
  console.log(`  total phone-occupied wall (load→done): ${wall}s`);
  console.log(`  raw row: ${RESULTS}`);

  // Machine-readable line for queue integration.
  console.log('FASTBENCH_JSON: ' + JSON.stringify({
    profile: PROFILE, logn: LOGN, reps: REPS, state: row.state,
    walls, median: reportedMedian ?? (g ? g.median : null), sawWasm, wallSeconds: wall,
  }));
} finally {
  cleanup();
}
