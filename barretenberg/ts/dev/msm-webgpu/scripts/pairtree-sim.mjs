#!/usr/bin/env node
// Host-side simulator of the MsmV2 affine pair-tree, for quantifying how much
// of the GPU fused-pass dispatch work is REAL vs over-provisioned padding when
// the scalars are STRUCTURED (the translator range-constraints / masking-shaped
// columns) rather than uniform-dense.
//
// Why this matters (see src/msm_webgpu/docs/MSM_IMPL.md §7.3): the per-MSM prepare
// runs a GPU bucket-histogram + readback so the host can size each pair-tree
// level exactly. That round-trip is the source of the same-N prepare
// serialization (the dominant host-overhead tax). A *static* plan removes the
// round-trip but must size levels from a closed form, which over-provisions —
// especially the deep tail. This tool measures the exact per-level pair counts
// for realistic chonk scalar shapes so the over-provision (and thus the L3
// headroom) is a measured number, not an estimate. It also doubles as the
// safety oracle: a candidate static bound is SAFE iff it dominates `actual` at
// every level for every distribution here (extend with adversarial shapes).
//
// Pure reimplementation of msm_v2.ts buildInitCounts/planLevel/bucketSplit —
// kept byte-identical to the Booth recode there (verified against the source).
//
// Usage: node pairtree-sim.mjs            (runs the built-in chonk shape matrix)

const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n; // BN254 Fr

// pickC mirror (msm_v2.ts:pickC / webgpu_msm_hook.cpp:pick_c_for_distribution).
function pickC(n) {
  const k = Math.ceil(Math.log2(n));
  if (k <= 8) return 4;
  if (k === 9) return 5;
  if (k <= 14) return 8;
  if (k === 15) return 10;
  if (k <= 17) return 13;
  return 15;
}

// ---- exact ports of the pure msm_v2 functions -----------------------------
function buildInitCounts(scalars, c, numWindows, BW) {
  const counts = new Uint32Array(numWindows * BW);
  for (const s of scalars) {
    let lookback = 0;
    for (let w = 0; w < numWindows; w++) {
      const lo = w * c;
      const winBits = Number((s >> BigInt(lo)) & ((1n << BigInt(c)) - 1n));
      const raw = (winBits << 1) | lookback;
      const neg = (raw >>> c) & 1;
      const negMask = neg ? 0xffffffff : 0;
      const valMask = (1 << c) - 1;
      const encode = (raw + 1) >>> 1;
      const bucket = (((encode - neg) >>> 0) ^ negMask) & valMask;
      counts[w * BW + bucket]++;
      lookback = Number((s >> BigInt(lo + c - 1)) & 1n);
    }
  }
  return counts;
}
function bucketSplit(n) {
  const pc = n >>> 1;
  const cf = n === 1 ? 0 : n & 1;
  return { pc, cf, nc: pc + cf };
}
// One pair-tree level. S = pairs per batched-inversion block (msm_v2 uses a
// per-instance S; 8 is the representative value). Returns total real pairs this
// level, the per-window-max pairBlocks (what the static dispatch must cover),
// and the next-level counts. Bucket 0 (zero digit) is skipped, matching the GPU.
function planLevel(counts, numWindows, BW, S) {
  const next = new Uint32Array(numWindows * BW);
  let totalPairs = 0;
  let maxPairsPerWindow = 0;
  let sumPairBlocksPerWindow = 0; // per-window-sized dispatch (each window to its own load)
  let activeBuckets = 0;
  for (let w = 0; w < numWindows; w++) {
    let pairs = 0;
    for (let bl = 1; bl < BW; bl++) {
      // skip bucket 0
      const k = counts[w * BW + bl];
      if (k > 0) activeBuckets++;
      const { pc, nc } = bucketSplit(k);
      pairs += pc;
      next[w * BW + bl] = nc;
    }
    totalPairs += pairs;
    maxPairsPerWindow = Math.max(maxPairsPerWindow, pairs);
    if (pairs > 0) sumPairBlocksPerWindow += Math.ceil(pairs / S);
  }
  return {
    totalPairs,
    pairBlocksPerWindow: Math.ceil(maxPairsPerWindow / S),
    sumPairBlocksPerWindow,
    next,
    activeBuckets,
  };
}

function runPairTree(scalars, n, S = 8) {
  const c = pickC(n);
  const numWindows = Math.ceil(254 / c);
  const BW = 1 << (c - 1);
  let counts = buildInitCounts(scalars, c, numWindows, BW);
  const levels = [];
  for (let lv = 0; lv < 40; lv++) {
    const { totalPairs, pairBlocksPerWindow, sumPairBlocksPerWindow, next, activeBuckets } = planLevel(
      counts,
      numWindows,
      BW,
      S,
    );
    if (totalPairs === 0) break;
    // dispatched fused-pass work for this level = numWindows × pairBlocksPerWindow (× S pairs/block)
    levels.push({
      lv,
      totalPairs,
      pairBlocksPerWindow,
      dispatchedPairs: numWindows * pairBlocksPerWindow * S,
      perWindowDispatchedPairs: sumPairBlocksPerWindow * S, // if each window sized to its own load
      activeBuckets,
    });
    counts = next;
  }
  return { c, numWindows, BW, levels };
}

// ---- realistic chonk scalar shapes ----------------------------------------
// Deterministic PRNG (no Math.random — keeps the matrix reproducible).
function makeRng(seed) {
  let x = BigInt(seed) || 1n;
  return () => {
    x ^= x << 13n;
    x &= (1n << 64n) - 1n;
    x ^= x >> 7n;
    x ^= x << 17n;
    x &= (1n << 64n) - 1n;
    return x;
  };
}
function randFr(rng) {
  // 4×64-bit then reduce mod r
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 64n) | rng();
  return v % R;
}
function randSmall(rng, bits) {
  return rng() & ((1n << BigInt(bits)) - 1n);
}

// dense: every scalar uniform mod r (wire/Z_PERM-like full_dense).
function shapeDense(n, rng) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = randFr(rng);
  return a;
}
// tail-pinned-254 (translator range constraint w/ ZK masking): ~13-bit values,
// plus `maskRows` full-width rows (the masking tail that pins maxbits=254).
function shapeTailPinned(n, rng, smallBits = 13, maskRows = 564) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = randSmall(rng, smallBits);
  for (let i = 0; i < maskRows && i < n; i++) a[(i * 233) % n] = randFr(rng);
  return a;
}
// sparse: mostly zero, ~10% nonzero full-width.
function shapeSparse(n, rng, nzFrac = 0.1) {
  const a = new Array(n).fill(0n);
  const nz = Math.floor(n * nzFrac);
  for (let i = 0; i < nz; i++) a[(i * 97 + 3) % n] = randFr(rng);
  return a;
}

function summarize(label, n, res) {
  const totalDispatched = res.levels.reduce((s, l) => s + l.dispatchedPairs, 0);
  const totalReal = res.levels.reduce((s, l) => s + l.totalPairs, 0);
  const overProv = totalReal > 0 ? totalDispatched / totalReal : 0;
  // "tail" = levels past the knee (where dispatched >> real). Count levels whose
  // real pairs are < 5% of level 0's real pairs but still get a dispatch slot.
  const l0 = res.levels[0]?.totalPairs ?? 1;
  const tailLevels = res.levels.filter(l => l.totalPairs < 0.05 * l0).length;
  console.log(`\n■ ${label}  n=${n} c=${res.c} windows=${res.numWindows} levels=${res.levels.length}`);
  console.log('  lvl  realPairs  pairBlk/w  dispatched(pairs)  active%  real/dispatched');
  for (const l of res.levels) {
    const eff = l.dispatchedPairs > 0 ? l.totalPairs / l.dispatchedPairs : 0;
    const activePct = (l.activeBuckets / (res.numWindows * (res.BW - 1))) * 100;
    console.log(
      `  ${String(l.lv).padStart(3)}  ${String(l.totalPairs).padStart(9)}  ${String(l.pairBlocksPerWindow).padStart(9)}  ` +
        `${String(l.dispatchedPairs).padStart(17)}  ${activePct.toFixed(1).padStart(6)}  ${(eff * 100).toFixed(1).padStart(6)}%`,
    );
  }
  const totalPerWindow = res.levels.reduce((s, l) => s + l.perWindowDispatchedPairs, 0);
  const perWindowSaving = totalDispatched > 0 ? 1 - totalPerWindow / totalDispatched : 0;
  console.log(
    `  => total real pairs=${totalReal}  dispatched(global-max)=${totalDispatched}  over-provision=${overProv.toFixed(2)}×  tail(<5% L0)=${tailLevels} levels`,
  );
  console.log(
    `     per-window-sized dispatch=${totalPerWindow}  => would cut dispatched work by ${(perWindowSaving * 100).toFixed(0)}% (L3 / per-window lever)`,
  );
  return {
    totalReal,
    totalDispatched,
    totalPerWindow,
    overProv,
    perWindowSaving,
    tailLevels,
    levels: res.levels.length,
  };
}

// ---- run the chonk shape matrix -------------------------------------------
console.log('Pair-tree dispatch simulation — REAL vs over-provisioned work by scalar shape');
console.log('(dispatched = numWindows × max-per-window pairBlocks × S; the histogram-free static');
console.log(' plan must size to a closed form ≥ these per-level maxima — over-provision is the L3 cost.)');

const rng = makeRng(0xc0ffeen);
const N_WIRE = 88899; // largest wire / Z_PERM in transfer_1 flow
const N_TRANS = 131071; // translator range constraints (2^17-1)

const out = [];
out.push([
  'dense   W/Z_PERM @88899',
  summarize('dense  (wire / Z_PERM, full_dense)', N_WIRE, runPairTree(shapeDense(N_WIRE, rng), N_WIRE)),
]);
out.push([
  'tailpin RANGE @131071',
  summarize(
    'tail-pinned-254 (translator range-constraint + 564 mask rows)',
    N_TRANS,
    runPairTree(shapeTailPinned(N_TRANS, rng), N_TRANS),
  ),
]);
out.push([
  'MASKED RANGE @131071',
  summarize(
    'MASKED translator range (additive R densifies → uniform full-width)',
    N_TRANS,
    runPairTree(shapeDense(N_TRANS, rng), N_TRANS),
  ),
]);
out.push([
  'sparse  @131071',
  summarize('sparse (~10% nonzero)', N_TRANS, runPairTree(shapeSparse(N_TRANS, rng), N_TRANS)),
]);

console.log('\n================= summary =================');
console.log(
  'shape'.padEnd(28),
  'levels'.padStart(7),
  'realPairs'.padStart(11),
  'dispatched'.padStart(11),
  'overProv'.padStart(9),
  'perWinCut'.padStart(10),
);
for (const [label, s] of out)
  console.log(
    label.padEnd(28),
    String(s.levels).padStart(7),
    String(s.totalReal).padStart(11),
    String(s.totalDispatched).padStart(11),
    (s.overProv.toFixed(2) + '×').padStart(9),
    ((s.perWindowSaving * 100).toFixed(0) + '%').padStart(10),
  );
console.log('\nReading: a high over-provision × and many tail levels for the structured (tail-pinned)');
console.log('shape vs the dense shape is the headroom a tail-tightened static plan (L3) reclaims —');
console.log('and is exactly why structured columns pay a disproportionate same-N prepare tax today.');
