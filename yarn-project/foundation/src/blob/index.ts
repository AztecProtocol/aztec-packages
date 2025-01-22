import cKzg from 'c-kzg';
import type { Blob as BlobBuffer } from 'c-kzg';

import { poseidon2Hash, sha256 } from '../crypto/index.js';
import { Fr } from '../fields/index.js';
import { BufferReader, serializeToBuffer } from '../serialize/index.js';

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

// The prefix to the EVM blobHash, defined here: https://eips.ethereum.org/EIPS/eip-4844#specification
export const VERSIONED_HASH_VERSION_KZG = 0x01;

/**
 * A class to create, manage, and prove EVM blobs.
 */
export class Blob {
  constructor(
    /** The blob to be broadcast on L1 in bytes form. */
    public readonly data: BlobBuffer,
    /** The hash of all tx effects inside the blob. Used in generating the challenge z and proving that we have included all required effects. */
    public readonly fieldsHash: Fr,
    /** Challenge point z (= H(H(tx_effects), kzgCommmitment). Used such that p(z) = y. */
    public readonly challengeZ: Fr,
    /** Evaluation y = p(z), where p() is the blob polynomial. BLS12 field element, rep. as BigNum in nr, bigint in ts. */
    public readonly evaluationY: Buffer,
    /** Commitment to the blob C. Used in compressed BLS12 point format (48 bytes). */
    public readonly commitment: Buffer,
    /** KZG opening proof for y = p(z). The commitment to quotient polynomial Q, used in compressed BLS12 point format (48 bytes). */
    public readonly proof: Buffer,
  ) {}

  static fromFields(fields: Fr[], multiBlobFieldsHash?: Fr): Blob {
    if (fields.length > FIELD_ELEMENTS_PER_BLOB) {
      throw new Error(
        `Attempted to overfill blob with ${fields.length} elements. The maximum is ${FIELD_ELEMENTS_PER_BLOB}`,
      );
    }
    const dataWithoutZeros = serializeToBuffer(fields);
    const data = Buffer.concat([dataWithoutZeros], BYTES_PER_BLOB);

    // This matches the output of SpongeBlob.squeeze() in the blob circuit
    const fieldsHash = multiBlobFieldsHash ? multiBlobFieldsHash : poseidon2Hash(fields);
    const commitment = Buffer.from(blobToKzgCommitment(data));
    const challengeZ = poseidon2Hash([fieldsHash, ...commitmentToFields(commitment)]);
    const res = computeKzgProof(data, challengeZ.toBuffer());
    if (!verifyKzgProof(commitment, challengeZ.toBuffer(), res[1], res[0])) {
      throw new Error(`KZG proof did not verify.`);
    }
    const proof = Buffer.from(res[0]);
    const evaluationY = Buffer.from(res[1]);

    return new Blob(dataWithoutZeros, fieldsHash, challengeZ, evaluationY, commitment, proof);
  }

  // 48 bytes encoded in fields as [Fr, Fr] = [0->31, 31->48]
  commitmentToFields(): [Fr, Fr] {
    return commitmentToFields(this.commitment);
  }

  // Returns ethereum's versioned blob hash, following kzg_to_versioned_hash: https://eips.ethereum.org/EIPS/eip-4844#helpers
  getEthVersionedBlobHash(): Buffer {
    const hash = sha256(this.commitment);
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  static getEthVersionedBlobHash(commitment: Buffer): Buffer {
    const hash = sha256(commitment);
    hash[0] = VERSIONED_HASH_VERSION_KZG;
    return hash;
  }

  toBuffer(): Buffer {
    return Buffer.from(
      serializeToBuffer(
        this.data.length,
        this.data,
        this.fieldsHash,
        this.challengeZ,
        this.evaluationY.length,
        this.evaluationY,
        this.commitment.length,
        this.commitment,
        this.proof.length,
        this.proof,
      ),
    );
  }

  static fromBuffer(buf: Buffer | BufferReader): Blob {
    const reader = BufferReader.asReader(buf);
    return new Blob(
      reader.readUint8Array(),
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readBuffer(),
      reader.readBuffer(),
      reader.readBuffer(),
    );
  }

  /**
   * Pad the blob data to it's full size before posting
   */
  get dataWithZeros(): BlobBuffer {
    return Buffer.concat([this.data], BYTES_PER_BLOB);
  }

  /**
   * Get the size of the blob in bytes
   */
  getSize() {
    return this.data.length;
  }

  // Returns a proof of opening of the blob to verify on L1 using the point evaluation precompile:
  //  * input[:32]     - versioned_hash
  //  * input[32:64]   - z
  //  * input[64:96]   - y
  //  * input[96:144]  - commitment C
  //  * input[144:192] - proof (a commitment to the quotient polynomial q(X))
  // See https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile
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

  static getEthBlobEvaluationInputs(blobs: Blob[]): `0x${string}` {
    let buf = Buffer.alloc(0);
    blobs.forEach(blob => {
      buf = Buffer.concat([
        buf,
        blob.getEthVersionedBlobHash(),
        blob.challengeZ.toBuffer(),
        blob.evaluationY,
        blob.commitment,
        blob.proof,
      ]);
    });
    // For multiple blobs, we prefix the number of blobs:
    const lenBuf = Buffer.alloc(1);
    lenBuf.writeUint8(blobs.length);
    buf = Buffer.concat([lenBuf, buf]);
    return `0x${buf.toString('hex')}`;
  }

  static getViemKzgInstance() {
    return {
      blobToKzgCommitment: cKzg.blobToKzgCommitment,
      computeBlobKzgProof: cKzg.computeBlobKzgProof,
    };
  }

  // Returns as many blobs as we require to broadcast the given fields
  // Assumes we share the fields hash between all blobs
  static getBlobs(fields: Fr[]): Blob[] {
    const numBlobs = Math.max(Math.ceil(fields.length / FIELD_ELEMENTS_PER_BLOB), 1);
    const multiBlobFieldsHash = poseidon2Hash(fields);
    const res = [];
    for (let i = 0; i < numBlobs; i++) {
      const end = fields.length < (i + 1) * FIELD_ELEMENTS_PER_BLOB ? fields.length : (i + 1) * FIELD_ELEMENTS_PER_BLOB;
      res.push(Blob.fromFields(fields.slice(i * FIELD_ELEMENTS_PER_BLOB, end), multiBlobFieldsHash));
    }
    return res;
  }
}

// 48 bytes encoded in fields as [Fr, Fr] = [0->31, 31->48]
function commitmentToFields(commitment: Buffer): [Fr, Fr] {
  return [new Fr(commitment.subarray(0, 31)), new Fr(commitment.subarray(31, 48))];
}
