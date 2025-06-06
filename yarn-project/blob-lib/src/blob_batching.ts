import { AZTEC_MAX_EPOCH_DURATION, BLOBS_PER_BLOCK } from '@aztec/constants';
import { poseidon2Hash, sha256, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Field, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

// Importing directly from 'c-kzg' does not work:
import cKzg from 'c-kzg';

import { Blob, VERSIONED_HASH_VERSION_KZG } from './blob.js';
import { BlobAccumulatorPublicInputs, FinalBlobAccumulatorPublicInputs } from './blob_batching_public_inputs.js';

const { computeKzgProof, verifyKzgProof } = cKzg;

/**
 * A class to create, manage, and prove batched EVM blobs.
 */
export class BatchedBlob {
  constructor(
    /** Hash of Cs (to link to L1 blob hashes). */
    public readonly blobCommitmentsHash: Fr,
    /** Challenge point z such that p_i(z) = y_i. */
    public readonly z: Fr,
    /** Evaluation y, linear combination of all evaluations y_i = p_i(z) with gamma. */
    public readonly y: BLS12Fr,
    /** Commitment C, linear combination of all commitments C_i = [p_i] with gamma. */
    public readonly commitment: BLS12Point,
    /** KZG opening 'proof' Q (commitment to the quotient poly.), linear combination of all blob kzg 'proofs' Q_i with gamma. */
    public readonly q: BLS12Point,
  ) {}

  /**
   * Get the final batched opening proof from multiple blobs.
   *
   * TODO(MW): Using the old Blob struct means there are ignored values (e.g. blob.evaluationY, because we now evaluate at shared z).
   * When switching to batching, create new class w/o useless values.
   *
   * @dev MUST input all blobs to be broadcast. Does not work in multiple calls because z and gamma are calculated
   *      beforehand from ALL blobs.
   *
   * @returns A batched blob.
   */
  static async batch(blobs: Blob[]): Promise<BatchedBlob> {
    const numBlobs = blobs.length;
    if (numBlobs > BLOBS_PER_BLOCK * AZTEC_MAX_EPOCH_DURATION) {
      throw new Error(
        `Too many blobs (${numBlobs}) sent to batch(). The maximum is ${BLOBS_PER_BLOCK * AZTEC_MAX_EPOCH_DURATION}.`,
      );
    }
    // Precalculate the values (z and gamma) and initialize the accumulator:
    let acc = await this.newAccumulator(blobs);
    // Now we can create a multi opening proof of all input blobs:
    acc = await acc.accumulateBlobs(blobs);
    return await acc.finalize();
  }

  /**
   * Returns an empty BatchedBlobAccumulator with precomputed challenges from all blobs in the epoch.
   * @dev MUST input all blobs to be broadcast. Does not work in multiple calls because z and gamma are calculated
   *      beforehand from ALL blobs.
   */
  static async newAccumulator(blobs: Blob[]): Promise<BatchedBlobAccumulator> {
    const finalBlobChallenges = await this.precomputeBatchedBlobChallenges(blobs);
    return BatchedBlobAccumulator.newWithChallenges(finalBlobChallenges);
  }

  /**
   * Gets the final challenges based on all blobs and their elements to perform a multi opening proof.
   * Used in BatchedBlobAccumulator as 'finalZ' and finalGamma':
   *  - z = H(...H(H(z_0, z_1) z_2)..z_n)
   *    - where z_i = H(H(fields of blob_i), C_i) = Blob.challengeZ,
   *    - used such that p_i(z) = y_i = Blob.evaluationY for all n blob polynomials p_i().
   *  - gamma = H(H(...H(H(y_0, y_1) y_2)..y_n), z)
   *    - used such that y = sum_i { gamma^i * y_i }, and C = sum_i { gamma^i * C_i }, for all blob evaluations y_i (see above) and commitments C_i.
   * @returns Challenges z and gamma.
   */
  static async precomputeBatchedBlobChallenges(blobs: Blob[]): Promise<FinalBlobBatchingChallenges> {
    // We need to precompute the final challenge values to evaluate the blobs.
    let z = blobs[0].challengeZ;
    // We start at i = 1, because z is initialised as the first blob's challenge.
    for (let i = 1; i < blobs.length; i++) {
      z = await poseidon2Hash([z, blobs[i].challengeZ]);
    }
    // Now we have a shared challenge for all blobs, evaluate them...
    const proofObjects = blobs.map(b => computeKzgProof(b.data, z.toBuffer()));
    const evaluations = proofObjects.map(([_, evaluation]) => BLS12Fr.fromBuffer(Buffer.from(evaluation)));
    // ...and find the challenge for the linear combination of blobs.
    let gamma = await hashNoirBigNumLimbs(evaluations[0]);
    // We start at i = 1, because gamma is initialised as the first blob's evaluation.
    for (let i = 1; i < blobs.length; i++) {
      gamma = await poseidon2Hash([gamma, await hashNoirBigNumLimbs(evaluations[i])]);
    }
    gamma = await poseidon2Hash([gamma, z]);

    return new FinalBlobBatchingChallenges(z, BLS12Fr.fromBN254Fr(gamma));
  }

  static async precomputeEmptyBatchedBlobChallenges(): Promise<FinalBlobBatchingChallenges> {
    const blobs = [await Blob.fromFields([])];
    // We need to precompute the final challenge values to evaluate the blobs.
    const z = blobs[0].challengeZ;
    // Now we have a shared challenge for all blobs, evaluate them...
    const proofObjects = blobs.map(b => computeKzgProof(b.data, z.toBuffer()));
    const evaluations = proofObjects.map(([_, evaluation]) => BLS12Fr.fromBuffer(Buffer.from(evaluation)));
    // ...and find the challenge for the linear combination of blobs.
    let gamma = await hashNoirBigNumLimbs(evaluations[0]);
    gamma = await poseidon2Hash([gamma, z]);

    return new FinalBlobBatchingChallenges(z, BLS12Fr.fromBN254Fr(gamma));
  }

  // Returns ethereum's versioned blob hash, following kzg_to_versioned_hash: https://eips.ethereum.org/EIPS/eip-4844#helpers
  getEthVersionedBlobHash(): Buffer {
    const hash = sha256(this.commitment.compress());
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  static getEthVersionedBlobHash(commitment: Buffer): Buffer {
    const hash = sha256(commitment);
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  /**
   * Returns a proof of opening of the blobs to verify on L1 using the point evaluation precompile:
   *
   * input[:32]     - versioned_hash
   * input[32:64]   - z
   * input[64:96]   - y
   * input[96:144]  - commitment C
   * input[144:192] - commitment Q (a 'proof' committing to the quotient polynomial q(X))
   *
   * See https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile
   */
  getEthBlobEvaluationInputs(): `0x${string}` {
    const buf = Buffer.concat([
      this.getEthVersionedBlobHash(),
      this.z.toBuffer(),
      this.y.toBuffer(),
      this.commitment.compress(),
      this.q.compress(),
    ]);
    return `0x${buf.toString('hex')}`;
  }
}

/**
 * Final values z and gamma are injected into each block root circuit. We ensure they are correct by:
 * - Checking equality in each block merge circuit and propagating up
 * - Checking final z_acc == z in root circuit
 * - Checking final gamma_acc == gamma in root circuit
 *
 *  - z = H(...H(H(z_0, z_1) z_2)..z_n)
 *    - where z_i = H(H(fields of blob_i), C_i),
 *    - used such that p_i(z) = y_i = Blob.evaluationY for all n blob polynomials p_i().
 *  - gamma = H(H(...H(H(y_0, y_1) y_2)..y_n), z)
 *    - used such that y = sum_i { gamma^i * y_i }, and C = sum_i { gamma^i * C_i }
 *      for all blob evaluations y_i (see above) and commitments C_i.
 *
 * Iteratively calculated by BlobAccumulatorPublicInputs.accumulate() in nr. See also precomputeBatchedBlobChallenges() above.
 */
export class FinalBlobBatchingChallenges {
  constructor(
    public readonly z: Fr,
    public readonly gamma: BLS12Fr,
  ) {}

  equals(other: FinalBlobBatchingChallenges) {
    return this.z.equals(other.z) && this.gamma.equals(other.gamma);
  }

  static empty(): FinalBlobBatchingChallenges {
    return new FinalBlobBatchingChallenges(Fr.ZERO, BLS12Fr.ZERO);
  }

  static fromBuffer(buffer: Buffer | BufferReader): FinalBlobBatchingChallenges {
    const reader = BufferReader.asReader(buffer);
    return new FinalBlobBatchingChallenges(Fr.fromBuffer(reader), reader.readObject(BLS12Fr));
  }

  toBuffer() {
    return serializeToBuffer(this.z, this.gamma);
  }
}

/**
 * See noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching_public_inputs.nr -> BlobAccumulatorPublicInputs
 */
export class BatchedBlobAccumulator {
  constructor(
    /** Hash of Cs (to link to L1 blob hashes). */
    public readonly blobCommitmentsHashAcc: Fr,
    /** Challenge point z_acc. Final value used such that p_i(z) = y_i. */
    public readonly zAcc: Fr,
    /** Evaluation y_acc. Final value is is linear combination of all evaluations y_i = p_i(z) with gamma. */
    public readonly yAcc: BLS12Fr,
    /** Commitment c_acc. Final value is linear combination of all commitments C_i = [p_i] with gamma. */
    public readonly cAcc: BLS12Point,
    /** KZG opening q_acc. Final value is linear combination of all blob kzg 'proofs' Q_i with gamma. */
    public readonly qAcc: BLS12Point,
    /**
     * Challenge point gamma_acc for multi opening. Used with y, C, and kzg 'proof' Q above.
     * TODO(#13608): We calculate this by hashing natively in the circuit (hence Fr representation), but it's actually used
     * as a BLS12Fr field elt. Is this safe? Is there a skew?
     */
    public readonly gammaAcc: Fr,
    /** Simply gamma^(i + 1) at blob i. Used for calculating the i'th element of the above linear comb.s */
    public readonly gammaPow: BLS12Fr,
    /** Final challenge values used in evaluation. Optimistically input and checked in the final acc. */
    public readonly finalBlobChallenges: FinalBlobBatchingChallenges,
  ) {}

  /**
   * Init the first accumulation state of the epoch.
   * We assume the input blob has not been evaluated at z.
   *
   * First state of the accumulator:
   * - v_acc := sha256(C_0)
   * - z_acc := z_0
   * - y_acc := gamma^0 * y_0 = y_0
   * - c_acc := gamma^0 * c_0 = c_0
   * - gamma_acc := poseidon2(y_0.limbs)
   * - gamma^(i + 1) = gamma^1 = gamma // denoted gamma_pow_acc
   *
   * TODO(MW): When moved to batching, we should ONLY evaluate individual blobs at z => won't need finalZ input.
   * @returns An initial blob accumulator.
   */
  static async initialize(
    blob: Blob,
    finalBlobChallenges: FinalBlobBatchingChallenges,
  ): Promise<BatchedBlobAccumulator> {
    const [q, evaluation] = computeKzgProof(blob.data, finalBlobChallenges.z.toBuffer());
    const firstY = BLS12Fr.fromBuffer(Buffer.from(evaluation));
    // Here, i = 0, so:
    return new BatchedBlobAccumulator(
      sha256ToField([blob.commitment]), // blobCommitmentsHashAcc = sha256(C_0)
      blob.challengeZ, // zAcc = z_0
      firstY, // yAcc = gamma^0 * y_0 = 1 * y_0
      BLS12Point.decompress(blob.commitment), // cAcc = gamma^0 * C_0 = 1 * C_0
      BLS12Point.decompress(Buffer.from(q)), // qAcc = gamma^0 * Q_0 = 1 * Q_0
      await hashNoirBigNumLimbs(firstY), // gammaAcc = poseidon2(y_0.limbs)
      finalBlobChallenges.gamma, // gammaPow = gamma^(i + 1) = gamma^1 = gamma
      finalBlobChallenges,
    );
  }

  /**
   * Create the empty accumulation state of the epoch.
   * @returns An empty blob accumulator with challenges.
   */
  static newWithChallenges(finalBlobChallenges: FinalBlobBatchingChallenges): BatchedBlobAccumulator {
    return new BatchedBlobAccumulator(
      Fr.ZERO,
      Fr.ZERO,
      BLS12Fr.ZERO,
      BLS12Point.ZERO,
      BLS12Point.ZERO,
      Fr.ZERO,
      BLS12Fr.ZERO,
      finalBlobChallenges,
    );
  }

  /**
   * Given blob i, accumulate all state.
   * We assume the input blob has not been evaluated at z.
   * TODO(MW): Currently returning new accumulator. May be better to mutate in future?
   * @returns An updated blob accumulator.
   */
  async accumulate(blob: Blob) {
    if (this.isEmptyState()) {
      return BatchedBlobAccumulator.initialize(blob, this.finalBlobChallenges);
    } else {
      const [q, evaluation] = computeKzgProof(blob.data, this.finalBlobChallenges.z.toBuffer());
      const thisY = BLS12Fr.fromBuffer(Buffer.from(evaluation));

      // Moving from i - 1 to i, so:
      return new BatchedBlobAccumulator(
        sha256ToField([this.blobCommitmentsHashAcc, blob.commitment]), // blobCommitmentsHashAcc := sha256(blobCommitmentsHashAcc, C_i)
        await poseidon2Hash([this.zAcc, blob.challengeZ]), // zAcc := poseidon2(zAcc, z_i)
        this.yAcc.add(thisY.mul(this.gammaPow)), // yAcc := yAcc + (gamma^i * y_i)
        this.cAcc.add(BLS12Point.decompress(blob.commitment).mul(this.gammaPow)), // cAcc := cAcc + (gamma^i * C_i)
        this.qAcc.add(BLS12Point.decompress(Buffer.from(q)).mul(this.gammaPow)), // qAcc := qAcc + (gamma^i * C_i)
        await poseidon2Hash([this.gammaAcc, await hashNoirBigNumLimbs(thisY)]), // gammaAcc := poseidon2(gammaAcc, poseidon2(y_i.limbs))
        this.gammaPow.mul(this.finalBlobChallenges.gamma), // gammaPow = gamma^(i + 1) = gamma^i * final_gamma
        this.finalBlobChallenges,
      );
    }
  }

  /**
   * Given blobs, accumulate all state.
   * We assume the input blobs have not been evaluated at z.
   * @returns An updated blob accumulator.
   */
  async accumulateBlobs(blobs: Blob[]) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let acc: BatchedBlobAccumulator = this; // TODO(MW): this.clone()
    for (let i = 0; i < blobs.length; i++) {
      acc = await acc.accumulate(blobs[i]);
    }
    return acc;
  }

  /**
   * Finalize accumulation state of the epoch.
   * We assume ALL blobs in the epoch have been accumulated.
   *
   * Final accumulated values:
   * - v := v_acc (hash of all commitments (C_i s) to be checked on L1)
   * - z := z_acc (final challenge, at which all blobs are evaluated)
   * - y := y_acc (final opening to be checked on L1)
   * - c := c_acc (final commitment to be checked on L1)
   * - gamma := poseidon2(gamma_acc, z) (challenge for linear combination of y and C, above)
   *
   * @returns A batched blob.
   */
  async finalize(): Promise<BatchedBlob> {
    // All values in acc are final, apart from gamma := poseidon2(gammaAcc, z):
    const calculatedGamma = await poseidon2Hash([this.gammaAcc, this.zAcc]);
    // Check final values:
    if (!this.zAcc.equals(this.finalBlobChallenges.z)) {
      throw new Error(
        `Blob batching mismatch: accumulated z ${this.zAcc} does not equal injected z ${this.finalBlobChallenges.z}`,
      );
    }
    if (!calculatedGamma.equals(this.finalBlobChallenges.gamma.toBN254Fr())) {
      throw new Error(
        `Blob batching mismatch: accumulated gamma ${calculatedGamma} does not equal injected gamma ${this.finalBlobChallenges.gamma.toBN254Fr()}`,
      );
    }
    if (!verifyKzgProof(this.cAcc.compress(), this.zAcc.toBuffer(), this.yAcc.toBuffer(), this.qAcc.compress())) {
      throw new Error(`KZG proof did not verify.`);
    }

    return new BatchedBlob(this.blobCommitmentsHashAcc, this.zAcc, this.yAcc, this.cAcc, this.qAcc);
  }

  /**
   * Converts to a struct for the public inputs of our rollup circuits.
   * @returns A BlobAccumulatorPublicInputs instance.
   */
  toBlobAccumulatorPublicInputs() {
    return new BlobAccumulatorPublicInputs(
      this.blobCommitmentsHashAcc,
      this.zAcc,
      this.yAcc,
      this.cAcc,
      this.gammaAcc,
      this.gammaPow,
    );
  }

  /**
   * Converts to a struct for the public inputs of our root rollup circuit.
   * Warning: MUST be final accumulator state.
   * @returns A FinalBlobAccumulatorPublicInputs instance.
   */
  toFinalBlobAccumulatorPublicInputs() {
    return new FinalBlobAccumulatorPublicInputs(this.blobCommitmentsHashAcc, this.zAcc, this.yAcc, this.cAcc);
  }

  isEmptyState() {
    return (
      this.blobCommitmentsHashAcc.isZero() &&
      this.zAcc.isZero() &&
      this.yAcc.isZero() &&
      this.cAcc.isZero() &&
      this.qAcc.isZero() &&
      this.gammaAcc.isZero() &&
      this.gammaPow.isZero()
    );
  }
}

// To mimic the hash accumulation in the rollup circuits, here we hash
// each u128 limb of the noir bignum struct representing the BLS field.
async function hashNoirBigNumLimbs(field: BLS12Field): Promise<Fr> {
  const num = field.toNoirBigNum();
  return await poseidon2Hash(num.limbs.map(Fr.fromHexString));
}
