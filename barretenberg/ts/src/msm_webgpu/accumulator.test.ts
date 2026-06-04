// Validates host-side accumulator assembly (reduceEdges + assembleAccumulator)
// and the derived per-relation layout against the flat subrelation tables.

import { describe, expect, it } from '@jest/globals';

import { ACC_LEN, SUBREL_LEN, SUBREL_START } from './batch_tail.js';
import {
  NUM_RELATIONS,
  RELATION_ACC_LEN,
  RELATION_ACC_OFFSET,
  RELATION_NAMES,
  assembleAccumulator,
  reduceEdges,
} from './accumulator.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

let seed = 0xacc_4444_1n;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};

describe('accumulator layout', () => {
  it('is the 14 MegaFlavor relations in tuple order', () => {
    expect(NUM_RELATIONS).toBe(14);
    expect(RELATION_NAMES).toEqual([
      'Arithmetic',
      'UltraPermutation',
      'LogDerivLookup',
      'DeltaRangeConstraint',
      'Elliptic',
      'Memory',
      'NonNativeField',
      'EccOpQueue',
      'DatabusLookup',
      'Poseidon2External',
      'Poseidon2InitialExternal',
      'Poseidon2QuadInternal',
      'Poseidon2QuadInternalTerminal',
      'Poseidon2TransitionEntry',
    ]);
  });

  it('has the expected per-relation Fr sub-totals and offsets', () => {
    expect([...RELATION_ACC_LEN]).toEqual([11, 12, 13, 24, 12, 36, 6, 24, 90, 28, 12, 28, 28, 21]);
    expect([...RELATION_ACC_OFFSET]).toEqual([0, 11, 23, 36, 60, 72, 108, 114, 138, 228, 256, 268, 296, 324]);
    expect(RELATION_ACC_LEN.reduce((a, b) => a + b, 0)).toBe(ACC_LEN);
  });

  it('per-relation offset equals the start of its first subrelation', () => {
    // The relation boundaries must line up exactly with the flat subrelation offsets.
    let g = 0;
    let acc = 0;
    for (let r = 0; r < NUM_RELATIONS; r++) {
      expect(RELATION_ACC_OFFSET[r]).toBe(SUBREL_START[g]);
      // advance g past this relation's subrelations
      let consumed = 0;
      while (consumed < RELATION_ACC_LEN[r]) {
        consumed += SUBREL_LEN[g];
        g++;
      }
      expect(consumed).toBe(RELATION_ACC_LEN[r]);
      acc += RELATION_ACC_LEN[r];
    }
    expect(acc).toBe(ACC_LEN);
  });
});

describe('reduceEdges', () => {
  it('sums per-edge outputs elementwise', () => {
    const outLen = 6;
    const n = 5;
    const perEdge = Array.from({ length: n }, () => Array.from({ length: outLen }, rnd));
    const got = reduceEdges(perEdge, outLen);
    for (let k = 0; k < outLen; k++) {
      let want = 0n;
      for (let i = 0; i < n; i++) want = mod(want + perEdge[i][k]);
      expect(got[k]).toBe(want);
    }
  });

  it('returns zeros for no edges', () => {
    expect(reduceEdges([], 4)).toEqual([0n, 0n, 0n, 0n]);
  });

  it('throws on inconsistent edge length', () => {
    expect(() => reduceEdges([[1n, 2n], [3n]], 2)).toThrow();
  });
});

describe('assembleAccumulator', () => {
  it('places each relation slice at its offset', () => {
    const slices = RELATION_ACC_LEN.map(len => Array.from({ length: len }, rnd));
    const acc = assembleAccumulator(slices);
    expect(acc).toHaveLength(ACC_LEN);
    for (let r = 0; r < NUM_RELATIONS; r++) {
      for (let e = 0; e < RELATION_ACC_LEN[r]; e++) {
        expect(acc[RELATION_ACC_OFFSET[r] + e]).toBe(slices[r][e]);
      }
    }
  });

  it('treats a null slice as all-zero (relation not run)', () => {
    const slices: (bigint[] | null)[] = RELATION_ACC_LEN.map(len => Array.from({ length: len }, () => 9n));
    slices[5] = null; // Memory not run
    const acc = assembleAccumulator(slices);
    for (let e = 0; e < RELATION_ACC_LEN[5]; e++) expect(acc[RELATION_ACC_OFFSET[5] + e]).toBe(0n);
    // a neighbour is still populated
    expect(acc[RELATION_ACC_OFFSET[4]]).toBe(9n);
  });

  it('throws on wrong slice count or length', () => {
    expect(() => assembleAccumulator([])).toThrow();
    const bad = RELATION_ACC_LEN.map(len => Array.from({ length: len }, () => 1n));
    bad[0] = [1n]; // wrong length for Arithmetic (should be 11)
    expect(() => assembleAccumulator(bad)).toThrow();
  });

  it('reduceEdges + assembleAccumulator composes to the full accumulator', () => {
    // Two edge pairs per relation; assemble and check a flat manual computation.
    const perRelationEdges = RELATION_ACC_LEN.map(len => [
      Array.from({ length: len }, rnd),
      Array.from({ length: len }, rnd),
    ]);
    const slices = perRelationEdges.map((edges, r) => reduceEdges(edges, RELATION_ACC_LEN[r]));
    const acc = assembleAccumulator(slices);
    for (let r = 0; r < NUM_RELATIONS; r++) {
      for (let e = 0; e < RELATION_ACC_LEN[r]; e++) {
        expect(acc[RELATION_ACC_OFFSET[r] + e]).toBe(mod(perRelationEdges[r][0][e] + perRelationEdges[r][1][e]));
      }
    }
  });
});
