import cKzg from 'c-kzg';
import type { Blob as BlobBuffer } from 'c-kzg';

import { poseidon2Hash, sha256 } from '../crypto/index.js';
import { Fr } from '../fields/index.js';
import { serializeToBuffer } from '../serialize/index.js';

// Importing directly from 'c-kzg' does not work, ignoring import/no-named-as-default-member err:
/* eslint-disable import/no-named-as-default-member */

const {
  BYTES_PER_BLOB,
  FIELD_ELEMENTS_PER_BLOB,
  blobToKzgCommitment,
  computeKzgProof,
  loadTrustedSetup,
  verifyKzgProof,
} = cKzg;

try {
  loadTrustedSetup();
} catch (error: any) {
  if (error.message.includes('trusted setup is already loaded')) {
    // NB: The c-kzg lib has no way of checking whether the setup is loaded or not,
    // and it throws an error if it's already loaded, even though nothing is wrong.
    // This is a rudimentary way of ensuring we load the trusted setup if we need it.
  } else {
    throw new Error(error);
  }
}
const VERSIONED_HASH_VERSION_KZG = 0x01;
/**
 * First run at a simple blob class TODO: Test a lot
 */
export class Blob {
  /** The blob to be broadcast on L1 in bytes form. */
  public readonly data: BlobBuffer;
  /** The hash of all tx effects inside the blob. Used in generating the challenge z and proving that we have included all required effects. */
  public readonly txsEffectsHash: Fr;
  /** Challenge point z (= H(H(tx_effects), kzgCommmitment). Used such that p(z) = y. */
  public readonly challengeZ: Fr;
  /** Evaluation y = p(z), where p() is the blob polynomial. BLS12 field element, rep. as BigNum in nr, bigint in ts. */
  public readonly evaluationY: Buffer;
  /** Commitment to the blob C. Used in compressed BLS12 point format (48 bytes). */
  public readonly commitment: Buffer;
  /** KZG opening proof for y = p(z). The commitment to quotient polynomial Q, used in compressed BLS12 point format (48 bytes). */
  public readonly proof: Buffer;

  constructor(
    /** All tx effects to be broadcast in the blob. */
    txEffects: Fr[],
  ) {
    if (txEffects.length > FIELD_ELEMENTS_PER_BLOB) {
      throw new Error(
        `Attempted to overfill blob with ${txEffects.length} elements. The maximum is ${FIELD_ELEMENTS_PER_BLOB}`,
      );
    }
    this.data = Buffer.concat([serializeToBuffer(txEffects)], BYTES_PER_BLOB);
    // This matches the output of SpongeBlob.squeeze() in the blob circuit
    this.txsEffectsHash = poseidon2Hash(txEffects);
    this.commitment = Buffer.from(blobToKzgCommitment(this.data));
    this.challengeZ = poseidon2Hash([this.txsEffectsHash, ...this.commitmentToFields()]);
    const res = computeKzgProof(this.data, this.challengeZ.toBuffer());
    if (!verifyKzgProof(this.commitment, this.challengeZ.toBuffer(), res[1], res[0])) {
      throw new Error(`KZG proof did not verify.`);
    }
    this.proof = Buffer.from(res[0]);
    this.evaluationY = Buffer.from(res[1]);
  }

  commitmentToFields(): [Fr, Fr] {
    return [new Fr(this.commitment.subarray(0, 31)), new Fr(this.commitment.subarray(31, 48))];
  }

  // Returns ethereum's versioned blob hash, following kzg_to_versioned_hash
  getEthVersionedBlobHash(): Buffer {
    const hash = sha256(this.commitment);
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  // Returns a proof of opening of the blob to verify on L1 using the point evaluation precompile:
  //  * input[:32]     - versioned_hash
  //  * input[32:64]   - z
  //  * input[64:96]   - y
  //  * input[96:144]  - commitment C
  //  * input[144:192] - proof (a commitment to the quotient polynomial q(X))
  getEthBlobEvaluationInputs(): `0x${string}` {
    const buf = Buffer.concat([
      this.getEthVersionedBlobHash(),
      this.challengeZ.toBuffer(),
      this.evaluationY,
      this.commitment,
      this.proof,
    ]);
    return `0x${buf.toString('hex')}`;
  }
}
