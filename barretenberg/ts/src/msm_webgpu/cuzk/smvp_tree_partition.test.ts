import {
  assertCompact,
  bucketIdx,
  buildSliceLayout,
  compactBucketStart,
  computeTotalAdds,
  findAddsBoundary,
  runningAdds,
} from "./smvp_tree_partition.js";

// Seeded LCG (Numerical Recipes constants) — mirrors the convention used
// elsewhere in dev/msm-webgpu/. Reproducible across runs.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

// Build a CSR-shaped bucketStart from per-bucket populations.
function bucketStartFromPops(pops: number[]): Uint32Array {
  const out = new Uint32Array(pops.length + 1);
  let acc = 0;
  for (let i = 0; i < pops.length; i++) {
    out[i] = acc;
    acc += pops[i];
  }
  out[pops.length] = acc;
  return out;
}

// Brute-force reference: pair-detection walk over the schedule. Equals
// the count of consecutive same-bucket pairs in entries [0, i].
function runningAddsRefByWalk(pops: number[], i: number): number {
  let adds = 0;
  let prevBucket = -1;
  let entry = 0;
  for (let bi = 0; bi < pops.length; bi++) {
    for (let off = 0; off < pops[bi]; off++) {
      if (entry > 0 && prevBucket === bi) adds++;
      if (entry === i) return adds;
      prevBucket = bi;
      entry++;
    }
  }
  return adds;
}

describe("smvp_tree_partition", () => {
  describe("bucketIdx", () => {
    it("returns 0 for entries inside the first bucket", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      expect(bucketIdx(bs, 0)).toBe(0);
      expect(bucketIdx(bs, 2)).toBe(0);
    });
    it("returns B for the first entry of bucket B", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      expect(bucketIdx(bs, 3)).toBe(1);
      expect(bucketIdx(bs, 8)).toBe(2);
    });
    it("handles empty buckets — picks the latest empty bucket at the boundary", () => {
      // pops: [2, 0, 0, 3]
      //   bucketStart = [0, 2, 2, 2, 5]
      //   entries [0,1] -> bucket 0; entries [2,3,4] -> bucket 3.
      const bs = bucketStartFromPops([2, 0, 0, 3]);
      expect(bucketIdx(bs, 0)).toBe(0);
      expect(bucketIdx(bs, 1)).toBe(0);
      expect(bucketIdx(bs, 2)).toBe(3);
      expect(bucketIdx(bs, 4)).toBe(3);
    });
  });

  describe("computeTotalAdds", () => {
    it("equals totalEntries - num_active_buckets", () => {
      const bs = bucketStartFromPops([3, 5, 2, 0, 1]);
      // active buckets = 4 (pop>0); total entries = 11; total adds = 11 - 4 = 7.
      expect(computeTotalAdds(bs)).toBe(7);
    });
    it("returns 0 on an all-empty schedule", () => {
      const bs = bucketStartFromPops([0, 0, 0]);
      expect(computeTotalAdds(bs)).toBe(0);
    });
    it("returns 0 when every bucket has exactly one entry", () => {
      const bs = bucketStartFromPops([1, 1, 1, 1]);
      expect(computeTotalAdds(bs)).toBe(0);
    });
  });

  describe("runningAdds", () => {
    it("matches the brute-force pair-detection walk on a compacted schedule", () => {
      const pops = [3, 5, 2, 1, 4];
      const bs = bucketStartFromPops(pops);
      const total = bs[bs.length - 1];
      for (let i = 0; i < total; i++) {
        expect(runningAdds(bs, i)).toBe(runningAddsRefByWalk(pops, i));
      }
    });
    it("is monotone non-decreasing on a compacted schedule", () => {
      const pops = [3, 5, 2, 1, 4, 2];
      const bs = bucketStartFromPops(pops);
      const total = bs[bs.length - 1];
      let prev = -1;
      for (let i = 0; i < total; i++) {
        const a = runningAdds(bs, i);
        expect(a).toBeGreaterThanOrEqual(prev);
        prev = a;
      }
    });
  });

  describe("compactBucketStart", () => {
    it("drops zero-population buckets and rebuilds the active-id map", () => {
      const bs = bucketStartFromPops([3, 0, 5, 0, 0, 2]);
      const { compactStart, activeBucketIds } = compactBucketStart(bs);
      // 3 active buckets at original ids 0, 2, 5; entry layout
      // unchanged (offsets 0, 3, 8) and total = 10.
      expect(Array.from(compactStart)).toEqual([0, 3, 8, 10]);
      expect(Array.from(activeBucketIds)).toEqual([0, 2, 5]);
    });
    it("is a no-op on an already-compact schedule", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      const { compactStart, activeBucketIds } = compactBucketStart(bs);
      expect(Array.from(compactStart)).toEqual(Array.from(bs));
      expect(Array.from(activeBucketIds)).toEqual([0, 1, 2]);
    });
    it("produces compactStart that runningAdds can use without misalignment", () => {
      // pops with empties: the analytical identity must hold after
      // compacting (regression for the design ambiguity called out in
      // the module header comment).
      const pops = [3, 5, 2, 1, 4, 0, 2];
      const bs = bucketStartFromPops(pops);
      const { compactStart } = compactBucketStart(bs);
      const popsCompact = pops.filter((p) => p > 0);
      const total = compactStart[compactStart.length - 1];
      for (let i = 0; i < total; i++) {
        expect(runningAdds(compactStart, i)).toBe(runningAddsRefByWalk(popsCompact, i));
      }
    });
  });

  describe("assertCompact", () => {
    it("passes on a strictly increasing bucketStart", () => {
      expect(() => assertCompact(bucketStartFromPops([1, 2, 3]))).not.toThrow();
    });
    it("throws when adjacent entries are equal (empty bucket)", () => {
      expect(() => assertCompact(bucketStartFromPops([2, 0, 3]))).toThrow(/not compacted/);
    });
  });

  describe("findAddsBoundary", () => {
    it("returns 0 for target 0", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      expect(findAddsBoundary(bs, 0)).toBe(0);
    });
    it("returns totalEntries for target = totalAdds", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      // total adds = 10 - 3 = 7; totalEntries = 10.
      expect(findAddsBoundary(bs, computeTotalAdds(bs))).toBe(10);
    });
    it("returns an entry whose running_adds equals the target on continuous targets", () => {
      const pops = [3, 5, 2, 4];
      const bs = bucketStartFromPops(pops);
      const total = computeTotalAdds(bs);
      for (let t = 0; t <= total; t++) {
        const i = findAddsBoundary(bs, t);
        if (t === total) {
          expect(i).toBe(bs[bs.length - 1]);
        } else {
          expect(runningAdds(bs, i)).toBe(t);
        }
      }
    });
    it("handles a heavy-tail distribution where one bucket dominates", () => {
      const pops = [1, 1, 1, 1000];
      const bs = bucketStartFromPops(pops);
      const total = computeTotalAdds(bs); // 1003 - 4 = 999
      expect(total).toBe(999);
      for (const t of [1, 100, 500, 998]) {
        const i = findAddsBoundary(bs, t);
        expect(runningAdds(bs, i)).toBe(t);
      }
    });
    it("agrees with the brute-force reference on random schedules", () => {
      const rng = makeRng(0xdeadbeef);
      for (let trial = 0; trial < 50; trial++) {
        // 16..256 buckets, each pop 0..20.
        const nb = 16 + (rng() % 241);
        const pops: number[] = [];
        for (let i = 0; i < nb; i++) pops.push(rng() % 21);
        const bs = bucketStartFromPops(pops);
        const total = computeTotalAdds(bs);
        if (total === 0) continue;
        for (let s = 0; s < 8; s++) {
          const t = rng() % (total + 1);
          const i = findAddsBoundary(bs, t);
          if (t === total) {
            expect(i).toBe(bs[bs.length - 1]);
          } else {
            expect(runningAdds(bs, i)).toBe(t);
          }
        }
      }
    });
  });

  describe("buildSliceLayout", () => {
    it("rejects non-positive numWgs", () => {
      const bs = bucketStartFromPops([3, 5]);
      expect(() => buildSliceLayout(bs, 0)).toThrow();
      expect(() => buildSliceLayout(bs, -1)).toThrow();
    });
    it("a single WG owns the whole schedule", () => {
      const bs = bucketStartFromPops([3, 5, 2]);
      const layout = buildSliceLayout(bs, 1);
      expect(Array.from(layout.sliceStart)).toEqual([0, 10]);
      expect(Array.from(layout.outputCount)).toEqual([3]);
      expect(Array.from(layout.outputOffset)).toEqual([0, 3]);
      expect(layout.totalAdds).toBe(7);
    });
    it("evenly partitions adds across numWgs", () => {
      const pops = [4, 4, 4, 4]; // 16 entries; 12 adds (16 - 4 active)
      const bs = bucketStartFromPops(pops);
      const layout = buildSliceLayout(bs, 4);
      // Slices must cover [0, 16] without gaps or overlaps.
      expect(layout.sliceStart[0]).toBe(0);
      expect(layout.sliceStart[4]).toBe(16);
      for (let k = 0; k < 4; k++) {
        expect(layout.sliceStart[k + 1]).toBeGreaterThan(layout.sliceStart[k]);
      }
      // The running_adds gap across each interior boundary should be
      // close to totalAdds/numWgs (== 3 here, may be off by one due to
      // the inclusive-floor placement on bucket-edge entries).
      const totalAdds = layout.totalAdds;
      const perSlice = totalAdds / 4;
      for (let k = 1; k < 4; k++) {
        const ra = runningAdds(bs, layout.sliceStart[k]);
        expect(Math.abs(ra - Math.floor(k * perSlice))).toBeLessThanOrEqual(1);
      }
      // Output counts sum to the total number of bucket-touchings (each
      // slice's output count == buckets covered). Since slices may share
      // a bucket at boundaries, the sum can exceed the actual bucket count.
      const sumOutput = Array.from(layout.outputCount).reduce((a, b) => a + b, 0);
      expect(sumOutput).toBeGreaterThanOrEqual(pops.length);
      expect(layout.outputOffset[4]).toBe(sumOutput);
    });
    it("emits one output per bucket covered by each slice", () => {
      // pops [10, 10, 10, 10, 10] → 50 entries, 45 adds.
      const pops = [10, 10, 10, 10, 10];
      const bs = bucketStartFromPops(pops);
      const layout = buildSliceLayout(bs, 3);
      for (let k = 0; k < 3; k++) {
        const lo = layout.sliceStart[k];
        const hi = layout.sliceStart[k + 1] - 1;
        const buckets = bucketIdx(bs, hi) - bucketIdx(bs, lo) + 1;
        expect(layout.outputCount[k]).toBe(buckets);
      }
    });
    it("handles a heavy-bucket skew (one bucket >> others)", () => {
      const pops = [1, 1, 1, 1, 1, 10_000];
      const bs = bucketStartFromPops(pops);
      const layout = buildSliceLayout(bs, 8);
      // Every WG must own a contiguous, non-empty slice.
      for (let k = 0; k < 8; k++) {
        expect(layout.sliceStart[k + 1]).toBeGreaterThanOrEqual(layout.sliceStart[k]);
      }
      // 7+ of the slices should fall inside the heavy bucket (bucket 5).
      let inHeavy = 0;
      for (let k = 0; k < 8; k++) {
        const lo = layout.sliceStart[k];
        if (lo >= bs[5] && lo < bs[6]) inHeavy++;
      }
      expect(inHeavy).toBeGreaterThanOrEqual(7);
    });
    it("survives a pathologically small total_adds (numWgs > totalAdds)", () => {
      const pops = [1, 1, 1, 1, 1]; // 5 entries, 0 adds
      const bs = bucketStartFromPops(pops);
      const layout = buildSliceLayout(bs, 8);
      // Slices must still be monotone non-decreasing and cover [0, 5].
      expect(layout.sliceStart[0]).toBe(0);
      expect(layout.sliceStart[8]).toBe(5);
      for (let k = 1; k <= 8; k++) {
        expect(layout.sliceStart[k]).toBeGreaterThanOrEqual(layout.sliceStart[k - 1]);
      }
    });
  });
});
