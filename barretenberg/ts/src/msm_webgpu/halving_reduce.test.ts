// Standalone unit test for the halving reduction (Mitschabaude) reference,
// schedule, and in-place arena simulation.
// Run: node --loader ts-node/esm src/msm_webgpu/halving_reduce.test.ts
import {
  buildHalvingSchedule,
  referenceHalvingReduce,
  simulateHalvingArena,
  directWeightedSum,
  arenaOffset,
  carryScale,
  type RefPoint,
} from './halving_reduce.js';
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

let lcg = 12345 >>> 0;
const rnd = (): number => {
  lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
  return lcg / 2 ** 32;
};
const mkBuckets = (B: number, density: number): RefPoint[] =>
  Array.from({ length: B }, (_, j) => (rnd() < density ? pool[j % POOL_SIZE] : null));

const eq = (a: Bn254Jacobian, b: Bn254Jacobian, label: string): void => {
  const aa = toAffineBn254Jacobian(a);
  const bb = toAffineBn254Jacobian(b);
  check(
    aa.infinity === bb.infinity && aa.x === bb.x && aa.y === bb.y,
    `${label}: ${JSON.stringify({ a: { x: aa.x.toString(16), inf: aa.infinity }, b: { x: bb.x.toString(16), inf: bb.infinity } })}`,
  );
};

// --- 1. recursive reference vs direct oracle, strides × densities -----------
for (const B of [1, 2, 4, 8, 64, 256, 1024, 4096]) {
  for (const density of [0, 0.07, 0.5, 1]) {
    const buckets = mkBuckets(B, density);
    eq(referenceHalvingReduce(buckets), directWeightedSum(buckets), `ref B=${B} density=${density}`);
  }
}

// --- 2. arena simulation (exact kernel offsets) vs oracle, across schedules -
for (const B of [2, 4, 8, 64, 256, 1024, 4096]) {
  for (const density of [0, 0.07, 0.5, 1]) {
    for (const [nw, sat, cap, floor] of [
      [20, 2560, 256, undefined],
      [32, 2560, 256, undefined],
      [20, 100, 64, undefined],
      [20, 1_000_000, 256, undefined],
      [20, 2560, 128, 1],
      [20, 2560, 64, 1],
      [20, 2560, 256, 1],
    ] as const) {
      const sched = buildHalvingSchedule(B, nw, { satWidth: sat, finisherCap: cap, ba4Floor: floor });
      const buckets = mkBuckets(B, density);
      const { sum } = simulateHalvingArena(buckets, sched);
      eq(sum, directWeightedSum(buckets), `arena B=${B} d=${density} nw=${nw} sat=${sat} cap=${cap}`);
    }
  }
}

// --- 3. schedule shape at production geometry (B=4096, NW=20, sat=2560) -----
{
  const s = buildHalvingSchedule(4096, 20, { satWidth: 2560, finisherCap: 256 });
  const modes = s.depths.map(x => `${x.d}:${x.mode}:${x.pairsPerWindow * 20}`);
  // pairs: d0 40960, d1 40960, d2 30720, d3 20480 → ba8 (/8 ≥ 2560);
  // d4 12800 → ba4 (/4 = 3200 ≥ 2560); d5 7680, d6 4480 → jac;
  // d7 entry: 8 arrays × 32 = 256 ≤ cap → finisher.
  check(
    modes.join(' ') === '0:ba8:40960 1:ba8:40960 2:ba8:30720 3:ba8:20480 4:ba4:12800 5:jac:7680 6:jac:4480',
    `schedule modes: ${modes.join(' ')}`,
  );
  check(s.finisherDepth === 7 && s.finisherValues === 256 && s.finisherInputsJac === true, `finisher: ${JSON.stringify(s)}`);
  // Modes are monotone: ba8* ba4* jac*.
  const order = { ba8: 0, ba4: 1, jac: 2 } as const;
  for (let i = 1; i < s.depths.length; i++) {
    check(order[s.depths[i].mode] >= order[s.depths[i - 1].mode], `monotone modes at depth ${i}`);
  }
}

// --- 4. small-N schedules ----------------------------------------------------
{
  // B = 512 (logn ≈ 12-13): every wide depth is below the batch-4 floor →
  // wide Jacobian, one pair per thread, maximum width.
  const s512 = buildHalvingSchedule(512, 26, { satWidth: 2560, finisherCap: 256 });
  check(s512.depths.length >= 1 && s512.depths.every(x => x.mode === 'jac'), `512 all-jac: ${JSON.stringify(s512.depths)}`);
  // B = 128: the whole window fits the finisher budget — zero wide passes,
  // the cooperative pass does everything.
  const s128 = buildHalvingSchedule(128, 32, { satWidth: 2560, finisherCap: 256 });
  check(s128.depths.length === 0 && s128.finisherDepth === 0 && s128.finisherValues === 128, `128 finisher-only: ${JSON.stringify(s128)}`);
  check(s128.finisherInputsJac === false, `128 finisher inputs affine`);
}

// --- 5. arena geometry invariants -------------------------------------------
{
  const B = 4096;
  // Carry homes are disjoint, in-bounds, and equal to W's surviving top half.
  for (let j = 1; j <= Math.log2(B); j++) {
    check(arenaOffset(B, j) === B >> j, `offset carry_${j}`);
    check(carryScale(B, j) === B >> j, `scale carry_${j}`);
  }
}

if (failures === 0) {
  console.log('halving_reduce.test.ts: ALL PASS');
} else {
  console.error(`halving_reduce.test.ts: ${failures} FAILURES`);
  process.exit(1);
}
