import { AZTEC_MAX_EPOCH_DURATION, BLOBS_PER_BLOCK } from '@aztec/constants';
import { poseidon2Hash, sha256, sha256ToField } from '@aztec/foundation/crypto';
import { BLS12Field, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';

// Importing directly from 'c-kzg' does not work, ignoring import/no-named-as-default-member err:
import cKzg from 'c-kzg';

import { Blob, VERSIONED_HASH_VERSION_KZG } from './blob.js';

/* eslint-disable import/no-named-as-default-member */
const { computeKzgProof, verifyKzgProof } = cKzg;

/**
 * A class to create, manage, and prove EVM blobs.
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
    const { z, gamma } = await this.precomputeBatchedBlobChallenges(blobs);
    // Now we have the precalculated values (z and gamma), we can create a multi opening proof of all input blobs:
    let acc = await BatchedBlobAccumulator.initialize(blobs[0], z, BLS12Fr.fromBN254Fr(gamma));
    // We start at i = 1, because we have initialized using the first blob:
    for (let i = 1; i < blobs.length; i++) {
      acc = await acc.accumulate(blobs[i]);
    }
    // All values in acc are final, apart from gamma := poseidon2(gammaAcc, z):
    const calculatedGamma = await poseidon2Hash([acc.gammaAcc, z]);
    // Check final values:
    if (!acc.zAcc.equals(z)) {
      throw new Error(`Blob batching mismatch: accumulated z ${acc.zAcc} does not equal injected z ${z}`);
    }
    if (!calculatedGamma.equals(gamma)) {
      throw new Error(
        `Blob batching mismatch: accumulated gamma ${calculatedGamma} does not equal injected gamma ${gamma}`,
      );
    }
    if (!verifyKzgProof(acc.cAcc.compress(), acc.zAcc.toBuffer(), acc.yAcc.toBuffer(), acc.qAcc.compress())) {
      throw new Error(`KZG proof did not verify.`);
    }

    return new BatchedBlob(acc.blobCommitmentsHashAcc, acc.zAcc, acc.yAcc, acc.cAcc, acc.qAcc);
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
  static async precomputeBatchedBlobChallenges(blobs: Blob[]): Promise<{ z: Fr; gamma: Fr }> {
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

    return { z, gamma };
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
 * See nr BlobAccumulatorPublicInputs for more info (TODO(MW): doc)
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
    /** Final challenge values used in evaluation. Optimistically input here and checked in the final acc. */
    public readonly finalZ: Fr,
    public readonly finalGamma: BLS12Fr,
  ) {}

  /**
   * Init the first accumulation state of the epoch.
   * We assume the input blob has not been evaluated at z.
   * TODO(MW): When moved to batching, we should ONLY evaluate individual blobs at z => won't need finalZ input.
   * @returns An initial blob accumulator.
   */
  static async initialize(blob: Blob, finalZ: Fr, finalGamma: BLS12Fr): Promise<BatchedBlobAccumulator> {
    const [q, evaluation] = computeKzgProof(blob.data, finalZ.toBuffer());
    const firstY = BLS12Fr.fromBuffer(Buffer.from(evaluation));
    // Here, i = 0, so:
    return new BatchedBlobAccumulator(
      sha256ToField([blob.commitment]), // blobCommitmentsHashAcc = sha256(C_0)
      blob.challengeZ, // zAcc = z_0
      firstY, // yAcc = gamma^0 * y_0 = 1 * y_0
      BLS12Point.decompress(blob.commitment), // cAcc = gamma^0 * C_0 = 1 * C_0
      BLS12Point.decompress(Buffer.from(q)), // qAcc = gamma^0 * Q_0 = 1 * Q_0
      await hashNoirBigNumLimbs(firstY), // gammaAcc = posiedon2(y_0.limbs)
      finalGamma, // gammaPow = gamma^(i + 1) = gamma^1 = gamma
      finalZ,
      finalGamma,
    );
  }

  /**
   * Given blob i, accumulate all state.
   * We assume the input blob has not been evaluated at z.
   * TODO(MW): Currently returning new accumulator. May be better to mutate in future?
   * @returns An updated blob accumulator.
   */
  async accumulate(blob: Blob) {
    const [q, evaluation] = computeKzgProof(blob.data, this.finalZ.toBuffer());
    const thisY = BLS12Fr.fromBuffer(Buffer.from(evaluation));

    // Moving from i - 1 to i, so:
    return new BatchedBlobAccumulator(
      sha256ToField([this.blobCommitmentsHashAcc, blob.commitment]), // blobCommitmentsHashAcc := sha256(blobCommitmentsHashAcc, C_i)
      await poseidon2Hash([this.zAcc, blob.challengeZ]), // zAcc := poseidon2(zAcc, z_i)
      this.yAcc.add(thisY.mul(this.gammaPow)), // yAcc := yAcc + (gamma^i * y_i)
      this.cAcc.add(BLS12Point.decompress(blob.commitment).mul(this.gammaPow)), // cAcc := cAcc + (gamma^i * C_i)
      this.qAcc.add(BLS12Point.decompress(Buffer.from(q)).mul(this.gammaPow)), // qAcc := qAcc + (gamma^i * C_i)
      await poseidon2Hash([this.gammaAcc, await hashNoirBigNumLimbs(thisY)]), // gammaAcc := poseidon2(gammaAcc, poseidon2(y_i.limbs))
      this.gammaPow.mul(this.finalGamma), // gammaPow = gamma^(i + 1) = gamma^i * final_gamma
      this.finalZ,
      this.finalGamma,
    );
  }
}

// To mimic the hash accumulation in the rollup circuits, here we hash
// each u128 limb of the noir bignum struct representing the BLS field.
async function hashNoirBigNumLimbs(field: BLS12Field): Promise<Fr> {
  const num = field.toNoirBigNum();
  return await poseidon2Hash(num.limbs.map(Fr.fromHexString));
}
