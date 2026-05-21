#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = new Map();
for (let i = 2; i < process.argv.length; ++i) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i++;
  } else {
    args.set(key, 'true');
  }
}

const baseFile = args.get('base');
const headFile = args.get('head');
if (!baseFile || !headFile) {
  console.error('--base <baseline-progress.jsonl> and --head <head-progress.jsonl> are required');
  process.exit(2);
}

const watch = args.get('watch') === 'true' || args.get('watch') === '1';
const pollMs = Number(args.get('poll-ms') ?? '1000');

function parseLines(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {}
  }
  return rows;
}

async function readRows(file) {
  try {
    return parseLines(await readFile(resolve(file), 'utf8'));
  } catch {
    return [];
  }
}

function baselineByPhase(rows) {
  const out = new Map();
  for (const row of rows) {
    const phase = String(row?.phase ?? '');
    if (!phase || phase.startsWith('heartbeat:')) continue;
    if (out.has(phase)) continue;
    const elapsedMs = Number(row.elapsedMs);
    if (Number.isFinite(elapsedMs)) out.set(phase, elapsedMs);
  }
  return out;
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function signedSeconds(ms) {
  const sign = ms > 0 ? '+' : '';
  return `${sign}${seconds(ms)}`;
}

function printRow(row, base) {
  const phase = String(row?.phase ?? '');
  if (!phase || phase.startsWith('heartbeat:')) return;
  const elapsedMs = Number(row.elapsedMs);
  if (!Number.isFinite(elapsedMs)) return;
  const baselineMs = base.get(phase);
  const source = row.source ?? 'worker';
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const extra = [];
  for (const key of ['bytes', 'gzipBytes', 'wasmBytes', 'inputBytes', 'decodedBytes', 'threads', 'run', 'trace', 'smoke']) {
    if (details[key] !== undefined && details[key] !== null) extra.push(`${key}=${details[key]}`);
  }
  const diff = baselineMs === undefined ? 'base=n/a' : `base=${seconds(baselineMs)} delta=${signedSeconds(elapsedMs - baselineMs)}`;
  console.log(`[head=${seconds(elapsedMs)} ${diff}] ${source} phase=${phase}${extra.length ? ` ${extra.join(' ')}` : ''}`);
}

const base = baselineByPhase(await readRows(baseFile));
let offset = 0;
const seen = new Set();

async function readNewHeadRows() {
  try {
    const st = await stat(resolve(headFile));
    if (st.size <= offset) return [];
    const content = await readFile(resolve(headFile), 'utf8');
    const slice = content.slice(offset);
    offset = st.size;
    return parseLines(slice);
  } catch {
    return [];
  }
}

do {
  const rows = await readNewHeadRows();
  let finalSeen = false;
  for (const row of rows) {
    const key = `${row.phase ?? ''}:${row.elapsedMs ?? ''}:${row.timestamp ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    printRow(row, base);
    if (row.final) finalSeen = true;
  }
  if (!watch || finalSeen) break;
  await sleep(Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 1000);
} while (true);
