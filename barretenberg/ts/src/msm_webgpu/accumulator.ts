// Host-side assembly of the flat 345-Fr sumcheck accumulator from the per-relation
// GPU kernel outputs. Each relation kernel emits, per edge pair, its subrelation
// evaluations in (subrelation, eval) order — exactly the order of that relation's
// slice in the 345-Fr layout (see batch_tail.ts). So assembling the accumulator is:
//   1. reduceEdges: sum each relation's per-edge outputs over all edge pairs (the
//      per-edge gate-separator scaling is already folded in by the kernel).
//   2. assembleAccumulator: concatenate the per-relation summed slices in
//      MegaFlavor relation order into the flat 345-Fr buffer for the tail.
//
// Pure canonical BN254 bigint; the caller converts GPU Montgomery bytes to
// canonical before calling.

import { ACC_LEN, SUBREL_LEN, SUBREL_RELATION, SUBREL_START } from './batch_tail.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

// Group the flat subrelation tables by relation (SUBREL_RELATION entries are
// "Name[subIdx]"); the prefix is the relation name. Yields per-relation name,
// start offset, and total length in the 345-Fr layout, in relation order.
const grouped = ((): { names: string[]; offset: number[]; len: number[] } => {
  const names: string[] = [];
  const offset: number[] = [];
  const len: number[] = [];
  for (let g = 0; g < SUBREL_RELATION.length; g++) {
    const name = SUBREL_RELATION[g].slice(0, SUBREL_RELATION[g].indexOf('['));
    if (names.length === 0 || names[names.length - 1] !== name) {
      names.push(name);
      offset.push(SUBREL_START[g]);
      len.push(SUBREL_LEN[g]);
    } else {
      len[len.length - 1] += SUBREL_LEN[g];
    }
  }
  return { names, offset, len };
})();

/** MegaFlavor relation names, in Relations_ tuple order. */
export const RELATION_NAMES: readonly string[] = grouped.names;
/** Fr start offset of each relation's slice within the 345-Fr accumulator. */
export const RELATION_ACC_OFFSET: readonly number[] = grouped.offset;
/** Fr length of each relation's slice (sum of its subrelation lengths). */
export const RELATION_ACC_LEN: readonly number[] = grouped.len;
export const NUM_RELATIONS = RELATION_NAMES.length;

if (NUM_RELATIONS !== 14 || RELATION_ACC_LEN.reduce((a, b) => a + b, 0) !== ACC_LEN) {
  throw new Error(`accumulator layout mismatch: ${NUM_RELATIONS} relations / ${RELATION_ACC_LEN.reduce((a, b) => a + b, 0)} Fr`);
}

/**
 * Sum a relation's per-edge-pair outputs over all edges: given `numEdges`
 * vectors each of length `outLen` (one per edge pair, in the kernel's output
 * order), return the elementwise sum. This is the GPU accumulate's edge-reduction
 * done on the host.
 */
export function reduceEdges(perEdge: bigint[][], outLen: number): bigint[] {
  const out = new Array<bigint>(outLen).fill(0n);
  for (const edge of perEdge) {
    if (edge.length !== outLen) {
      throw new Error(`reduceEdges: edge has ${edge.length} entries, expected ${outLen}`);
    }
    for (let k = 0; k < outLen; k++) out[k] = mod(out[k] + edge[k]);
  }
  return out;
}

/**
 * Concatenate the per-relation summed slices (in MegaFlavor relation order) into
 * the flat 345-Fr accumulator. Each slice must have length RELATION_ACC_LEN[r];
 * a null/undefined slice (relation not run) is treated as all-zero.
 */
export function assembleAccumulator(slices: (bigint[] | null | undefined)[]): bigint[] {
  if (slices.length !== NUM_RELATIONS) {
    throw new Error(`assembleAccumulator: expected ${NUM_RELATIONS} slices, got ${slices.length}`);
  }
  const acc = new Array<bigint>(ACC_LEN).fill(0n);
  for (let r = 0; r < NUM_RELATIONS; r++) {
    const slice = slices[r];
    if (!slice) continue;
    if (slice.length !== RELATION_ACC_LEN[r]) {
      throw new Error(`assembleAccumulator: ${RELATION_NAMES[r]} slice has ${slice.length} Fr, expected ${RELATION_ACC_LEN[r]}`);
    }
    for (let e = 0; e < slice.length; e++) acc[RELATION_ACC_OFFSET[r] + e] = mod(slice[e]);
  }
  return acc;
}
