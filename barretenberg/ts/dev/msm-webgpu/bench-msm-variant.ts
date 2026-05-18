/// <reference types="@webgpu/types" />
// Head-to-head perf bench: stock SMVP vs tree-reduce SMVP. Self-contained
// page so the BrowserStack runner can drive it on a real GPU without
// pulling in the noble reference (which adds ~5 s CPU per run on a remote
// device and isn't needed once correctness is already verified locally).
//
// URL params:
//   ?logn=N         — log₂(input size). Default 16. Bound by srs LOGN_MAX.
//   ?runs=R         — measured runs per variant. Default 5. One pre-warm
//                     run per variant is always done and not measured.
//   ?variants=A,B   — comma-separated subset of {stock, tree}. Default both.
//   ?coi=1          — no-op for this page (we never touch WASM).

import {
  compute_bn254_msm_batch_affine,
  GpuContext,
  precompute_bn254_bases,
  type CachedBases,
  type ProfileCapture,
} from '../../src/msm_webgpu/index.js';
import { loadSrsPoints } from './srs.js';
import { makeResultsClient } from './results_post.js';
import { bn254 } from '@noble/curves/bn254';

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string): void {
  const span = document.createElement('span');
  if (level !== 'info') span.className = level;
  span.textContent = msg + '\n';
  $log.appendChild(span);
  $log.scrollTop = $log.scrollHeight;
}

const LOGN_MIN = 16;
const LOGN_MAX = 20;
const SRS_NUM_POINTS = 1 << LOGN_MAX;

const FR_ORDER = bn254.fields.Fr.ORDER;
function randomFr(): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    bytes[31] &= 0x3f;
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    if (v < FR_ORDER) return v;
  }
}

type VariantName = 'stock' | 'tree';

interface RunRow {
  variant: VariantName;
  run_idx: number;
  ms: number;
  gpu_x: string;
  gpu_y: string;
}

async function runOnce(
  ctx: GpuContext,
  bases: CachedBases,
  scalars: Buffer,
  variant: VariantName,
  captureProfile: boolean,
): Promise<{ ms: number; xy: { x: bigint; y: bigint }; capture: ProfileCapture | null }> {
  const capture: ProfileCapture | null = captureProfile ? { profile: null } : null;
  const t0 = performance.now();
  const xy = await compute_bn254_msm_batch_affine(
    ctx,
    bases,
    scalars,
    false,
    {},
    capture ?? undefined,
    'legacy',
    variant === 'tree',
  );
  const ms = performance.now() - t0;
  return { ms, xy, capture };
}

async function main(): Promise<void> {
  const qp = new URLSearchParams(window.location.search);
  const logN = Math.max(LOGN_MIN, Math.min(LOGN_MAX, parseInt(qp.get('logn') ?? '16', 10)));
  const runs = Math.max(1, Math.min(20, parseInt(qp.get('runs') ?? '5', 10)));
  const variantsRaw = (qp.get('variants') ?? 'stock,tree').split(',');
  const variants: VariantName[] = [];
  for (const v of variantsRaw) {
    if (v === 'stock' || v === 'tree') variants.push(v);
  }
  if (variants.length === 0) {
    log('err', `no valid variants in ?variants=${qp.get('variants')}`);
    return;
  }

  const client = makeResultsClient({ page: 'bench-msm-variant' });

  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU not available');

    log('info', `params: logN=${logN} runs=${runs} variants=${variants.join(',')}`);

    log('info', `loading SRS (${SRS_NUM_POINTS.toLocaleString()} points)…`);
    const srsBuf = await loadSrsPoints(SRS_NUM_POINTS, () => {});
    log('ok', `srs loaded`);

    const n = 1 << logN;
    const pointsBuf = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, n * 64);
    const scalarBytes = new Uint8Array(n * 32);
    for (let i = 0; i < n; i++) {
      const s = randomFr();
      let x = s;
      for (let k = 0; k < 32; k++) {
        scalarBytes[i * 32 + k] = Number(x & 0xffn);
        x >>= 8n;
      }
    }
    log('info', `generated ${n.toLocaleString()} random scalars`);

    log('info', 'creating GpuContext…');
    const ctx = await GpuContext.create();
    log('ok', 'GpuContext ready');

    log('info', 'precomputing bases…');
    const bases = await precompute_bn254_bases(ctx, pointsBuf as unknown as Buffer, false);
    log('ok', 'bases ready');

    const rows: RunRow[] = [];

    const profileCaptures: Record<string, ProfileCapture> = {};

    for (const variant of variants) {
      log('info', `[${variant}] pre-warm (untimed) — compiles pipelines on first dispatch`);
      const warm = await runOnce(ctx, bases, scalarBytes as unknown as Buffer, variant, false);
      log('info', `[${variant}] pre-warm done in ${warm.ms.toFixed(0)} ms, gpu.x=${warm.xy.x.toString(16).slice(0, 16)}…`);
      client.postProgress({ kind: 'warm', variant, ms: warm.ms });

      for (let r = 0; r < runs; r++) {
        // Capture per-stage GPU profile on the last run of each variant.
        const captureProfile = r === runs - 1;
        // Clear any stale tree-phase dump from a prior variant.
        (globalThis as unknown as { __last_tree_phase_timings_ms?: unknown }).__last_tree_phase_timings_ms = undefined;
        const out = await runOnce(ctx, bases, scalarBytes as unknown as Buffer, variant, captureProfile);
        const row: RunRow = {
          variant,
          run_idx: r,
          ms: out.ms,
          gpu_x: out.xy.x.toString(16),
          gpu_y: out.xy.y.toString(16),
        };
        rows.push(row);
        log('ok', `[${variant}] run ${r + 1}/${runs}: ${out.ms.toFixed(1)} ms gpu.x=${row.gpu_x.slice(0, 16)}…`);
        client.postProgress({ kind: 'run', variant, run_idx: r, ms: out.ms });
        if (out.capture) {
          profileCaptures[variant] = out.capture;
          // Attach the tree-phase wall-clock dump (if the last call was
          // tree-reduce) onto the same capture object so the JSONL POST
          // carries it.
          const treePhases = (globalThis as unknown as { __last_tree_phase_timings_ms?: { phase: string; ms: number }[] }).__last_tree_phase_timings_ms;
          if (treePhases) (out.capture as unknown as { treePhases?: { phase: string; ms: number }[] }).treePhases = treePhases;
        }
      }
    }

    // Aggregate profile per variant: group stages by family (prefix
    // before "[" or first colon) and report total ms per family.
    function familyOf(label: string): string {
      const i1 = label.indexOf('[');
      if (i1 >= 0) return label.slice(0, i1);
      const i2 = label.indexOf(':');
      if (i2 >= 0) return label.slice(0, i2);
      return label;
    }
    const profileSummary: Record<string, Record<string, { count: number; ms: number }>> = {};
    for (const [variant, cap] of Object.entries(profileCaptures)) {
      const fams: Record<string, { count: number; ms: number }> = {};
      if (cap.profile) {
        for (const row of cap.profile) {
          const fam = familyOf(row.label);
          if (!fams[fam]) fams[fam] = { count: 0, ms: 0 };
          fams[fam].count++;
          fams[fam].ms += row.ms;
        }
      }
      if (cap.gpu_readback) {
        fams['__gpu_compute_wall'] = { count: 1, ms: cap.gpu_readback.gpu_compute_wall };
        fams['__profiled_passes_sum'] = { count: 1, ms: cap.gpu_readback.profiled_passes_sum };
        fams['__untimestamped'] = { count: 1, ms: cap.gpu_readback.untimestamped };
      }
      profileSummary[variant] = fams;
      log('info', `[${variant}] profile families:`);
      const sorted = Object.entries(fams).sort((a, b) => b[1].ms - a[1].ms);
      for (const [fam, v] of sorted) {
        log('info', `  ${fam.padEnd(36)} ${v.ms.toFixed(2).padStart(8)} ms  (${v.count} stages)`);
      }
    }

    // Summary per variant + correctness cross-check.
    const summary: Record<string, { median_ms: number; mean_ms: number; min_ms: number; max_ms: number; deterministic: boolean; gpu_x: string }> = {};
    for (const variant of variants) {
      const vrows = rows.filter(r => r.variant === variant);
      const mss = vrows.map(r => r.ms).sort((a, b) => a - b);
      const median = mss[Math.floor(mss.length / 2)];
      const mean = mss.reduce((a, b) => a + b, 0) / mss.length;
      const xs = vrows.map(r => r.gpu_x);
      const deterministic = xs.every(x => x === xs[0]);
      summary[variant] = {
        median_ms: median,
        mean_ms: mean,
        min_ms: mss[0],
        max_ms: mss[mss.length - 1],
        deterministic,
        gpu_x: xs[0],
      };
      log('info', `[${variant}] summary: median=${median.toFixed(1)} mean=${mean.toFixed(1)} min=${mss[0].toFixed(1)} max=${mss[mss.length - 1].toFixed(1)} deterministic=${deterministic}`);
    }

    let stockTreeAgree: boolean | null = null;
    if (variants.includes('stock') && variants.includes('tree')) {
      stockTreeAgree = summary.stock.gpu_x === summary.tree.gpu_x;
      log(stockTreeAgree ? 'ok' : 'err', `stock vs tree gpu.x agreement: ${stockTreeAgree}`);
    }

    await client.postResults({
      state: 'done',
      params: { logN, runs, variants, page: 'bench-msm-variant' },
      results: { rows, summary, stockTreeAgree, profileSummary, profileCaptures },
      log: [],
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
    log('ok', 'posted /results state=done');
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log('err', `FATAL: ${msg}`);
    try {
      await client.postResults({
        state: 'error',
        params: { page: 'bench-msm-variant' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    } catch {}
  }
}

main().catch(e => log('err', `unhandled: ${e instanceof Error ? e.message : String(e)}`));
