#!/usr/bin/env node
// Deterministic peak-GPU-memory accounting for MsmV2 (stream-walker lineage).
//
// `MsmV2Pool.statsBytes()` is a pure sum of `GPUBuffer.size`, and every buffer
// size is a closed-form function of (n, c, numBatches) fixed at `prepare()`
// time — no GPU, no device, no measurement noise. This script replicates the
// exact `ensureScratch` sizing formulas from msm_v2.ts so the peak-memory map
// and the numBatches lever curve can be regenerated and audited without a GPU.
//
// Usage: node dev/msm-webgpu/scripts/mem-accounting.mjs [logn ...]   (default 16 17 18 20)

const PG = 2;
const NUMBITS = 254;
const PLANNER_TPB = 256;
const STREAM_T = 8192;
const STREAM_S = 8;
const RADIX_TILE = 2048;
const WGI = 128;
const DEFAULT_L0_LOG = 1;
const OVERSIZE = 1.3; // slow-path pad; only inflates capMAXC + (dead) stub buffers

const pickCTable = { 7:4,8:4,9:5,10:8,11:8,12:8,13:8,14:8,15:10,16:13,17:13,18:15,19:15,20:15 };
const pickC = logN => pickCTable[logN] ?? 13;
const pickReduceWg = c => (c <= 9 ? 32 : c <= 12 ? 64 : 128);

const sbuf = b => Math.max(b, 4);
const soa = M => 2 * PG * M * 4 * 4; // = 64*M

function maxc(stride, reduceWg) {
  const C0 = Math.max(1, Math.min(DEFAULT_L0_LOG, Math.log2(stride) - 1));
  const L0 = 1 << C0;
  const D = stride / L0;
  const ppw = [];
  for (let l = L0 - 1; l >= 1; l--) ppw.push(D);
  for (let L1 = L0; L1 < stride; L1 *= 2) ppw.push(stride / (2 * L1));
  for (let j = 0; j < C0; j++) ppw.push(D - 1);
  for (let L1 = 2 * L0; L1 < stride; L1 *= 2) ppw.push(stride / L1 - 1);
  for (let mm = 1; mm < stride; mm *= 2) ppw.push(stride / (2 * mm));
  return Math.max(1, ...ppw.map(p => Math.ceil(p / reduceWg)));
}

function model(logN, nbOverride) {
  const n = 2 ** logN;
  const c = pickC(logN);
  const reduceWg = pickReduceWg(c);
  const numWindows = Math.ceil(NUMBITS / c);
  const BW = Math.ceil((2 ** (c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
  const bTotal = numWindows * BW;
  const stride = 2 ** (c - 1);
  const redM = numWindows * stride;
  const numRadixTiles = Math.ceil(bTotal / RADIX_TILE);
  const MAXC = Math.ceil(maxc(stride, reduceWg) * OVERSIZE);

  // numBatches: forced up until both wgFits and (default budget) memFits.
  const wgFits = nb => Math.ceil((Math.ceil(numWindows / nb) * n) / WGI) < 65000;
  let nb = 1;
  while (nb < numWindows && !wgFits(nb)) nb++;
  if (nbOverride) nb = nbOverride;
  const batchWindows = Math.ceil(numWindows / nb);
  const batchSlots = batchWindows * n;
  const batchBuckets = batchWindows * BW;

  const B = {};
  // batch-dependent (shrink with nb)
  B.l0IdxBuf = sbuf((batchSlots + 3) * 4);
  B.bucketAndSignBuf = sbuf(batchSlots * 4);
  B.valIdxBuf = sbuf(batchSlots * 4);
  B.rowPtrBuf = sbuf(batchWindows * (BW + 1) * 4);
  B.countsBufs = 2 * sbuf(batchBuckets * 4);
  B.offsetsBufs = 2 * sbuf(batchBuckets * 4);
  // fixed
  B.bucketResultBuf = soa(bTotal);
  B.scalarsRawBuf = sbuf(n * 32);
  B.redBuf = soa(redM);
  B.isPresentBuf = sbuf(redM * 4);
  B.reducePrefScratch = sbuf(numWindows * reduceWg * MAXC * 2 * 16);
  B.planMeta = sbuf((3 * numWindows + 6) * 4);
  B.streamPlannerMeta = Math.max((20 + STREAM_T) * 4, 256);
  B.size1BucketList = sbuf(bTotal * 2 * 4);
  B.denseBucketList = sbuf(bTotal * 4);
  B.denseCountList = sbuf(bTotal * 4);
  B.sortedBucketList = sbuf(bTotal * 4);
  B.sortedCountList = sbuf(bTotal * 4);
  B.cumulativeAdds = sbuf(bTotal * 4);
  B.bucketHead = sbuf(bTotal * 4);
  B.radixHist = sbuf(numRadixTiles * 256 * 4);
  B.wgCuts = sbuf(32 * 2 * 4);
  B.threadCuts = sbuf(STREAM_T * 2 * 4);
  B.taskCuts = sbuf(STREAM_T * (STREAM_S + 1) * 2 * 4);
  B.walkerPartials = soa(2 * STREAM_T * STREAM_S);
  B.walkerPartialDest = sbuf(2 * STREAM_T * STREAM_S * 4);
  B.walkerNodesSlot = sbuf(2 * STREAM_T * STREAM_S * 4);
  B.walkerNodesNext = sbuf(2 * STREAM_T * STREAM_S * 4);
  B.walkerNodeCounter = 4;
  // 4-byte stubs (pair-tree V2 + legacy stream-accum, no longer dispatched)
  B.stubs = 4 * 13; // bufA,bufB,2x pairRing,2x scatterRing,2x carryRing,prefScratch,queueBuf,partialsBuf,partialBucketsList,accBuf,streamPrefScratch

  const scratch = Object.values(B).reduce((a, x) => a + x, 0);
  const srs = 2 * n * 32; // poolX + poolY
  return { n, c, numWindows, BW, bTotal, redM, nb, batchWindows, B, scratch, srs, total: scratch + srs };
}

const MB = b => (b / 1048576).toFixed(1);
const args = process.argv.slice(2).map(Number).filter(x => x >= 7 && x <= 20);
const logns = args.length ? args : [16, 17, 18, 20];

for (const logN of logns) {
  const m = model(logN);
  console.log(`\n=== logn=${logN}  (n=2^${logN}, c=${m.c}, windows=${m.numWindows}, BW=${m.BW}, bTotal=${m.bTotal}, default nb=${m.nb}) ===`);
  const rows = Object.entries(m.B).filter(([k]) => k !== 'stubs').map(([k, v]) => [k, v]).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of rows) if (v >= 256 * 1024) console.log(`  ${k.padEnd(20)} ${MB(v).padStart(7)} MB`);
  console.log(`  ${'(buffers <256KB + stubs)'.padEnd(20)} ${MB(m.scratch - rows.filter(([,v]) => v >= 256*1024).reduce((a,[,v])=>a+v,0)).padStart(7)} MB`);
  console.log(`  ${'— per-MSM scratch'.padEnd(20)} ${MB(m.scratch).padStart(7)} MB`);
  console.log(`  ${'— pool SRS (poolX+Y)'.padEnd(20)} ${MB(m.srs).padStart(7)} MB`);
  console.log(`  ${'= TOTAL'.padEnd(20)} ${MB(m.total).padStart(7)} MB`);

  // numBatches lever curve: scratch + total as nb rises.
  const curve = [];
  for (let nb = m.nb; nb <= m.numWindows; nb++) {
    const mm = model(logN, nb);
    curve.push(`nb=${nb}:${MB(mm.scratch)}/${MB(mm.total)}`);
  }
  console.log(`  lever (scratch/total MB): ${curve.join('  ')}`);
}
