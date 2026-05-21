#!/usr/bin/env node
/**
 * Write a small index for trace artifacts produced by run-ci-bench.sh.
 *
 * The ci-wasm-bench job uploads the whole bench-out tree. This manifest gives
 * operators and bots a stable place to discover which Perfetto traces were
 * captured without unpacking each target directory by hand.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

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

const benchOut = resolve(args.get('bench-out') ?? 'bench-out');
const artifactName = args.get('artifact-name') ?? null;
const runId = args.get('run-id') ?? null;
const sourceCommit = args.get('source-commit') ?? null;
const dashboardUrl = args.get('dashboard-url') ?? null;
const jsonOut = resolve(args.get('out-json') ?? join(benchOut, 'trace-manifest.json'));
const mdOut = resolve(args.get('out-md') ?? join(benchOut, 'trace-manifest.md'));

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readLastJsonl(path) {
  if (!(await exists(path))) return null;
  const raw = await readFile(path, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; --i) {
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  return null;
}

async function readJsonl(path) {
  if (!(await exists(path))) return [];
  const raw = await readFile(path, 'utf8');
  const rows = [];
  for (const line of raw.trim().split('\n').filter(Boolean)) {
    try {
      rows.push(JSON.parse(line));
    } catch {}
  }
  return rows;
}

async function readTextIfExists(path) {
  if (!(await exists(path))) return '';
  return await readFile(path, 'utf8');
}

function runnerFailure(text) {
  if (!text) return null;
  if (text.includes('session response missing sessionId') || text.includes('session create failed')) return 'session_create_failed';
  if (text.includes('no /progress event')) return 'no_first_progress';
  if (text.includes('hit deadline')) return 'deadline';
  if (text.includes('stalled')) return 'stall';
  return 'runner_failed';
}

async function listDirs(path) {
  if (!(await exists(path))) return [];
  return (await readdir(path, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

const traces = [];
for (const targetDir of await listDirs(benchOut)) {
  const targetRoot = join(benchOut, targetDir);
  const tracesRoot = join(targetRoot, 'traces');
  const row = await readLastJsonl(join(targetRoot, 'results.jsonl'));
  const progressRows = await readJsonl(join(targetRoot, 'progress.jsonl'));
  const runnerLog = await readTextIfExists(join(targetRoot, 'runner.log'));
  const rawRunnerError = runnerFailure(runnerLog);
  const lastProgress = progressRows.findLast?.((r) => r?.kind === 'progress')
    ?? [...progressRows].reverse().find((r) => r?.kind === 'progress')
    ?? null;
  const posted = row?.payload?.ok === true || progressRows.some((r) => r?.kind === 'progress' && r.phase === 'result_posted');
  const runnerError = posted ? null : rawRunnerError;
  const data = row?.payload?.data ?? {};
  const runs = Array.isArray(data.runs) ? data.runs : [];
  const traceFiles = (await exists(tracesRoot))
    ? (await readdir(tracesRoot, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.perfetto.json'))
      .map((d) => d.name)
      .sort()
    : [];
  if (!traceFiles.length && !row && !progressRows.length && !runnerError) continue;
  const resultRows = traceFiles.length
    ? traceFiles.map((file) => ({ file, run: runs.find((r) => file.includes(`-${r.run}.perfetto.json`)) ?? runs[0] ?? {} }))
    : (runs.length ? runs.map((run) => ({ file: null, run })) : [{ file: null, run: {} }]);
  for (const { file, run } of resultRows) {
    const path = file ? join(tracesRoot, file) : null;
    const st = path ? await stat(path) : null;
    const setupMs = Number(run.phases?.chonk_setup ?? run.setupMs);
    const proveMs = Number(run.phases?.chonk_prove ?? run.proveMs);
    traces.push({
      target: targetDir,
      benchmark: data.benchmark ?? null,
      flow: data.flow ?? null,
      run: Number.isFinite(Number(run.run)) ? Number(run.run) : null,
      configuredThreads: run.configuredThreads ?? null,
      setupMs: Number.isFinite(setupMs) ? setupMs : null,
      proveMs: Number.isFinite(proveMs) ? proveMs : null,
      proveTotalMs: Number.isFinite(setupMs) && Number.isFinite(proveMs) ? setupMs + proveMs : null,
      wallMs: Number.isFinite(Number(run.wallMs)) ? Number(run.wallMs) : null,
      traceBytes: st?.size ?? null,
      tracePath: path ? relative(benchOut, path) : null,
      resultsPath: relative(benchOut, join(targetRoot, 'results.jsonl')),
      progressPath: relative(benchOut, join(targetRoot, 'progress.jsonl')),
      completedAt: row?.completedAt ?? null,
      posted,
      lastProgressPhase: lastProgress?.phase ?? runnerError,
      lastProgressAtMs: Number.isFinite(Number(lastProgress?.elapsedMs)) ? Number(lastProgress.elapsedMs) : null,
      runnerError,
    });
  }
}

const manifest = {
  schema: 'aztec.wasm-bench.trace-manifest.v1',
  generatedAt: new Date().toISOString(),
  runId,
  sourceCommit,
  dashboardUrl,
  artifactName,
  benchOut,
  traceCount: traces.filter((trace) => trace.tracePath).length,
  entryCount: traces.length,
  targetCount: new Set(traces.map((trace) => trace.target)).size,
  traces,
};

let md = '# wasm-bench Perfetto trace manifest\n\n';
if (dashboardUrl) md += `Dashboard: ${dashboardUrl}\n\n`;
if (runId) md += `Run ID: \`${runId}\`\n\n`;
if (sourceCommit) md += `Source commit: \`${sourceCommit}\`\n\n`;
if (artifactName) md += `CI artifact: \`${artifactName}\`\n\n`;
md += `Trace count: ${manifest.traceCount}\n\n`;
md += `Entry count: ${manifest.entryCount}\n\n`;
md += '| Target | Flow | Threads | setup + prove | Posted | Trace bytes | Trace path |\n';
md += '|---|---|---:|---:|---|---:|---|\n';
for (const trace of traces) {
  const flow = trace.flow ?? '';
  const threads = trace.configuredThreads ?? '';
  const total = trace.proveTotalMs === null ? '' : `${trace.proveTotalMs.toFixed(0)} ms`;
  const tracePath = trace.tracePath ? `\`${trace.tracePath}\`` : '';
  const traceBytes = trace.traceBytes ?? '';
  md += `| ${trace.target} | ${flow} | ${threads} | ${total} | ${trace.posted ? 'yes' : `no (${trace.lastProgressPhase ?? 'no progress'})`} | ${traceBytes} | ${tracePath} |\n`;
}

await writeFile(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(mdOut, md);
console.log(`wrote ${manifest.entryCount} manifest rows with ${manifest.traceCount} traces to ${jsonOut} and ${mdOut}`);
