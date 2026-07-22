// Node-side unit test for BatchMsmV2.
//
// The substantive WebGPU correctness check lives in the dev page
// (the browser bench harness — "Run batch MSM"), which
// cross-checks each batched per-slot result against a one-off MsmV2 run with
// the same scalars. This Node-side suite covers the host-side helper that
// the batch path uses on top of `MsmV2`: the Horner combine of per-window
// sums. We exercise it against an in-process noble bn254 reference, so any
// drift in the combine formula (e.g. EFD dbl-2009-l / madd-2007-bl typos)
// shows up as a test failure rather than as a silent corrupted commitment.

import { describe, expect, it } from '@jest/globals';
import { bn254 } from '@noble/curves/bn254';

import { hostHornerCombine } from './batch_msm.js';

/**
 * Reference Horner fold via noble's group ops. The Horner combine treats
 * each `L_w` as an opaque per-window point and computes
 * `acc = sum_w 2^{w·c} · L_w`. Independent of how `L_w` was produced (Booth
 * decomposition, signed-digit, etc.), which is the right level of
 * abstraction for testing `hostHornerCombine`.
 */
function referenceHorner(L: { x: bigint; y: bigint }[], c: number): { x: bigint; y: bigint } {
  const Proj = bn254.G1.ProjectivePoint;
  let acc = Proj.fromAffine(L[L.length - 1]);
  for (let w = L.length - 2; w >= 0; w--) {
    for (let d = 0; d < c; d++) acc = acc.double();
    acc = acc.add(Proj.fromAffine(L[w]));
  }
  return acc.toAffine();
}

/** Deterministic non-trivial points on bn254 G1 — derived from the base
 *  generator by repeated scalar multiplication so they hit all the
 *  Jacobian add/dbl edge cases (no coordinate collisions, no identity). */
function generateTestPoints(count: number, seed: bigint): { x: bigint; y: bigint }[] {
  const Proj = bn254.G1.ProjectivePoint;
  const points: { x: bigint; y: bigint }[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    points.push(Proj.BASE.multiply(s).toAffine());
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    if (s === 0n) s = 1n;
  }
  return points;
}

describe('BatchMsmV2.hostHornerCombine', () => {
  it('matches noble for a tiny W=2, c=8 case', () => {
    const c = 8;
    const L = generateTestPoints(2, 1n);
    const expected = referenceHorner(L, c);
    const got = hostHornerCombine(L, c);
    expect(got.x).toBe(expected.x);
    expect(got.y).toBe(expected.y);
  });

  it('matches noble at c=8, W=32 (the typical c at n=2^12..2^14)', () => {
    const c = 8;
    const W = Math.ceil(254 / c); // 32
    const L = generateTestPoints(W, 31337n);
    const expected = referenceHorner(L, c);
    const got = hostHornerCombine(L, c);
    expect(got.x).toBe(expected.x);
    expect(got.y).toBe(expected.y);
  });

  it('matches noble at c=10, W=26 (typical at n=2^15)', () => {
    const c = 10;
    const W = Math.ceil(254 / c); // 26
    const L = generateTestPoints(W, 0xfeedbeefn);
    const expected = referenceHorner(L, c);
    const got = hostHornerCombine(L, c);
    expect(got.x).toBe(expected.x);
    expect(got.y).toBe(expected.y);
  });

  it('matches noble at c=13, W=20 (the production knob for n in [2^16, 2^17])', () => {
    const c = 13;
    const W = Math.ceil(254 / c); // 20
    const L = generateTestPoints(W, 0xc0ffeen);
    const expected = referenceHorner(L, c);
    const got = hostHornerCombine(L, c);
    expect(got.x).toBe(expected.x);
    expect(got.y).toBe(expected.y);
  });

  it('matches noble at c=15, W=17 (largest production c, used at n=2^18..2^20)', () => {
    const c = 15;
    const W = Math.ceil(254 / c); // 17
    const L = generateTestPoints(W, 0xdeadc0den);
    const expected = referenceHorner(L, c);
    const got = hostHornerCombine(L, c);
    expect(got.x).toBe(expected.x);
    expect(got.y).toBe(expected.y);
  });

  it('is deterministic — same input twice returns identical bytes', () => {
    const c = 13;
    const L = generateTestPoints(20, 42n);
    const a = hostHornerCombine(L, c);
    const b = hostHornerCombine(L, c);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  it('handles a single-window MSM (W=1) by returning L[0] unchanged', () => {
    const c = 13;
    const L = generateTestPoints(1, 7n);
    const got = hostHornerCombine(L, c);
    // With W=1, the Horner loop runs zero times — the result is just L[0].
    expect(got.x).toBe(L[0].x);
    expect(got.y).toBe(L[0].y);
  });
});
