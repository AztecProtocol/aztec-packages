#!/usr/bin/env node
/**
 * Convert a wasm-bench JSONL row (the body POSTed by `bench.worker.ts` to /results) into the
 * benchmark-page-data format consumed by `github-action-benchmark`: an array of
 * `{ name, value, unit }` rows that are smaller-is-better.
 *
 * Args:
 *   --in <path>     Path to the JSONL file (one row expected; if multiple, the last wins).
 *   --out <path>    Output path for the .bench.json (parent dirs are created).
 *   --label <str>   Prefix used in the row names — keep this stable so the bencher can graph
 *                   the same series across runs (e.g. "wasm-bench/macos-sequoia-chrome-flow_x").
 *
 * On missing / unparseable input we still write an empty `[]` so the bencher doesn't crash
 * the surrounding ci3 job.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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

const inFile = resolve(args.get('in') ?? '');
const outFile = resolve(args.get('out') ?? '');
const label = args.get('label') ?? 'wasm-bench';

if (!inFile || !outFile) {
  console.error('--in and --out are required');
  process.exit(2);
}

await mkdir(dirname(outFile), { recursive: true });

let rows = [];
try {
  const content = await readFile(inFile, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (e) {
      console.warn(`skip unparseable JSONL row: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
} catch (e) {
  console.warn(`could not read ${inFile}: ${e instanceof Error ? e.message : String(e)}`);
}

const last = rows[rows.length - 1] ?? {};
const payload = last.payload ?? {};
const data = payload.data ?? {};
const allRuns = Array.isArray(data.runs) ? data.runs : [];
// Don't surface zero-rows from failed runs as "fast" bench numbers — drop any run
// that didn't finish chonk_prove cleanly.
const runs = allRuns.filter((r) => !r?.proveError && Number(r?.proveMs ?? 0) > 0);
const skipped = allRuns.length - runs.length;

function avg(xs) {
  const filtered = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

const proveAvg = avg(runs.map((r) => r.proveMs));
const setupAvg = avg(runs.map((r) => r.setupMs));
const wallAvg = avg(runs.map((r) => r.wallMs));
const proveTotalAvg = avg(
  runs.map((r) => {
    const setup = Number(r.phases?.chonk_setup ?? r.setupMs ?? 0);
    const prove = Number(r.phases?.chonk_prove ?? r.proveMs ?? 0);
    if (!Number.isFinite(setup) || !Number.isFinite(prove)) return null;
    return setup + prove;
  }),
);

const out = [];
if (proveTotalAvg !== null) out.push({ name: `${label}/proveTotalMs`, value: proveTotalAvg, unit: 'ms' });
if (proveAvg !== null) out.push({ name: `${label}/proveMs`, value: proveAvg, unit: 'ms' });
if (setupAvg !== null) out.push({ name: `${label}/setupMs`, value: setupAvg, unit: 'ms' });
if (wallAvg !== null) out.push({ name: `${label}/wallMs`, value: wallAvg, unit: 'ms' });

await writeFile(outFile, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} rows to ${outFile}${skipped ? ` (skipped ${skipped} failed run(s))` : ''}`);
