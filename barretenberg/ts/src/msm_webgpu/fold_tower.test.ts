// Standalone unit test for the fold-tower reduction reference (GROUPED_REDUCE_PLAN.md).
// Run: node --loader ts-node/esm src/msm_webgpu/fold_tower.test.ts
import {
  buildFoldTower,
  referenceFoldLevel,
  referenceFoldReduce,
  referenceFoldTail,
  directWeightedSum,
  towerAddCounts,
  type RefPoint,
} from './fold_tower.js';
import {
  addBn254Jacobian,
  toAffineBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  type Bn254Jacobian,
} from './cuzk/bn254.js';

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
};

// Distinct non-trivial points: P_{i+1} = P_i + G1 (value structure is
// irrelevant to the reduction; the weights are what the tests pin down).
const G1: Bn254Jacobian = { x: 1n, y: 2n, z: 1n };
const POOL_SIZE = 4096 + 8;
const pool: Bn254Jacobian[] = [];
{
  let p = G1;
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(p);
    p = addBn254Jacobian(p, G1);
  }
}

// Deterministic LCG (seed convention 12345) for density masks.
let lcg = 12345 >>> 0;
const rnd = (): number => {
  lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
  return lcg / 2 ** 32;
};

const mkBuckets = (B: number, density: number, offset = 0): RefPoint[] =>
  Array.from({ length: B }, (_, j) => (rnd() < density ? pool[(offset + j) % POOL_SIZE] : null));

const eq = (a: Bn254Jacobian, b: Bn254Jacobian, label: string): void => {
  const aa = toAffineBn254Jacobian(a);
  const bb = toAffineBn254Jacobian(b);
  check(
    aa.infinity === bb.infinity && aa.x === bb.x && aa.y === bb.y,
    `${label}: ${JSON.stringify({ a: { x: aa.x.toString(16), inf: aa.infinity }, b: { x: bb.x.toString(16), inf: bb.infinity } })}`,
  );
};

// --- 1. tower-vs-oracle across strides × densities (default tower) ---------
for (const stride of [1, 2, 4, 16, 64, 128, 1024]) {
  for (const density of [0, 0.07, 0.5, 1]) {
    const buckets = mkBuckets(stride, density);
    const tower = buildFoldTower(stride);
    eq(
      referenceFoldReduce(buckets, tower),
      directWeightedSum(buckets),
      `stride=${stride} density=${density} default tower`,
    );
  }
}
// stride 4096 (the c=13 production case) — densities 1 and sparse
for (const density of [0.07, 1]) {
  const buckets = mkBuckets(4096, density);
  const tower = buildFoldTower(4096);
  check(
    tower.levels.length === 3 &&
      tower.levels.map(l => l.M).join(',') === '8,8,4' &&
      tower.tailLen === 16 &&
      tower.scales.join(',') === '512,64,16',
    `tower(4096) shape: ${JSON.stringify(tower)}`,
  );
  eq(referenceFoldReduce(buckets, tower), directWeightedSum(buckets), `stride=4096 density=${density}`);
}

// --- 2. mTower variants (incl. M=2 first level + in-place clamping) --------
for (const mTower of [[2], [4, 4], [16, 16], [2, 8, 8], [2, 2, 2, 2, 2]]) {
  const stride = 1024;
  const tower = buildFoldTower(stride, { mTower });
  check(tower.levels.length <= 3, `mTower=${mTower} respects maxLevels=3 (got ${tower.levels.length})`);
  for (const [l, lv] of tower.levels.entries()) {
    check(lv.M >= 2 + l, `mTower=${mTower} level ${l} respects in-place floor (M=${lv.M})`);
    check(lv.B === lv.G * lv.M, `mTower=${mTower} level ${l} exact division (pow2 stride)`);
  }
  const buckets = mkBuckets(stride, 0.6);
  eq(referenceFoldReduce(buckets, tower), directWeightedSum(buckets), `stride=${stride} mTower=${mTower}`);
}

// --- 3. edge cases ----------------------------------------------------------
{
  const B = 256;
  const tower = buildFoldTower(B);
  const empty: RefPoint[] = new Array(B).fill(null);
  eq(referenceFoldReduce(empty, tower), BN254_JACOBIAN_ZERO, 'all-empty window');

  for (const j of [0, 1, B - 2, B - 1]) {
    const one: RefPoint[] = new Array(B).fill(null);
    one[j] = pool[7];
    eq(referenceFoldReduce(one, tower), directWeightedSum(one), `single bucket at j=${j}`);
  }

  // Equal points in different buckets (exercises the doubling path inside
  // running/alg chains).
  const dup: RefPoint[] = new Array(B).fill(null);
  dup[3] = pool[42];
  dup[200] = pool[42];
  dup[201] = pool[42];
  eq(referenceFoldReduce(dup, tower), directWeightedSum(dup), 'duplicate points across buckets');
}

// --- 4. single-level identity on a ragged (non-pow2) array ------------------
{
  const B = 100;
  const G = 8;
  const buckets = mkBuckets(B, 0.8);
  const { R, Lam } = referenceFoldLevel(buckets, [], G);
  // S = WS(V)+PS(V) must equal G·PS(Λ) + [WS(R)+PS(R)] — i.e. tail over R with
  // Λ as a scale-G stream.
  eq(referenceFoldTail(R, [Lam], [G]), directWeightedSum(buckets), 'ragged B=100 G=8 single level');
}

// --- 4b. width-adaptive default towers --------------------------------------
{
  // N = 2^17 shape (stride 4096, NW = 20, sat 2560): the sat/2 hysteresis
  // keeps M = 8 at L0 (NC = 10240) and L1 (NC = 1280 ≥ 1280); L2 starves,
  // takes the in-place floor 4 — exactly the validated [8,8,4].
  const t17 = buildFoldTower(4096, { tailMax: 32, numWindows: 20, satWidth: 2560 });
  check(t17.levels.map(l => l.M).join(',') === '8,8,4', `adaptive 4096/NW20: ${t17.levels.map(l => l.M)}`);
  // Small-N shape (stride 128, NW = 32): every level starves → M = 2 at L0
  // (one real add per column, maximum width); L1 takes the in-place floor.
  const tSmall = buildFoldTower(128, { tailMax: 32, numWindows: 32, satWidth: 2560 });
  check(tSmall.levels[0].M === 2, `adaptive 128/NW32 L0 M: ${tSmall.levels[0].M}`);
  for (const [l, lv] of tSmall.levels.entries()) {
    check(lv.M >= 2 + l, `adaptive 128 level ${l} in-place floor (M=${lv.M})`);
  }
  for (const [stride, nw] of [
    [4096, 20],
    [2048, 22],
    [512, 26],
    [128, 32],
    [64, 36],
  ] as const) {
    const tower = buildFoldTower(stride, { tailMax: 32, numWindows: nw, satWidth: 2560 });
    check(tower.levels.length <= 3, `adaptive ${stride} depth ${tower.levels.length}`);
    const buckets = mkBuckets(stride, 0.5);
    eq(referenceFoldReduce(buckets, tower), directWeightedSum(buckets), `adaptive stride=${stride} NW=${nw}`);
  }
}

// --- 5. cost model sanity ----------------------------------------------------
{
  const t = buildFoldTower(4096);
  const { perLevel, total } = towerAddCounts(t);
  check(perLevel[0] === 2 * 4096 && perLevel[1] === 3 * 512 && perLevel[2] === 4 * 64, `addCounts perLevel=${perLevel}`);
  check(total < 2.5 * 4096, `addCounts total=${total} stays ~2.4/bucket`);
}

if (failures === 0) {
  console.log('fold_tower.test.ts: ALL PASS');
} else {
  console.error(`fold_tower.test.ts: ${failures} FAILURES`);
  process.exit(1);
}
