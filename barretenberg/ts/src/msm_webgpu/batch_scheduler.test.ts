// Unit test for the multi-MSM batch scheduler (MULTI_MSM_PLAN.md rollout step 1).
// Pure / offline: verifies the host pack model without a GPU. The defining
// invariant is batch-of-1 ≡ single-MSM byte-identical — at K=1 every offset is 0,
// the WindowDesc table equals msm_v2 prepare()'s uniform fill, and the footprint
// equals the single-MSM budget gate's estimateMem(1).
import { describe, expect, test } from '@jest/globals';
import { arenaColourSizes, pickReduceWg } from './msm_v2.js';
import {
  batchFootprintBytes,
  buildUniformWindowDesc,
  computeGeom,
  DEFAULT_SS,
  DEFAULT_ST,
  packByBudget,
  planBatch,
  type MsmGeom,
} from './batch_scheduler.js';

const MiB = 1 << 20;
const SRS_2P17 = 2 * (1 << 17) * 32; // poolX + poolY at srsN = 2^17 (= 8 MiB)

// ── Geometry: a pure function of n, must match the ARENA_LAYOUT.md §3 table
// (traced-to-source exact) and hence msm_v2 create()'s inline derivation.
describe('computeGeom matches the ARENA_LAYOUT §3 geometry table', () => {
  const cases = [
    { logn: 14, c: 8, NW: 32, stride: 128, BW: 256, bTotal: 8192, redM: 4096 },
    { logn: 15, c: 10, NW: 26, stride: 512, BW: 768, bTotal: 19968, redM: 13312 },
    { logn: 16, c: 13, NW: 20, stride: 4096, BW: 4352, bTotal: 87040, redM: 81920 },
    { logn: 17, c: 13, NW: 20, stride: 4096, BW: 4352, bTotal: 87040, redM: 81920 },
  ];
  for (const k of cases) {
    test(`logN=${k.logn}`, () => {
      const g = computeGeom(1 << k.logn);
      expect(g.c).toBe(k.c);
      expect(g.numWindows).toBe(k.NW);
      expect(g.stride).toBe(k.stride);
      expect(g.BW).toBe(k.BW);
      expect(g.bTotal).toBe(k.bTotal);
      expect(g.redM).toBe(k.redM);
      expect(g.windowCs).toEqual(new Array(k.NW).fill(k.c));
      expect(g.scalarBytes).toBe(32 * (1 << k.logn));
      expect(g.windowSumBytes).toBe(k.NW * 64);
      expect(g.reduceWg).toBe(pickReduceWg(k.c));
    });
  }
});

// ── WindowDesc: the uniform fill, byte-identical to prepare() ~2738-2756.
describe('buildUniformWindowDesc reproduces the prepare() uniform rows', () => {
  test('logN=16 (c=13) row layout', () => {
    const g = computeGeom(1 << 16);
    const { rows, reduceOffsets } = buildUniformWindowDesc(g);
    expect(rows.length).toBe(g.numWindows * 8);
    const numCols = Math.ceil((2 ** 12 + 1) / 256) * 256; // 4352
    for (let w = 0; w < g.numWindows; w++) {
      const o = w * 8;
      expect(rows[o + 0]).toBe(13); // window_bits
      expect(rows[o + 1]).toBe(13 * w); // bit_base
      expect(rows[o + 2]).toBe(4096); // num_buckets = 2^(c-1)
      expect(rows[o + 3]).toBe(w * numCols); // work_off
      expect(rows[o + 4]).toBe(w * 4096); // reduce_off (MSM-local, = w·stride)
      expect(rows[o + 5]).toBe(numCols); // num_columns
      expect(rows[o + 6]).toBe(0); // reserved
      expect(rows[o + 7]).toBe(0); // reserved
      expect(reduceOffsets[w]).toBe(w * 4096);
    }
  });
});

// Independent recomputation of the single-MSM budget gate estimateMem(nb=1)
// (msm_v2.ts ~2469) — the authority a batch-of-1 footprint must reproduce.
function estimateMemSingle(g: MsmGeom, sT: number, sS: number, srsBytes: number): number {
  const maxc = Math.ceil(Math.ceil(g.stride / 2) / g.reduceWg);
  const reducePrefBytes = g.numWindows * g.reduceWg * maxc * 2 * 16;
  const bw = g.numWindows; // nb = 1
  const arena = arenaColourSizes({
    sT,
    sS,
    sBTotal: g.bTotal,
    sRadixTiles: Math.ceil(g.bTotal / 2048),
    batchSlots: bw * g.n,
    redM: g.redM,
    rowPtrLen: bw * (g.BW + 1),
    reducePrefBytes,
    scalarsBytes: 32 * g.n,
    l0Slots: bw * g.n + 3,
  }).reduce((a, b) => a + b, 0);
  const countsOffsets = 4 * (bw * g.BW) * 4;
  const planMeta = (3 * g.numWindows + 6) * 4;
  return srsBytes + arena + countsOffsets + planMeta;
}

// ── Footprint: batch-of-1 == single-MSM estimateMem(1), byte-exact.
describe('batch-of-1 footprint reproduces the single-MSM budget gate', () => {
  for (const logn of [14, 15, 16, 17]) {
    test(`logN=${logn}`, () => {
      const g = computeGeom(1 << logn);
      const packed = batchFootprintBytes([g], { sT: DEFAULT_ST, sS: DEFAULT_SS, srsBytes: SRS_2P17 });
      const single = estimateMemSingle(g, DEFAULT_ST, DEFAULT_SS, SRS_2P17);
      expect(packed).toBe(single);
    });
  }

  test('logN=17 footprint is in the documented ~101 MiB ballpark (sT=8192)', () => {
    const g = computeGeom(1 << 17);
    const bytes = batchFootprintBytes([g], { sT: DEFAULT_ST, sS: DEFAULT_SS, srsBytes: SRS_2P17 });
    expect(bytes / MiB).toBeGreaterThan(95);
    expect(bytes / MiB).toBeLessThan(115);
  });
});

// ── planBatch K=1: a no-op concatenation. Bases 0; table == single-MSM table.
describe('planBatch at K=1 is the single-MSM path', () => {
  test('offsets are zero and the table equals the solo WindowDesc', () => {
    const g = computeGeom(1 << 16);
    const layout = planBatch([{ n: 1 << 16 }], { srsBytes: SRS_2P17 });
    expect(layout.descs).toHaveLength(1);
    const d = layout.descs[0];
    expect([d.scalarBase, d.outBase, d.schedOff, d.redBase]).toEqual([0, 0, 0, 0]);
    expect(d.numWindows).toBe(g.numWindows);
    expect(d.nLarge).toBe(g.n);
    expect(layout.totalWindows).toBe(g.numWindows);
    expect(layout.totalScalarBytes).toBe(g.scalarBytes);
    expect(layout.totalWindowSumBytes).toBe(g.windowSumBytes);
    expect(layout.totalRedM).toBe(g.redM);
    const { rows } = buildUniformWindowDesc(g);
    expect(Array.from(layout.windowDescTable)).toEqual(Array.from(rows));
    expect(layout.footprintBytes).toBe(estimateMemSingle(g, DEFAULT_ST, DEFAULT_SS, SRS_2P17));
  });
});

// ── planBatch K>1: concatenation threads the running bases correctly.
describe('planBatch concatenates K MSMs', () => {
  const gA = computeGeom(1 << 14); // NW=32, redM=4096, c=8
  const gB = computeGeom(1 << 16); // NW=20, redM=81920, c=13
  const layout = planBatch([{ n: 1 << 14, srsOffset: 0 }, { n: 1 << 16, srsOffset: 1 << 14 }], { srsBytes: SRS_2P17 });

  test('descriptor bases are prefix sums of the per-MSM regions', () => {
    expect(layout.descs[0]).toMatchObject({ scalarBase: 0, outBase: 0, schedOff: 0, redBase: 0, srsOffset: 0 });
    expect(layout.descs[1]).toMatchObject({
      scalarBase: gA.scalarBytes, // 32·2^14
      outBase: gA.windowSumBytes, // 32·64
      schedOff: gA.numWindows, // 32
      redBase: gA.redM, // 4096
      srsOffset: 1 << 14,
    });
  });

  test('totals are the sums', () => {
    expect(layout.totalWindows).toBe(gA.numWindows + gB.numWindows); // 52
    expect(layout.totalScalarBytes).toBe(gA.scalarBytes + gB.scalarBytes);
    expect(layout.totalWindowSumBytes).toBe(gA.windowSumBytes + gB.windowSumBytes);
    expect(layout.totalRedM).toBe(gA.redM + gB.redM); // 86016
    expect(layout.windowDescTable.length).toBe((gA.numWindows + gB.numWindows) * 8);
    expect(layout.windows).toHaveLength(gA.numWindows + gB.numWindows);
  });

  test('global windows are contiguous and tagged with their source MSM', () => {
    layout.windows.forEach((win, i) => expect(win.globalWindow).toBe(i));
    const first1 = layout.windows[gA.numWindows]; // first window of MSM 1
    expect(first1).toMatchObject({ msmIdx: 1, localWindow: 0, n: 1 << 16, scalarBase: gA.scalarBytes });
    expect(layout.windows[0]).toMatchObject({ msmIdx: 0, localWindow: 0, n: 1 << 14, scalarBase: 0 });
  });

  test('reduceOffsets are MSM-local (reset at each MSM boundary)', () => {
    expect(layout.reduceOffsets[gA.numWindows - 1]).toBe((gA.numWindows - 1) * gA.stride); // 31·128
    expect(layout.reduceOffsets[gA.numWindows]).toBe(0); // MSM 1, window 0 resets
    expect(layout.reduceOffsets[gA.numWindows + 1]).toBe(gB.stride); // MSM 1, window 1
  });

  test('the concatenated footprint exceeds either MSM alone but charges SRS once', () => {
    const fA = batchFootprintBytes([gA], { srsBytes: SRS_2P17 });
    const fB = batchFootprintBytes([gB], { srsBytes: SRS_2P17 });
    const fAB = batchFootprintBytes([gA, gB], { srsBytes: SRS_2P17 });
    expect(fAB).toBeGreaterThan(fB);
    // Per-MSM terms sum but SRS + shared THREAD are counted once, so the pack is
    // strictly cheaper than running the two footprints back-to-back.
    expect(fAB).toBeLessThan(fA + fB);
  });
});

// ── Ragged point-tiles tile the union tightly (no padded threads, no gaps).
describe('point-tile work-list covers the union', () => {
  test('tiles are contiguous per MSM and sum to n', () => {
    const tile = 10000;
    const layout = planBatch([{ n: 16384 }, { n: 65536 }], { pointTile: tile });
    for (const msmIdx of [0, 1]) {
      const tiles = layout.pointTiles.filter((t) => t.msmIdx === msmIdx);
      const n = layout.descs[msmIdx].n;
      expect(tiles[0].pointStart).toBe(0);
      let cursor = 0;
      for (const t of tiles) {
        expect(t.pointStart).toBe(cursor); // contiguous, no gap/overlap
        expect(t.pointCount).toBeGreaterThan(0);
        expect(t.pointCount).toBeLessThanOrEqual(tile);
        cursor += t.pointCount;
      }
      expect(cursor).toBe(n); // exact coverage
    }
  });
});

// ── Bin-packer: greedy, SRS-shared, solo for the too-big.
describe('packByBudget', () => {
  test('SRS is charged exactly once per pack, never per MSM', () => {
    const inputs = Array.from({ length: 8 }, () => ({ n: 1 << 10 }));
    const geoms = inputs.map((i) => computeGeom(i.n));
    const withSrs = batchFootprintBytes(geoms, { srsBytes: SRS_2P17 });
    const without = batchFootprintBytes(geoms, { srsBytes: 0 });
    expect(withSrs - without).toBe(SRS_2P17); // shared point pool, summed once
  });

  test('a generous budget packs everything into one pass', () => {
    const inputs = Array.from({ length: 6 }, () => ({ n: 1 << 12 }));
    const packs = packByBudget(inputs, { budgetBytes: 1024 * MiB, srsBytes: SRS_2P17 });
    expect(packs).toHaveLength(1);
    expect(packs[0].descs).toHaveLength(6);
  });

  test('many tiny MSMs pack into one pass under the 160 MB phone budget', () => {
    // The win the plan targets: small MSMs that each underfill the GPU pool into
    // one saturating pass. Footprint is dominated by the shared sT-scaled THREAD
    // zone, so the per-MSM cost is small.
    const inputs = Array.from({ length: 40 }, () => ({ n: 1 << 8 }));
    const packs = packByBudget(inputs, { budgetBytes: 160 * MiB, srsBytes: SRS_2P17 });
    expect(packs).toHaveLength(1);
    expect(packs[0].descs).toHaveLength(40);
    expect(packs[0].footprintBytes).toBeLessThanOrEqual(160 * MiB);
  });

  test('a tight budget splits the candidates across packs', () => {
    const solo = batchFootprintBytes([computeGeom(1 << 16)], { srsBytes: SRS_2P17 });
    // A budget that fits one n=2^16 MSM but not two.
    const packs = packByBudget([{ n: 1 << 16 }, { n: 1 << 16 }, { n: 1 << 16 }], {
      budgetBytes: solo + 1,
      srsBytes: SRS_2P17,
    });
    expect(packs.length).toBeGreaterThan(1);
    for (const p of packs) expect(p.footprintBytes).toBeLessThanOrEqual(solo + 1);
  });

  test('every candidate lands in exactly one pack', () => {
    const inputs = [{ n: 1 << 16 }, { n: 1 << 10 }, { n: 1 << 17 }, { n: 1 << 8 }, { n: 1 << 14 }];
    const packs = packByBudget(inputs, { budgetBytes: 200 * MiB, srsBytes: SRS_2P17 });
    const total = packs.reduce((acc, p) => acc + p.descs.length, 0);
    expect(total).toBe(inputs.length);
  });
});
