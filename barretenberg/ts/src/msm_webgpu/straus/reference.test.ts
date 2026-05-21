import { bn254 } from "@noble/curves/bn254";
import {
  BN254_BASE_FIELD,
  BN254_ZERO,
  Bn254Point,
  isBn254Zero,
} from "../cuzk/bn254.js";
import { FR_ORDER } from "./glv.js";
import { FQ_CUBE_ROOT_OF_UNITY, referenceStrausMsm } from "./reference.js";

function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomScalar(rand: () => number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 32n) | BigInt(rand());
  }
  return v % FR_ORDER;
}

function randomAffinePoint(rand: () => number): Bn254Point {
  const s = randomScalar(rand);
  const proj = bn254.G1.ProjectivePoint.BASE.multiply(s === 0n ? 1n : s);
  const aff = proj.toAffine();
  return { x: aff.x, y: aff.y };
}

function nobleMsmAffine(
  points: readonly Bn254Point[],
  scalars: readonly bigint[],
): Bn254Point {
  const filteredPoints: ReturnType<typeof bn254.G1.ProjectivePoint.fromAffine>[] = [];
  const filteredScalars: bigint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (isBn254Zero(points[i])) continue;
    const s = ((scalars[i] % FR_ORDER) + FR_ORDER) % FR_ORDER;
    if (s === 0n) continue;
    filteredPoints.push(
      bn254.G1.ProjectivePoint.fromAffine({ x: points[i].x, y: points[i].y }),
    );
    filteredScalars.push(s);
  }
  if (filteredPoints.length === 0) return BN254_ZERO;
  const result = bn254.G1.ProjectivePoint.msm(filteredPoints, filteredScalars);
  if (result.equals(bn254.G1.ProjectivePoint.ZERO)) return BN254_ZERO;
  const aff = result.toAffine();
  return { x: aff.x, y: aff.y };
}

function pointsEqual(a: Bn254Point, b: Bn254Point): boolean {
  const aZero = isBn254Zero(a);
  const bZero = isBn254Zero(b);
  if (aZero && bZero) return true;
  if (aZero !== bZero) return false;
  return a.x === b.x && a.y === b.y;
}

describe("straus/reference: FQ_CUBE_ROOT_OF_UNITY", () => {
  it("β is a primitive cube root of unity in Fq", () => {
    const beta = FQ_CUBE_ROOT_OF_UNITY;
    expect(beta).not.toBe(1n);
    expect((beta * beta * beta) % BN254_BASE_FIELD).toBe(1n);
  });
});

describe("straus/reference: referenceStrausMsm vs noble.bn254.G1.msm", () => {
  const N_VALUES = [1, 1, 2, 7, 8, 16, 32, 64, 256];

  for (const n of N_VALUES) {
    it(`matches noble for n = ${n} (5 seeded inputs)`, () => {
      for (let seed = 0; seed < 5; seed++) {
        const rand = makeRng(n * 7919 + seed);
        const points: Bn254Point[] = [];
        const scalars: bigint[] = [];
        for (let i = 0; i < n; i++) {
          points.push(randomAffinePoint(rand));
          scalars.push(randomScalar(rand));
        }
        const ours = referenceStrausMsm(points, scalars);
        const theirs = nobleMsmAffine(points, scalars);
        expect(pointsEqual(ours, theirs)).toBe(true);
      }
    });
  }
});

describe("straus/reference: edge cases", () => {
  it("empty input returns infinity", () => {
    expect(isBn254Zero(referenceStrausMsm([], []))).toBe(true);
  });

  it("all-zero scalars return infinity", () => {
    const rand = makeRng(1);
    const points = [randomAffinePoint(rand), randomAffinePoint(rand)];
    const scalars = [0n, 0n];
    expect(isBn254Zero(referenceStrausMsm(points, scalars))).toBe(true);
  });

  it("infinity points are skipped", () => {
    const rand = makeRng(2);
    const p0 = randomAffinePoint(rand);
    const p2 = randomAffinePoint(rand);
    const points: Bn254Point[] = [p0, BN254_ZERO, p2];
    const s0 = randomScalar(rand);
    const s1 = randomScalar(rand);
    const s2 = randomScalar(rand);
    const scalars = [s0, s1, s2];
    const ours = referenceStrausMsm(points, scalars);
    const expected = nobleMsmAffine([p0, p2], [s0, s2]);
    expect(pointsEqual(ours, expected)).toBe(true);
  });

  it("infinity points and zero scalars both skipped together", () => {
    const rand = makeRng(3);
    const p0 = randomAffinePoint(rand);
    const p2 = randomAffinePoint(rand);
    const points: Bn254Point[] = [p0, BN254_ZERO, p2, randomAffinePoint(rand)];
    const s0 = randomScalar(rand);
    const s2 = randomScalar(rand);
    const scalars = [s0, randomScalar(rand), s2, 0n];
    const ours = referenceStrausMsm(points, scalars);
    const expected = nobleMsmAffine([p0, p2], [s0, s2]);
    expect(pointsEqual(ours, expected)).toBe(true);
  });

  it("single-point single-scalar matches scalar mult", () => {
    const rand = makeRng(4);
    const p = randomAffinePoint(rand);
    const s = randomScalar(rand);
    const ours = referenceStrausMsm([p], [s]);
    const expected = nobleMsmAffine([p], [s]);
    expect(pointsEqual(ours, expected)).toBe(true);
  });

  it("handles small fixed scalars (1, 2, r-1)", () => {
    const rand = makeRng(5);
    const p = randomAffinePoint(rand);
    for (const s of [1n, 2n, FR_ORDER - 1n]) {
      const ours = referenceStrausMsm([p], [s]);
      const expected = nobleMsmAffine([p], [s]);
      expect(pointsEqual(ours, expected)).toBe(true);
    }
  });
});
