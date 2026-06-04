// CPU "batch_over_relations" tail of MegaFlavor (non-ZK) sumcheck — the
// size-independent reduction that turns the GPU's flat 345-Fr per-edge-summed
// relation accumulator into the length-8 round univariate the prover sends.
//
// Mirrors barretenberg's SumcheckProverRound::batch_over_relations
// (sumcheck/sumcheck_round.hpp:601), RelationUtils::scale_univariates
// (relations/utils.hpp:76), and Univariate::extend_to (polynomials/univariate.hpp:351),
// for the Mega non-ZK path only (ZK/Libra/row-disabling/Grumpkin are not taken).
//
// The 345-Fr accumulator holds, in (relation, subrelation, eval) order, one
// value-basis Univariate per subrelation: SUBREL_LEN[g] evaluations on the
// contiguous domain {0..SUBREL_LEN[g]-1}. The per-edge gate-separator scaling
// (beta_products[edge]) is already folded in per edge by the GPU accumulate, so
// the tail must NOT re-apply it — it applies only this round's degree-1 pow
// univariate {1, beta_i} and the scalar c_i, and only to linearly-independent
// subrelations.
//
// All arithmetic is canonical BN254 scalar-field bigint (the caller converts the
// GPU's Montgomery 8x u32 output to canonical on download).

import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

export const P = BN254_SCALAR_FIELD;

const mod = (x: bigint): bigint => ((x % P) + P) % P;
const add = (a: bigint, b: bigint): bigint => mod(a + b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);
const inv = (a: bigint): bigint => {
  let [or, r] = [mod(a), P];
  let [os, s] = [1n, 0n];
  while (r) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return mod(os);
};

export const BATCHED_LEN = 8; // BATCHED_RELATION_PARTIAL_LENGTH (MAX_PARTIAL_RELATION_LENGTH 7 + 1)
export const NUM_BUS_COLUMNS = 5; // MAX_APPS_PER_KERNEL(3) + kernel_calldata + return_data

interface RelationSpec {
  name: string;
  lengths: number[];
  linIndep?: boolean[]; // omitted => all linearly independent (relation_types.hpp default)
}

// DatabusLookup: NUM_BUS_COLUMNS buses, each {6,6,6} with per-bus LI {true,true,false}
// (the third, lookup-identity, subrelation of each bus is linearly dependent).
const databus = ((): { lengths: number[]; linIndep: boolean[] } => {
  const lengths: number[] = [];
  const linIndep: boolean[] = [];
  for (let bus = 0; bus < NUM_BUS_COLUMNS; bus++) {
    lengths.push(6, 6, 6);
    linIndep.push(true, true, false);
  }
  return { lengths, linIndep };
})();

// MegaFlavor Relations_ tuple order (flavor/mega_flavor.hpp:67-80).
const RELATIONS: RelationSpec[] = [
  { name: 'Arithmetic', lengths: [6, 5] },
  { name: 'UltraPermutation', lengths: [6, 3, 3] },
  { name: 'LogDerivLookup', lengths: [5, 5, 3], linIndep: [true, false, true] },
  { name: 'DeltaRangeConstraint', lengths: [6, 6, 6, 6] },
  { name: 'Elliptic', lengths: [6, 6] },
  { name: 'Memory', lengths: [6, 6, 6, 6, 6, 6] },
  { name: 'NonNativeField', lengths: [6] },
  { name: 'EccOpQueue', lengths: [3, 3, 3, 3, 3, 3, 3, 3] },
  { name: 'DatabusLookup', lengths: databus.lengths, linIndep: databus.linIndep },
  { name: 'Poseidon2External', lengths: [7, 7, 7, 7] },
  { name: 'Poseidon2InitialExternal', lengths: [3, 3, 3, 3] },
  { name: 'Poseidon2QuadInternal', lengths: [7, 7, 7, 7] },
  { name: 'Poseidon2QuadInternalTerminal', lengths: [7, 7, 7, 7] },
  { name: 'Poseidon2TransitionEntry', lengths: [7, 7, 7] },
];

// Flatten the relation specs to the 63-entry per-subrelation tables.
const flat = ((): {
  len: number[];
  start: number[];
  linIndep: boolean[];
  relation: string[];
} => {
  const len: number[] = [];
  const start: number[] = [];
  const linIndep: boolean[] = [];
  const relation: string[] = [];
  let offset = 0;
  for (const rel of RELATIONS) {
    rel.lengths.forEach((l, s) => {
      len.push(l);
      start.push(offset);
      linIndep.push(rel.linIndep ? rel.linIndep[s] : true);
      relation.push(`${rel.name}[${s}]`);
      offset += l;
    });
  }
  return { len, start, linIndep, relation };
})();

/** Per-subrelation value-basis length (= 1 + subrelation degree). */
export const SUBREL_LEN: readonly number[] = flat.len;
/** Per-subrelation Fr start offset within the flat accumulator. */
export const SUBREL_START: readonly number[] = flat.start;
/** Per-subrelation linear-independence flag (false => add raw, no pow / c_i). */
export const SUBREL_LIN_INDEP: readonly boolean[] = flat.linIndep;
/** Human-readable "Relation[subrelation]" label per flat index (diagnostics). */
export const SUBREL_RELATION: readonly string[] = flat.relation;

export const NUM_SUBRELATIONS = SUBREL_LEN.length;
export const ACC_LEN = SUBREL_START[NUM_SUBRELATIONS - 1] + SUBREL_LEN[NUM_SUBRELATIONS - 1];

// Self-check the derived layout against the known MegaFlavor constants so a
// future edit to the relation table can't silently desync.
if (NUM_SUBRELATIONS !== 63 || ACC_LEN !== 345) {
  throw new Error(`batch_tail layout mismatch: ${NUM_SUBRELATIONS} subrels / ${ACC_LEN} Fr (expected 63 / 345)`);
}

/**
 * Extend a value-basis univariate (evaluations at X = 0..L-1) to `to`
 * evaluations (X = 0..to-1) by barycentric interpolation over the contiguous
 * integer domain — the generic path of C++ Univariate::extend_to. Exact for any
 * polynomial of degree <= L-1.
 */
export function extendTo(evals: bigint[], to: number): bigint[] {
  const L = evals.length;
  if (to < L) {
    throw new Error(`extendTo: target ${to} < source length ${L}`);
  }
  const out = evals.map(mod);
  // Lagrange denominators d_j = prod_{m != j} (j - m).
  const dj: bigint[] = [];
  for (let j = 0; j < L; j++) {
    let d = 1n;
    for (let m = 0; m < L; m++) {
      if (m !== j) d = mul(d, mod(BigInt(j - m)));
    }
    dj.push(d);
  }
  for (let k = L; k < to; k++) {
    // f(k) = B(k) * sum_j evals[j] / (d_j * (k - j)),  B(k) = prod_i (k - i).
    let bk = 1n;
    for (let i = 0; i < L; i++) bk = mul(bk, BigInt(k - i));
    let acc = 0n;
    for (let j = 0; j < L; j++) {
      acc = add(acc, mul(evals[j], inv(mul(dj[j], BigInt(k - j)))));
    }
    out[k] = mul(acc, bk);
  }
  return out;
}

/**
 * Elementwise add two flat accumulators (RelationUtils::add_nested_tuples) —
 * used to merge per-partition GPU partials into one 345-Fr accumulator.
 */
export function addNestedTuples(a: bigint[], b: bigint[]): bigint[] {
  if (a.length !== b.length) {
    throw new Error(`addNestedTuples: length mismatch ${a.length} vs ${b.length}`);
  }
  return a.map((x, i) => add(x, b[i]));
}

/**
 * Scale each subrelation by its alpha power (RelationUtils::scale_univariates):
 * flat subrelation 0 is left unscaled (alpha^0 = 1); subrelation g >= 1 is
 * multiplied by alpha^g. Applied to ALL subrelations regardless of linear
 * independence. Returns a new array; the input is not mutated.
 */
export function scaleUnivariates(acc: bigint[], alpha: bigint): bigint[] {
  if (acc.length !== ACC_LEN) {
    throw new Error(`scaleUnivariates: expected ${ACC_LEN} Fr, got ${acc.length}`);
  }
  const out = acc.map(mod);
  let alphaPow = 1n;
  for (let g = 1; g < NUM_SUBRELATIONS; g++) {
    alphaPow = mul(alphaPow, alpha); // alpha^g
    const startG = SUBREL_START[g];
    for (let e = 0; e < SUBREL_LEN[g]; e++) {
      out[startG + e] = mul(out[startG + e], alphaPow);
    }
  }
  return out;
}

/**
 * Extend each subrelation to length 8 and batch into the round univariate
 * (SumcheckProverRound::extend_and_batch_univariates). The pow univariate is
 * {1, roundBeta} extended to 8; linearly-independent subrelations are multiplied
 * by it and by the scalar c_i, linearly-dependent ones are added raw.
 *
 * @param acc       the (already alpha-scaled) flat 345-Fr accumulator
 * @param roundBeta gate_separators.current_element() for this round (beta_i)
 * @param ci        gate_separators.partial_evaluation_result (pow over previous
 *                  rounds; 1 in round 0)
 */
export function extendAndBatch(acc: bigint[], roundBeta: bigint, ci: bigint): bigint[] {
  if (acc.length !== ACC_LEN) {
    throw new Error(`extendAndBatch: expected ${ACC_LEN} Fr, got ${acc.length}`);
  }
  const extRandom = extendTo([1n, mod(roundBeta)], BATCHED_LEN);
  const cMod = mod(ci);
  const result = new Array<bigint>(BATCHED_LEN).fill(0n);
  for (let g = 0; g < NUM_SUBRELATIONS; g++) {
    const slice = acc.slice(SUBREL_START[g], SUBREL_START[g] + SUBREL_LEN[g]);
    const ext = extendTo(slice, BATCHED_LEN);
    if (SUBREL_LIN_INDEP[g]) {
      for (let e = 0; e < BATCHED_LEN; e++) {
        result[e] = add(result[e], mul(mul(ext[e], extRandom[e]), cMod));
      }
    } else {
      for (let e = 0; e < BATCHED_LEN; e++) {
        result[e] = add(result[e], ext[e]);
      }
    }
  }
  return result;
}

/**
 * The full CPU tail: reduce a flat 345-Fr value-basis accumulator to the length-8
 * round univariate. `alpha` is the single subrelation separator challenge
 * (powers applied internally); `roundBeta` and `ci` are this round's
 * gate-separator scalars (see extendAndBatch).
 */
export function batchOverRelations(acc: bigint[], alpha: bigint, roundBeta: bigint, ci: bigint): bigint[] {
  return extendAndBatch(scaleUnivariates(acc, alpha), roundBeta, ci);
}
