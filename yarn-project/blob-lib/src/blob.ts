import { FIELDS_PER_BLOB } from '@aztec/constants';
import { BLS12Fr } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { computeBlobCommitment, computeChallengeZ, computeEthVersionedBlobHash } from './hash.js';
import type { BlobJson } from './interface.js';
import { BYTES_PER_BLOB, BYTES_PER_COMMITMENT, getKzg } from './kzg_context.js';

export { FIELDS_PER_BLOB };

/**
 * A class to create, manage, and prove EVM blobs.
 *
 * @dev Note: All methods in this class do not check the encoding of the given data. It's the responsibility of other
 * components to ensure that the blob data (which might spread across multiple blobs) was created following the protocol
 * and is correctly encoded.
 */
export class Blob {
  constructor(
    /**
     * The data to be broadcast on L1 in bytes form.
     */
    public readonly data: Uint8Array,
    /**
     * Commitment to the blob data. Used in compressed BLS12 point format (48 bytes).
     */
    public readonly commitment: Buffer,
  ) {
    if (data.length !== BYTES_PER_BLOB) {
      throw new Error(`Blob data must be ${BYTES_PER_BLOB} bytes. Got ${data.length}.`);
    }
    if (commitment.length !== BYTES_PER_COMMITMENT) {
      throw new Error(`Blob commitment must be ${BYTES_PER_COMMITMENT} bytes. Got ${commitment.length}.`);
    }
  }

  /**
   * Create a Blob from a buffer.
   * @param data - The buffer of the Blob.
   * @returns A Blob created from the buffer.
   *
   * @throws If data does not match the expected length (BYTES_PER_BLOB).
   */
  static async fromBlobBuffer(data: Uint8Array): Promise<Blob> {
    const commitment = await computeBlobCommitment(data);
    return new Blob(data, commitment);
  }

  /**
   * Create a Blob from an array of fields.
   *
   * @dev This method pads 0s to the data, extending it to the size of a full blob.
   *
   * @param fields - The array of fields to create the Blob from.
   * @returns A Blob created from the array of fields.
   */
  static async fromFields(fields: Fr[]): Promise<Blob> {
    if (fields.length > FIELDS_PER_BLOB) {
      throw new Error(`Attempted to overfill blob with ${fields.length} fields. The maximum is ${FIELDS_PER_BLOB}.`);
    }

    const data = Buffer.concat([serializeToBuffer(fields)], BYTES_PER_BLOB);
    const commitment = await computeBlobCommitment(data);
    return new Blob(data, commitment);
  }

  /**
   * Get the fields from the blob data.
   *
   * @dev WARNING: this method returns all fields
   *
   * @returns The fields from the blob.
   */
  toFields(): Fr[] {
    const reader = BufferReader.asReader(this.data);
    const numTotalFields = this.data.length / Fr.SIZE_IN_BYTES;
    return reader.readArray(numTotalFields, Fr);
  }

  /**
   * Create a Blob from a JSON object.
   *
   * Blobs will be in this form when requested from the blob client, or from
   * the beacon chain via `getBlobSidecars`
   * https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
   *
   * @param json - The JSON object to create the Blob from.
   * @returns A Blob created from the JSON object.
   */
  static async fromJson(json: BlobJson): Promise<Blob> {
    const blobBuffer = Buffer.from(json.blob.slice(2), 'hex');
    const blob = await Blob.fromBlobBuffer(blobBuffer);

    if (blob.commitment.toString('hex') !== json.kzg_commitment.slice(2)) {
      throw new Error('KZG commitment does not match');
    }

    return blob;
  }

  /**
   * Get the JSON representation of the blob.
   *
   * @returns The JSON representation of the blob.
   */
  toJSON(): BlobJson {
    return {
      blob: `0x${Buffer.from(this.data).toString('hex')}`,
      // eslint-disable-next-line camelcase
      kzg_commitment: `0x${this.commitment.toString('hex')}`,
    };
  }

  getEthVersionedBlobHash(): Buffer {
    return computeEthVersionedBlobHash(this.commitment);
  }

  /**
   * Challenge point z (= H(H(tx_effects), kzgCommitment)).
   * Used such that p(z) = y for a single blob, used as z_i in batching (see ./blob_batching.ts).
   */
  async computeChallengeZ(blobFieldsHash: Fr): Promise<Fr> {
    return await computeChallengeZ(blobFieldsHash, this.commitment);
  }

  /**
   * Evaluate the blob at a given challenge and return the evaluation and KZG proof.
   *
   * @param challengeZ - The challenge z at which to evaluate the blob.
   * @param verifyProof - Whether to verify the KZG proof.
   *
   * @returns
   *  y: BLS12Fr -  Evaluation y = p(z), where p() is the blob polynomial. BLS12 field element, rep. as BigNum in nr, bigint in ts.
   *  proof: Buffer - KZG opening proof for y = p(z). The commitment to quotient polynomial Q, used in compressed BLS12 point format (48 bytes).
   */
  async evaluate(challengeZ: Fr, verifyProof = false) {
    const kzg = getKzg();
    const res = await kzg.asyncComputeKzgProof(this.data, challengeZ.toBuffer());
    if (verifyProof && !kzg.verifyKzgProof(this.commitment, challengeZ.toBuffer(), res[1], res[0])) {
      throw new Error(`KZG proof did not verify.`);
    }

    const proof = Buffer.from(res[0]);
    const y = BLS12Fr.fromBuffer(Buffer.from(res[1]));
    return { y, proof };
  }

  /**
   * Get the buffer representation of the ENTIRE blob.
   *
   * @dev WARNING: this buffer contains all metadata as well as the data itself.
   *
   * @returns The buffer representation of the blob.
   */
  toBuffer(): Buffer {
    return Buffer.from(serializeToBuffer(this.data.length, this.data, this.commitment.length, this.commitment));
  }

  /**
   * Create a Blob from a buffer.
   *
   * @dev WARNING: this method contains all metadata as well as the data itself.
   *
   * @param buf - The buffer to create the Blob from.
   * @returns A Blob created from the buffer.
   */
  static fromBuffer(buf: Buffer | BufferReader): Blob {
    const reader = BufferReader.asReader(buf);
    return new Blob(reader.readUint8Array(), reader.readBuffer());
  }

  /**
   * Get the size of the blob in bytes
   */
  getSize() {
    return this.data.length;
  }

  static getViemKzgInstance() {
    const kzg = getKzg();
    return {
      blobToKzgCommitment: kzg.blobToKzgCommitment.bind(kzg),
      computeBlobKzgProof: kzg.computeBlobKzgProof.bind(kzg),
      computeCellsAndKzgProofs: (b: Uint8Array): [Uint8Array[], Uint8Array[]] => {
        const result = kzg.computeCellsAndKzgProofs(b);
        return [result.cells, result.proofs];
      },
    };
  }
}
