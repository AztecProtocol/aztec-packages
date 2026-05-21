#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  console.error('--base <results.jsonl> and --head <results.jsonl> are required');
  process.exit(2);
}

async function lastRow(file) {
  const content = await readFile(resolve(file), 'utf8');
  const rows = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed));
  }
  if (rows.length === 0) throw new Error(`${file} has no JSONL rows`);
  return rows.at(-1);
}

function avg(values) {
  const filtered = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function metrics(row) {
  const data = row?.payload?.data ?? {};
  const allRuns = Array.isArray(data.runs) ? data.runs : [];
  const runs = allRuns.filter((r) => !r?.proveError && Number(r?.proveMs ?? 0) > 0);
  const sourceRuns = runs.length > 0 ? runs : allRuns;
  const out = new Map();
  const add = (name, value, unit = 'ms') => {
    if (typeof value === 'number' && Number.isFinite(value)) out.set(name, { value, unit });
  };

  add('chonk_setup', avg(sourceRuns.map((r) => Number(r?.phases?.chonk_setup ?? r?.setupMs))));
  add('chonk_prove', avg(sourceRuns.map((r) => Number(r?.phases?.chonk_prove ?? r?.proveMs))));
  const proveTotal = avg(
    sourceRuns.map((r) => {
      const setup = Number(r?.phases?.chonk_setup ?? r?.setupMs);
      const prove = Number(r?.phases?.chonk_prove ?? r?.proveMs);
      return Number.isFinite(setup) && Number.isFinite(prove) ? setup + prove : null;
    }),
  );
  add('proveTotalMs', proveTotal);
  add('wallMs', avg(sourceRuns.map((r) => Number(r?.wallMs))));

  for (const [name, value] of Object.entries(data.preamble ?? {})) add(`preamble.${name}`, value);
  for (const [name, value] of Object.entries(data.coldStart ?? {})) {
    if (name.endsWith('Bytes') || name.endsWith('Size')) add(`coldStart.${name}`, value, 'bytes');
    else add(`coldStart.${name}`, value);
  }
  const firstRun = sourceRuns[0] ?? {};
  for (const [name, value] of Object.entries(firstRun.phases ?? {})) add(`phase.${name}`, value);
  return out;
}

function format(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (unit === 'bytes') {
    if (Math.abs(value) >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MiB`;
    if (Math.abs(value) >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${value.toFixed(0)} B`;
  }
  return `${value.toFixed(0)} ms`;
}

const base = metrics(await lastRow(baseFile));
const head = metrics(await lastRow(headFile));
const names = [...new Set([...base.keys(), ...head.keys()])].sort((a, b) => {
  const order = ['proveTotalMs', 'chonk_setup', 'chonk_prove', 'wallMs'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.localeCompare(b);
});

console.log('| metric | base | head | delta | delta % |');
console.log('|---|---:|---:|---:|---:|');
for (const name of names) {
  const b = base.get(name);
  const h = head.get(name);
  if (!b || !h || b.unit !== h.unit) continue;
  const delta = h.value - b.value;
  const pct = b.value === 0 ? null : (delta / b.value) * 100;
  const sign = delta > 0 ? '+' : '';
  console.log(
    `| ${name} | ${format(b.value, b.unit)} | ${format(h.value, h.unit)} | ${sign}${format(delta, b.unit)} | ${
      pct === null ? '' : `${sign}${pct.toFixed(1)}%`
    } |`,
  );
}
