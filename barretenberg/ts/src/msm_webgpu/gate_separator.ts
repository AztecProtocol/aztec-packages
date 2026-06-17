// GateSeparatorPolynomial (pow_beta) mirror — the CPU glue between the GPU's
// per-edge relation accumulator and the batch_over_relations tail.
//
// Mirrors barretenberg's polynomials/gate_separator.hpp for the MegaFlavor
// (non-empty betas) path. Two quantities feed the round univariate:
//   - per-EDGE scaling: beta_products[(edge_idx>>1)*periodicity] — the weight
//     applied to each edge pair inside accumulate (folded into the 345-Fr by the
//     GPU). For edge pair j at round i this is beta_products[j * 2^(i+1)].
//   - per-ROUND scalars consumed by the tail: current_element() = beta_i and
//     partial_evaluation_result = c_i = prod_{k<i} ((1-u_k) + u_k*beta_k).
//
// All arithmetic is canonical BN254 scalar-field bigint.

import { batchOverRelations } from './batch_tail.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const mul = (a: bigint, b: bigint): bigint => mod(a * b);

/**
 * Compute beta_products: beta_products[i] = prod over set bits j of i of betas[j]
 * (beta_products[0] = 1). Length 2^logNumMonomials. Empty betas yields [0]
 * (the no-gate-separation degenerate case), matching the C++ constructor.
 */
export function computeBetaProducts(betas: bigint[], logNumMonomials: number): bigint[] {
  if (betas.length === 0) return [0n];
  const size = 1 << logNumMonomials;
  const out = new Array<bigint>(size);
  out[0] = 1n;
  for (let i = 1; i < size; i++) {
    let r = 1n;
    let rem = i;
    let j = 0;
    while (rem !== 0) {
      if (rem & 1) r = mul(r, betas[j]);
      rem >>>= 1;
      j++;
    }
    out[i] = r;
  }
  return out;
}

export class GateSeparatorPolynomial {
  readonly betas: bigint[];
  private readonly logNumMonomials: number;
  private _betaProducts: bigint[] | null = null;
  currentElementIdx = 0;
  periodicity = 2;
  partialEvaluationResult = 1n;

  /**
   * @param betas the gate challenges (beta_0..beta_{d-1})
   * @param logNumMonomials log2 of the beta_products length (defaults to betas.length);
   *   matches the C++ `log_num_monomials` used for constant-size proofs.
   */
  constructor(betas: bigint[], logNumMonomials: number = betas.length) {
    this.betas = betas.map(mod);
    this.logNumMonomials = logNumMonomials;
  }

  /**
   * The length-2^logNumMonomials beta_products table, built lazily on first access.
   * Only the host edge-scaling path (`at` / `edgeScaling`) needs it; the GPU sumcheck
   * scales on-device from its own resident Montgomery table, so it never triggers this
   * O(2^logNumMonomials) bigint build.
   */
  get betaProducts(): bigint[] {
    if (this._betaProducts === null) this._betaProducts = computeBetaProducts(this.betas, this.logNumMonomials);
    return this._betaProducts;
  }

  /** C++ operator[]: beta_products[(idx>>1)*periodicity]. idx is an even row index. */
  at(idx: number): bigint {
    return this.betaProducts[(idx >> 1) * this.periodicity];
  }

  /** Per-edge-pair scaling at the current round: beta_products[pairIndex * periodicity] (= at(2*pairIndex)). */
  edgeScaling(pairIndex: number): bigint {
    return this.betaProducts[pairIndex * this.periodicity];
  }

  /** beta_i for the current round (1 if betas is empty). */
  currentElement(): bigint {
    return this.betas.length === 0 ? 1n : this.betas[this.currentElementIdx];
  }

  /** ((1-X)+X*beta_i) evaluated at X=challenge. */
  univariateEval(challenge: bigint): bigint {
    return mod(1n + mul(challenge, mod(this.betas[this.currentElementIdx] - 1n)));
  }

  /** Fold this round's challenge u_i into c_i and advance to the next round. */
  partiallyEvaluate(challenge: bigint): void {
    if (this.betas.length === 0) return;
    this.partialEvaluationResult = mul(this.partialEvaluationResult, this.univariateEval(challenge));
    this.currentElementIdx++;
    this.periodicity *= 2;
  }

  /**
   * Reduce a flat 345-Fr accumulator (per-edge-summed, with this round's
   * edgeScaling already folded in) to the length-8 round univariate, applying
   * the round's beta_i and c_i via batch_over_relations.
   */
  roundUnivariate(acc: bigint[], alpha: bigint): bigint[] {
    return batchOverRelations(acc, alpha, this.currentElement(), this.partialEvaluationResult);
  }
}
