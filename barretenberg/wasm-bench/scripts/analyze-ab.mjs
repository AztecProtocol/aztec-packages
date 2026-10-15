#!/usr/bin/env node
// Analyze a wasm-bench paired A/B result file.
//
// Reads either:
//   - a result JSONL produced by serve-bench.mjs (--result-jsonl path), or
//   - a single JSON file containing one `chonk-ab` result object.
//
// Reports per-variant {n, mean, median, stddev, min, max} and per-pair
// Δ = proveTotal[variants[0]] − proveTotal[variants[1]] (and Δ%) with a
// seeded bootstrap 95% CI on the median Δ, plus a Wilcoxon signed-rank
// statistic on the paired Δ. Asserts proofFieldCount and
// verificationKeyBytes are identical across pairs/variants (catches
// "we benchmarked different circuits" bugs).

import { readFileSync } from 'node:fs';
import { Command } from 'commander';

function mean(values) {
  if (values.length === 0) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
}

function stddev(values) {
  const n = values.length;
  if (n < 2) return NaN;
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

function summarize(values) {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    stddev: stddev(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMedianCI(values, { iters = 4000, alpha = 0.05, seed = 42 } = {}) {
  const n = values.length;
  if (n === 0) return { lo: NaN, hi: NaN, point: NaN, n, iters };
  const rng = mulberry32(seed);
  const meds = new Float64Array(iters);
  for (let i = 0; i < iters; i++) {
    const sample = new Array(n);
    for (let j = 0; j < n; j++) sample[j] = values[Math.floor(rng() * n)];
    meds[i] = median(sample);
  }
  const sorted = Array.from(meds).sort((a, b) => a - b);
  const loIdx = Math.max(0, Math.floor((alpha / 2) * iters));
  const hiIdx = Math.min(iters - 1, Math.ceil((1 - alpha / 2) * iters) - 1);
  return { lo: sorted[loIdx], hi: sorted[hiIdx], point: median(values), n, iters, seed };
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1 + p * Math.abs(x));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function wilcoxonSignedRank(deltas) {
  const nonZero = deltas.filter(d => d !== 0);
  const n = nonZero.length;
  if (n === 0) return { n, wPlus: 0, wMinus: 0, statistic: NaN, z: NaN, p: NaN };
  const abs = nonZero.map(d => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1 }));
  abs.sort((a, b) => a.abs - b.abs);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && abs[j + 1].abs === abs[i].abs) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) abs[k].rank = avgRank;
    i = j + 1;
  }
  let wPlus = 0;
  let wMinus = 0;
  for (const x of abs) {
    if (x.sign > 0) wPlus += x.rank;
    else wMinus += x.rank;
  }
  const W = Math.min(wPlus, wMinus);
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  const z = sigma === 0 ? 0 : (W - mu + 0.5) / sigma;
  const p = 2 * normalCdf(-Math.abs(z));
  return { n, wPlus, wMinus, statistic: W, z, p };
}

function loadResult(path) {
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.startsWith('{')) {
    return JSON.parse(raw);
  }
  // JSONL — take the last `chonk-ab` row.
  let last;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed.benchmark === 'chonk-ab') last = parsed;
  }
  if (!last) {
    throw new Error(`No chonk-ab row found in ${path}`);
  }
  return last;
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`;
}

function fmtMs(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(1)} ms`;
}

function metricFromRun(run, metric) {
  if (!run) return NaN;
  if (metric === 'proveTotalMs') {
    if (Number.isFinite(run.proveTotalMs)) return run.proveTotalMs;
    return Number(run.setupMs ?? 0) + Number(run.proveMs ?? 0);
  }
  return Number(run[metric]);
}

export function analyzeAB(result, { warmupPairs = result.warmupPairs ?? 1, metrics = ['proveTotalMs', 'setupMs', 'proveMs'], bootstrapIters = 4000, seed = 42 } = {}) {
  const variants = result.variants;
  if (!Array.isArray(variants) || variants.length !== 2) {
    throw new Error(`Result.variants must be a 2-element array; got ${JSON.stringify(variants)}`);
  }
  const [varA, varB] = variants;

  // Group by pair index.
  const byPair = new Map();
  for (const entry of result.pairs) {
    if (!byPair.has(entry.pair)) byPair.set(entry.pair, {});
    byPair.get(entry.pair)[entry.variant] = entry;
  }
  const sortedPairs = [...byPair.keys()].sort((a, b) => a - b);

  // Apply warmup drop.
  const analyzedPairs = sortedPairs.filter(p => p >= warmupPairs);
  const aRuns = analyzedPairs.map(p => byPair.get(p)?.[varA]);
  const bRuns = analyzedPairs.map(p => byPair.get(p)?.[varB]);

  // Sanity: same circuit across all runs.
  const proofFieldCounts = new Set([...aRuns, ...bRuns].map(e => e?.run?.proofFieldCount));
  const vkBytes = new Set([...aRuns, ...bRuns].map(e => e?.run?.verificationKeyBytes));
  const allVerified = [...aRuns, ...bRuns].every(e => e?.run?.verified === true);

  const sanity = {
    proofFieldCounts: [...proofFieldCounts],
    verificationKeyBytes: [...vkBytes],
    allVerified,
  };

  // Build position-balance tally (how many pair entries had A first vs B first).
  const positionBalance = { aFirst: 0, bFirst: 0 };
  for (const p of analyzedPairs) {
    const entry = byPair.get(p);
    if (!entry) continue;
    if ((entry[varA]?.position ?? -1) < (entry[varB]?.position ?? Infinity)) positionBalance.aFirst++;
    else positionBalance.bFirst++;
  }

  const out = {
    variants,
    flow: result.flow,
    pairs: sortedPairs.length,
    warmupPairs,
    analyzedPairs: analyzedPairs.length,
    positionBalance,
    sanity,
    perMetric: {},
  };

  for (const metric of metrics) {
    const aVals = aRuns.map(e => metricFromRun(e?.run, metric));
    const bVals = bRuns.map(e => metricFromRun(e?.run, metric));
    const validIdx = aVals.map((_, i) => i).filter(i => Number.isFinite(aVals[i]) && Number.isFinite(bVals[i]));
    const aPaired = validIdx.map(i => aVals[i]);
    const bPaired = validIdx.map(i => bVals[i]);
    const deltas = validIdx.map(i => aVals[i] - bVals[i]);
    const deltaPcts = validIdx.map(i => (100 * (aVals[i] - bVals[i])) / bVals[i]);

    const aSummary = summarize(aPaired);
    const bSummary = summarize(bPaired);
    const deltaSummary = summarize(deltas);
    const deltaPctSummary = summarize(deltaPcts);
    const ciMs = bootstrapMedianCI(deltas, { iters: bootstrapIters, seed });
    const ciPct = bootstrapMedianCI(deltaPcts, { iters: bootstrapIters, seed: seed + 1 });
    const wilcoxon = wilcoxonSignedRank(deltas);

    const significant = ciPct.lo > 0 || ciPct.hi < 0;

    out.perMetric[metric] = {
      a: { variant: varA, ...aSummary },
      b: { variant: varB, ...bSummary },
      deltaMs: { ...deltaSummary, ci95: { lo: ciMs.lo, hi: ciMs.hi, point: ciMs.point } },
      deltaPct: { ...deltaPctSummary, ci95: { lo: ciPct.lo, hi: ciPct.hi, point: ciPct.point } },
      wilcoxon,
      significant,
    };
  }

  return out;
}

function renderReport(analysis) {
  const lines = [];
  lines.push(`# wasm-bench A/B analysis`);
  lines.push('');
  lines.push(`Flow: ${analysis.flow}`);
  lines.push(`Variants: ${analysis.variants[0]} vs ${analysis.variants[1]}`);
  lines.push(`Pairs total: ${analysis.pairs}; warmup dropped: ${analysis.warmupPairs}; analyzed: ${analysis.analyzedPairs}`);
  lines.push(`Position balance (A first / B first): ${analysis.positionBalance.aFirst} / ${analysis.positionBalance.bFirst}`);
  lines.push(`Sanity — proofFieldCount(s): ${analysis.sanity.proofFieldCounts.join(', ')}; vkBytes: ${analysis.sanity.verificationKeyBytes.join(', ')}; allVerified: ${analysis.sanity.allVerified}`);
  lines.push('');
  for (const [metric, m] of Object.entries(analysis.perMetric)) {
    lines.push(`## ${metric}`);
    lines.push('');
    lines.push(`| Side | n | median | mean | stddev | min | max |`);
    lines.push(`|---|---:|---:|---:|---:|---:|---:|`);
    lines.push(`| ${m.a.variant} | ${m.a.n} | ${fmtMs(m.a.median)} | ${fmtMs(m.a.mean)} | ${fmtMs(m.a.stddev)} | ${fmtMs(m.a.min)} | ${fmtMs(m.a.max)} |`);
    lines.push(`| ${m.b.variant} | ${m.b.n} | ${fmtMs(m.b.median)} | ${fmtMs(m.b.mean)} | ${fmtMs(m.b.stddev)} | ${fmtMs(m.b.min)} | ${fmtMs(m.b.max)} |`);
    lines.push('');
    lines.push(`Δ (${m.a.variant} − ${m.b.variant}):`);
    lines.push(`- Δ median = ${fmtMs(m.deltaMs.median)} (95% CI [${fmtMs(m.deltaMs.ci95.lo)}, ${fmtMs(m.deltaMs.ci95.hi)}])`);
    lines.push(`- Δ% median = ${fmtPct(m.deltaPct.median)} (95% CI [${fmtPct(m.deltaPct.ci95.lo)}, ${fmtPct(m.deltaPct.ci95.hi)}])`);
    lines.push(`- Δ stddev = ${fmtMs(m.deltaMs.stddev)}; min/max = ${fmtMs(m.deltaMs.min)} / ${fmtMs(m.deltaMs.max)}`);
    lines.push(`- Wilcoxon signed-rank: W=${m.wilcoxon.statistic}, z=${m.wilcoxon.z?.toFixed(3)}, p≈${m.wilcoxon.p?.toFixed(4)}`);
    lines.push(`- Verdict: ${m.significant ? 'Δ% 95% CI excludes zero — significant' : 'Δ% 95% CI contains zero — not distinguishable from zero at this N'}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main(argv) {
  const program = new Command();
  program
    .option('--result <path>', 'Path to chonk-ab JSON or JSONL result file', '/tmp/wasm-bench-results.jsonl')
    .option('--warmup <count>', 'Number of warmup pairs to drop (defaults to result.warmupPairs)', value => Number.parseInt(value, 10))
    .option('--metric <name...>', 'Metrics to analyze', value => value.split(','), ['proveTotalMs', 'setupMs', 'proveMs'])
    .option('--bootstrap-iters <count>', 'Bootstrap iterations', value => Number.parseInt(value, 10), 4000)
    .option('--seed <value>', 'PRNG seed', value => Number.parseInt(value, 10), 42)
    .option('--json', 'Emit JSON analysis instead of markdown')
    .parse(argv);

  const options = program.opts();
  const result = loadResult(options.result);
  const analysis = analyzeAB(result, {
    warmupPairs: options.warmup,
    metrics: options.metric.flatMap(m => m.split(',').map(s => s.trim()).filter(Boolean)),
    bootstrapIters: options.bootstrapIters,
    seed: options.seed,
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(analysis)}\n`);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
