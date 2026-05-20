/// <reference types="@webgpu/types" />
// End-to-end 2^16 MSM A/B: full compute_bn254_msm_batch_affine, baseline
// (fused_revcarry=false) vs the packed fused_revcarry pipeline. Pure
// TS+WebGPU — no wasm. Correctness gate is GPU-vs-GPU: the unmodified
// baseline path is the oracle; fused MUST return the identical {x,y}.
// Median wall time of REPS timed dispatches per path. Results POSTed to
// the JSONL middleware so the BrowserStack runner picks them up.

import { CachedBases, compute_bn254_msm_batch_affine, GpuContext, precompute_bn254_bases } from '../../src/msm_webgpu/index.js';
import { loadSrsPoints } from './srs.js';
import { makeResultsClient } from './results_post.js';
import { bn254 } from '@noble/curves/bn254';

const $log = document.getElementById('log') as HTMLDivElement;
const lines: string[] = [];
const rc = makeResultsClient({ page: 'bench-msm-e2e' });
function log(m: string) {
  lines.push(`${new Date().toISOString()} ${m}`);
  $log.textContent = lines.join('\n');
  console.log(m);
  // Mirror every step to /progress so a remote (BrowserStack) hang or
  // device-lost still tells us exactly which phase it died in.
  try {
    rc.postProgress({ kind: 'log', msg: m });
  } catch {
    /* progress is best-effort */
  }
}

const FR_ORDER = bn254.fields.Fr.ORDER;
function randomFr(): bigint {
  for (;;) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    b[31] &= 0x3f;
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    if (v < FR_ORDER) return v;
  }
}
function biToLe32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

type RunMode = 'baseline' | 'fused' | 'v2';

async function runPath(
  ctx: GpuContext,
  bases: CachedBases,
  scalars: Uint8Array,
  mode: RunMode,
  reps: number,
): Promise<{ ms: number[]; xy: { x: bigint; y: bigint } }> {
  const fused = mode === 'fused';
  const useV2 = mode === 'v2';
  log(`[e2e] ${mode}: warm-up dispatch…`);
  await compute_bn254_msm_batch_affine(
    ctx, bases, scalars as unknown as Buffer, false, {}, undefined, 'legacy', false, fused, useV2,
  );
  log(`[e2e] ${mode}: warm-up ok`);
  const ms: number[] = [];
  let xy = { x: 0n, y: 0n };
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    xy = await compute_bn254_msm_batch_affine(
      ctx, bases, scalars as unknown as Buffer, false, {}, undefined, 'legacy', false, fused, useV2,
    );
    log(`[e2e] ${mode}: rep ${r} = ${(performance.now() - t0).toFixed(1)} ms`);
    ms.push(performance.now() - t0);
  }
  return { ms, xy };
}

async function main() {
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu undefined — no WebGPU');
    const qp = new URLSearchParams(window.location.search);
    const logN = parseInt(qp.get('logn') ?? '16', 10);
    const reps = parseInt(qp.get('reps') ?? '5', 10);
    const n = 1 << logN;
    log(`[e2e] logN=${logN} n=${n} reps=${reps}`);

    log(`[e2e] loading ${n} SRS points…`);
    const srs = await loadSrsPoints(n);
    const pointsBuf = new Uint8Array(srs.buffer, srs.byteOffset, n * 64);

    log(`[e2e] generating ${n} random scalars…`);
    const scalars = new Uint8Array(n * 32);
    for (let i = 0; i < n; i++) scalars.set(biToLe32(randomFr()), i * 32);

    // CPU oracle (opt-in). Default OFF → full random scalars so timing is
    // a representative 2^logN MSM. `cpuoracle=1` keeps the first ORACLE_K
    // random scalars and zeroes the rest so the noble reference is cheap.
    // `oracle1=1` → scalars = [1,0,0,…] so the GPU MSM must return P_0
    // (the most unambiguous correctness probe). Both opt-in.
    const le = (u8: Uint8Array, off: number): bigint => {
      let v = 0n;
      for (let b = 31; b >= 0; b--) v = (v << 8n) | BigInt(u8[off + b]);
      return v;
    };
    const oracle1 = qp.get('oracle1') === '1';
    const cpuOracle = oracle1 || qp.get('cpuoracle') === '1';
    let refAff: { x: bigint; y: bigint } | null = null;
    if (cpuOracle) {
      const ORACLE_K = oracle1 ? 1 : Math.min(n, 512);
      if (oracle1) {
        scalars.fill(0);
        scalars[0] = 1;
      }
      for (let i = ORACLE_K; i < n; i++) scalars.fill(0, i * 32, i * 32 + 32);
      const G1o = bn254.G1.ProjectivePoint;
      const oraclePts: InstanceType<typeof G1o>[] = [];
      const oracleScs: bigint[] = [];
      for (let i = 0; i < ORACLE_K; i++) {
        oraclePts.push(G1o.fromAffine({ x: le(pointsBuf, i * 64), y: le(pointsBuf, i * 64 + 32) }));
        oracleScs.push(le(scalars, i * 32));
      }
      let naive = G1o.ZERO;
      for (let i = 0; i < ORACLE_K; i++) {
        if (oracleScs[i] !== 0n) naive = naive.add(oraclePts[i].multiply(oracleScs[i]));
      }
      const refP = G1o.msm(oraclePts, oracleScs);
      refAff = refP.is0() ? null : refP.toAffine();
      const naiveAff = naive.is0() ? null : naive.toAffine();
      const selfOk = naive.is0() ? refP.is0() : !!naiveAff && !!refAff && naiveAff.x === refAff.x && naiveAff.y === refAff.y;
      const p0 = oraclePts[0].toAffine();
      log(`[e2e] oracle self-consistent (msm==naive): ${selfOk}`);
      log(`[e2e] P_0 = (${p0.x}, ${p0.y})`);
      log(`[e2e] CPU oracle (K=${ORACLE_K}) = (${refAff ? `${refAff.x}, ${refAff.y}` : 'INF'})`);
    }

    log('[e2e] creating GpuContext…');
    const ctx = await GpuContext.create();
    log('[e2e] ctx ok; precompute BigInt bases…');
    const basesBI = await precompute_bn254_bases(ctx, pointsBuf as unknown as Buffer, false, undefined, false);
    log('[e2e] basesBI ok; precompute PACKED bases…');
    const basesPK = await precompute_bn254_bases(ctx, pointsBuf as unknown as Buffer, false, undefined, true);
    log('[e2e] basesPK ok');

    // --- Bases conversion probe: confirm convert_points_only(packed) and
    // convert_points_only(BigInt) encode the SAME field value. ---
    {
      const dev = ctx.device;
      const readBuf = async (buf: GPUBuffer, bytes: number): Promise<Uint8Array> => {
        const st = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const enc = dev.createCommandEncoder();
        enc.copyBufferToBuffer(buf, 0, st, 0, bytes);
        dev.queue.submit([enc.finish()]);
        await st.mapAsync(GPUMapMode.READ);
        const out = new Uint8Array(st.getMappedRange().slice(0));
        st.unmap();
        st.destroy();
        return out;
      };
      const NW = basesBI.num_words;
      const WS = basesBI.word_size;
      const decBI = (u8: Uint8Array, e: number): bigint => {
        const dv = new DataView(u8.buffer, u8.byteOffset);
        let v = 0n;
        for (let i = 0; i < NW; i++) {
          const limb = BigInt(dv.getUint32((e * NW + i) * 4, true));
          v |= limb << BigInt(WS * i);
        }
        return v;
      };
      const decPK = (u8: Uint8Array, e: number): bigint => {
        let v = 0n;
        for (let b = 31; b >= 0; b--) v = (v << 8n) | BigInt(u8[e * 32 + b]);
        return v;
      };
      const biX = await readBuf(basesBI.point_x_sb, 4 * NW * 4);
      const pkX = await readBuf(basesPK.point_x_sb, 4 * 32);
      const biY = await readBuf(basesBI.point_y_sb, 4 * NW * 4);
      const pkY = await readBuf(basesPK.point_y_sb, 4 * 32);
      for (let e = 0; e < 3; e++) {
        const bx = decBI(biX, e),
          px = decPK(pkX, e),
          by = decBI(biY, e),
          py = decPK(pkY, e);
        log(`[probe] base[${e}] x BI==PK ${bx === px} ; y BI==PK ${by === py}`);
        if (bx !== px) log(`[probe]   x BI=${bx} PK=${px}`);
        if (by !== py) log(`[probe]   y BI=${by} PK=${py}`);
      }
    }

    if (qp.get('dump') === '1') (globalThis as unknown as { __msm_dump?: boolean }).__msm_dump = true;

    // ?v2=1 enables the third path (use_v2_pair_tree). ?fused=0 disables
    // the legacy packed-fused path so the harness reports just baseline
    // vs v2 (useful for sizing N when fused alone isn't the comparand).
    const runV2 = qp.get('v2') === '1';
    const runFused = qp.get('fused') !== '0';

    log('[e2e] running BASELINE (fused_revcarry=false, BigInt bases)…');
    rc.postProgress({ kind: 'phase', phase: 'baseline_start' });
    const base = await runPath(ctx, basesBI, scalars, 'baseline', reps);
    const baseMed = median(base.ms);
    log(`[e2e] baseline median ${baseMed.toFixed(2)} ms  samples=[${base.ms.map(x => x.toFixed(1)).join(',')}]`);
    rc.postProgress({ kind: 'phase', phase: 'baseline_done', median_ms: baseMed });

    let fused: { ms: number[]; xy: { x: bigint; y: bigint } } | null = null;
    let fusedMed = 0;
    if (runFused) {
      log('[e2e] running FUSED (fused_revcarry=true, packed bases)…');
      rc.postProgress({ kind: 'phase', phase: 'fused_start' });
      fused = await runPath(ctx, basesPK, scalars, 'fused', reps);
      fusedMed = median(fused.ms);
      log(`[e2e] fused median ${fusedMed.toFixed(2)} ms  samples=[${fused.ms.map(x => x.toFixed(1)).join(',')}]`);
    }

    let v2: { ms: number[]; xy: { x: bigint; y: bigint } } | null = null;
    let v2Med = 0;
    if (runV2) {
      log('[e2e] running V2 (use_v2_pair_tree=true, packed bases)…');
      rc.postProgress({ kind: 'phase', phase: 'v2_start' });
      v2 = await runPath(ctx, basesPK, scalars, 'v2', reps);
      v2Med = median(v2.ms);
      log(`[e2e] v2 median ${v2Med.toFixed(2)} ms  samples=[${v2.ms.map(x => x.toFixed(1)).join(',')}]`);
      rc.postProgress({ kind: 'phase', phase: 'v2_done', median_ms: v2Med });
    }

    const fusedSane = fused !== null && base.xy.x === fused.xy.x && base.xy.y === fused.xy.y;
    const v2Sane = v2 !== null && base.xy.x === v2.xy.x && base.xy.y === v2.xy.y;
    if (fused) log(`[e2e] correctness (baseline==fused): ${fusedSane}`);
    if (v2) log(`[e2e] correctness (baseline==v2): ${v2Sane}`);
    if (refAff) {
      const baseOk = base.xy.x === refAff.x && base.xy.y === refAff.y;
      log(`[e2e] vs CPU oracle: baseline=${baseOk}`);
      if (fused) log(`[e2e] vs CPU oracle: fused=${fused.xy.x === refAff.x && fused.xy.y === refAff.y}`);
      if (v2) log(`[e2e] vs CPU oracle: v2=${v2.xy.x === refAff.x && v2.xy.y === refAff.y}`);
      log(`[e2e]   oracle.xy   = (${refAff.x}, ${refAff.y})`);
    }
    log(`[e2e]   baseline.xy = (${base.xy.x}, ${base.xy.y})`);
    if (fused) log(`[e2e]   fused.xy    = (${fused.xy.x}, ${fused.xy.y})`);
    if (v2) log(`[e2e]   v2.xy       = (${v2.xy.x}, ${v2.xy.y})`);
    const fusedSpeedup = fused ? baseMed / fusedMed : 0;
    const v2Speedup = v2 ? baseMed / v2Med : 0;
    log(
      `[e2e] RESULT: baseline ${baseMed.toFixed(2)} ms` +
        (fused ? `  fused ${fusedMed.toFixed(2)} ms (x${fusedSpeedup.toFixed(3)})` : '') +
        (v2 ? `  v2 ${v2Med.toFixed(2)} ms (x${v2Speedup.toFixed(3)})` : '') +
        `  fusedSane=${fusedSane} v2Sane=${v2Sane}`,
    );

    await rc.postResults({
      state: 'done',
      params: { logN, n, reps, fused: runFused, v2: runV2 },
      results: [
        {
          name: 'msm_e2e',
          logN,
          n,
          reps,
          baseline_median_ms: baseMed,
          fused_median_ms: fusedMed,
          v2_median_ms: v2Med,
          baseline_samples_ms: base.ms,
          fused_samples_ms: fused?.ms ?? [],
          v2_samples_ms: v2?.ms ?? [],
          fused_speedup: fusedSpeedup,
          v2_speedup: v2Speedup,
          fused_sane: fusedSane,
          v2_sane: v2Sane,
          baseline_xy: { x: base.xy.x.toString(), y: base.xy.y.toString() },
          fused_xy: fused ? { x: fused.xy.x.toString(), y: fused.xy.y.toString() } : null,
          v2_xy: v2 ? { x: v2.xy.x.toString(), y: v2.xy.y.toString() } : null,
        },
      ],
    });
    log('[e2e] posted results — DONE');
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    log(`[e2e] ERROR: ${msg}`);
    await rc.postResults({ state: 'error', error: msg }).catch(() => {});
  }
}

main();
