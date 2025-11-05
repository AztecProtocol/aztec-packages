import { AZTEC_MAX_EPOCH_DURATION, BLOBS_PER_BLOCK } from '@aztec/constants';
import { poseidon2Hash, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { computeBlobFieldsHashFromBlobs } from './blob_utils.js';
import { BlobAccumulator, FinalBlobAccumulator, FinalBlobBatchingChallenges } from './circuit_types/index.js';
import { computeEthVersionedBlobHash, hashNoirBigNumLimbs } from './hash.js';
import { kzg } from './kzg_context.js';

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
   * @dev MUST input all blobs to be broadcast. Does not work in multiple calls because z and gamma are calculated
   *      beforehand from ALL blobs.
   *
   * @returns A batched blob.
   */
  static async batch(blobs: Blob[][]): Promise<BatchedBlob> {
    if (blobs.length > AZTEC_MAX_EPOCH_DURATION) {
      throw new Error(
        `Too many blocks sent to batch(). The maximum is ${AZTEC_MAX_EPOCH_DURATION}. Got ${blobs.length}.`,
      );
    }

    // Precalculate the values (z and gamma) and initialize the accumulator:
    let acc = await this.newAccumulator(blobs);
    // Now we can create a multi opening proof of all input blobs:
    for (const blockBlobs of blobs) {
      acc = await acc.accumulateBlobs(blockBlobs);
    }
    return await acc.finalize();
  }

  /**
   * Returns an empty BatchedBlobAccumulator with precomputed challenges from all blobs in the epoch.
   * @dev MUST input all blobs to be broadcast. Does not work in multiple calls because z and gamma are calculated
   *      beforehand from ALL blobs.
   */
  static async newAccumulator(blobs: Blob[][]): Promise<BatchedBlobAccumulator> {
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
   *
   * @param blobs - The blobs to precompute the challenges for. Each sub-array is the blobs for an L1 block.
   * @returns Challenges z and gamma.
   */
  static async precomputeBatchedBlobChallenges(blobs: Blob[][]): Promise<FinalBlobBatchingChallenges> {
    // Compute the final challenge z to evaluate the blobs.
    let z: Fr | undefined;
    for (const blockBlobs of blobs) {
      // Compute the hash of all the fields in the block.
      const blobFieldsHash = await computeBlobFieldsHashFromBlobs(blockBlobs);
      for (const blob of blockBlobs) {
        // Compute the challenge z for each blob and accumulate it.
        const challengeZ = await blob.computeChallengeZ(blobFieldsHash);
        if (!z) {
          z = challengeZ;
        } else {
          z = await poseidon2Hash([z, challengeZ]);
        }
      }
    }
    if (!z) {
      throw new Error('No blobs to precompute challenges for.');
    }

    // Now we have a shared challenge for all blobs, evaluate them...
    const allBlobs = blobs.flat();
    const proofObjects = allBlobs.map(b => b.evaluate(z));
    const evaluations = await Promise.all(proofObjects.map(({ y }) => hashNoirBigNumLimbs(y)));
    // ...and find the challenge for the linear combination of blobs.
    let gamma = evaluations[0];
    // We start at i = 1, because gamma is initialized as the first blob's evaluation.
    for (let i = 1; i < allBlobs.length; i++) {
      gamma = await poseidon2Hash([gamma, evaluations[i]]);
    }
    gamma = await poseidon2Hash([gamma, z]);

    return new FinalBlobBatchingChallenges(z, BLS12Fr.fromBN254Fr(gamma));
  }

  verify() {
    return kzg.verifyKzgProof(this.commitment.compress(), this.z.toBuffer(), this.y.toBuffer(), this.q.compress());
  }

  // Returns ethereum's versioned blob hash, following kzg_to_versioned_hash: https://eips.ethereum.org/EIPS/eip-4844#helpers
  getEthVersionedBlobHash(): Buffer {
    return computeEthVersionedBlobHash(this.commitment.compress());
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

  toFinalBlobAccumulator() {
    return new FinalBlobAccumulator(this.blobCommitmentsHash, this.z, this.y, this.commitment);
  }
}

/**
 * See noir-projects/noir-protocol-circuits/crates/blob/src/abis/blob_accumulator.nr
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
   * @returns An updated blob accumulator.
   */
  private async accumulate(blob: Blob, blobFieldsHash: Fr) {
    const { proof, y: thisY } = blob.evaluate(this.finalBlobChallenges.z);
    const thisC = BLS12Point.decompress(blob.commitment);
    const thisQ = BLS12Point.decompress(proof);
    const blobChallengeZ = await blob.computeChallengeZ(blobFieldsHash);

    if (this.isEmptyState()) {
      /**
       * Init the first accumulation state of the epoch.
       * - v_acc := sha256(C_0)
       * - z_acc := z_0
       * - y_acc := gamma^0 * y_0 = y_0
       * - c_acc := gamma^0 * c_0 = c_0
       * - gamma_acc := poseidon2(y_0.limbs)
       * - gamma^(i + 1) = gamma^1 = gamma // denoted gamma_pow_acc
       */
      return new BatchedBlobAccumulator(
        sha256ToField([blob.commitment]), // blobCommitmentsHashAcc = sha256(C_0)
        blobChallengeZ, // zAcc = z_0
        thisY, // yAcc = gamma^0 * y_0 = 1 * y_0
        thisC, // cAcc = gamma^0 * C_0 = 1 * C_0
        thisQ, // qAcc = gamma^0 * Q_0 = 1 * Q_0
        await hashNoirBigNumLimbs(thisY), // gammaAcc = poseidon2(y_0.limbs)
        this.finalBlobChallenges.gamma, // gammaPow = gamma^(i + 1) = gamma^1 = gamma
        this.finalBlobChallenges,
      );
    } else {
      // Moving from i - 1 to i, so:
      return new BatchedBlobAccumulator(
        sha256ToField([this.blobCommitmentsHashAcc, blob.commitment]), // blobCommitmentsHashAcc := sha256(blobCommitmentsHashAcc, C_i)
        await poseidon2Hash([this.zAcc, blobChallengeZ]), // zAcc := poseidon2(zAcc, z_i)
        this.yAcc.add(thisY.mul(this.gammaPow)), // yAcc := yAcc + (gamma^i * y_i)
        this.cAcc.add(thisC.mul(this.gammaPow)), // cAcc := cAcc + (gamma^i * C_i)
        this.qAcc.add(thisQ.mul(this.gammaPow)), // qAcc := qAcc + (gamma^i * C_i)
        await poseidon2Hash([this.gammaAcc, await hashNoirBigNumLimbs(thisY)]), // gammaAcc := poseidon2(gammaAcc, poseidon2(y_i.limbs))
        this.gammaPow.mul(this.finalBlobChallenges.gamma), // gammaPow = gamma^(i + 1) = gamma^i * final_gamma
        this.finalBlobChallenges,
      );
    }
  }

  /**
   * Given blobs, accumulate all state.
   * We assume the input blobs have not been evaluated at z.
   * @param blobs - The blobs to accumulate. They should be in the same L1 block.
   * @returns An updated blob accumulator.
   */
  async accumulateBlobs(blobs: Blob[]) {
    if (blobs.length > BLOBS_PER_BLOCK) {
      throw new Error(
        `Too many blobs to accumulate. The maximum is ${BLOBS_PER_BLOCK} per block. Got ${blobs.length}.`,
      );
    }

    // Compute the hash of all the fields in the block.
    const blobFieldsHash = await computeBlobFieldsHashFromBlobs(blobs);

    // Initialize the acc to iterate over:
    let acc: BatchedBlobAccumulator = this.clone();
    for (const blob of blobs) {
      acc = await acc.accumulate(blob, blobFieldsHash);
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
   * @param verifyProof - Whether to verify the KZG proof.
   * @returns A batched blob.
   */
  async finalize(verifyProof = false): Promise<BatchedBlob> {
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

    const batchedBlob = new BatchedBlob(this.blobCommitmentsHashAcc, this.zAcc, this.yAcc, this.cAcc, this.qAcc);

    if (verifyProof && !batchedBlob.verify()) {
      throw new Error(`KZG proof did not verify.`);
    }

    return batchedBlob;
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

  clone() {
    return new BatchedBlobAccumulator(
      Fr.fromBuffer(this.blobCommitmentsHashAcc.toBuffer()),
      Fr.fromBuffer(this.zAcc.toBuffer()),
      BLS12Fr.fromBuffer(this.yAcc.toBuffer()),
      BLS12Point.fromBuffer(this.cAcc.toBuffer()),
      BLS12Point.fromBuffer(this.qAcc.toBuffer()),
      Fr.fromBuffer(this.gammaAcc.toBuffer()),
      BLS12Fr.fromBuffer(this.gammaPow.toBuffer()),
      FinalBlobBatchingChallenges.fromBuffer(this.finalBlobChallenges.toBuffer()),
    );
  }

  toBlobAccumulator() {
    return new BlobAccumulator(
      this.blobCommitmentsHashAcc,
      this.zAcc,
      this.yAcc,
      this.cAcc,
      this.gammaAcc,
      this.gammaPow,
    );
  }

  toFinalBlobAccumulator() {
    return new FinalBlobAccumulator(this.blobCommitmentsHashAcc, this.zAcc, this.yAcc, this.cAcc);
  }
}
