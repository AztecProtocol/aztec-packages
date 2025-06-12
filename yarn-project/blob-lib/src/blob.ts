import { poseidon2Hash, sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

// Importing directly from 'c-kzg' does not work:
import cKzg from 'c-kzg';
import type { Blob as BlobBuffer } from 'c-kzg';

import { deserializeEncodedBlobToFields, extractBlobFieldsFromBuffer } from './encoding.js';
import { BlobDeserializationError } from './errors.js';
import type { BlobJson } from './interface.js';

const { BYTES_PER_BLOB, FIELD_ELEMENTS_PER_BLOB, blobToKzgCommitment, computeKzgProof, verifyKzgProof } = cKzg;

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
    /** Challenge point z (= H(H(tx_effects), kzgCommmitment). Used such that p(z) = y for a single blob, used as z_i in batching (see ./blob_batching.ts). */
    public readonly challengeZ: Fr,
    /** Commitment to the blob C. Used in compressed BLS12 point format (48 bytes). */
    public readonly commitment: Buffer,
  ) {}

  /**
   * The encoded version of the blob will determine the end of the blob based on the transaction encoding.
   * This is required when the fieldsHash of a blob will contain trailing zeros.
   *
   * See `./encoding.ts` for more details.
   *
   * This method is used to create a Blob from a buffer.
   * @param blob - The buffer to create the Blob from.
   * @param multiBlobFieldsHash - The fields hash to use for the Blob.
   * @returns A Blob created from the buffer.
   *
   * @throws If unable to deserialize the blob.
   */
  static fromEncodedBlobBuffer(blob: BlobBuffer, multiBlobFieldsHash?: Fr): Promise<Blob> {
    try {
      const fields: Fr[] = deserializeEncodedBlobToFields(blob);
      return Blob.fromFields(fields, multiBlobFieldsHash);
    } catch {
      throw new BlobDeserializationError(
        `Failed to create Blob from encoded blob buffer, this blob was likely not created by us`,
      );
    }
  }

  /**
   * Create a Blob from an array of fields.
   *
   * @param fields - The array of fields to create the Blob from.
   * @param multiBlobFieldsHash - The fields hash to use for the Blob.
   * @returns A Blob created from the array of fields.
   */
  static async fromFields(fields: Fr[], multiBlobFieldsHash?: Fr): Promise<Blob> {
    if (fields.length > FIELD_ELEMENTS_PER_BLOB) {
      throw new Error(
        `Attempted to overfill blob with ${fields.length} elements. The maximum is ${FIELD_ELEMENTS_PER_BLOB}`,
      );
    }

    const data = Buffer.concat([serializeToBuffer(fields)], BYTES_PER_BLOB);

    // This matches the output of SpongeBlob.squeeze() in the blob circuit
    const fieldsHash = multiBlobFieldsHash ? multiBlobFieldsHash : await poseidon2Hash(fields);
    const commitment = Buffer.from(blobToKzgCommitment(data));
    const challengeZ = await poseidon2Hash([fieldsHash, ...commitmentToFields(commitment)]);

    return new Blob(data, fieldsHash, challengeZ, commitment);
  }

  /**
   * Create a Blob from a JSON object.
   *
   * Blobs will be in this form when requested from the blob sink, or from
   * the beacon chain via `getBlobSidecars`
   * https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
   *
   * @dev WARNING: by default json deals with encoded buffers
   *
   * @param json - The JSON object to create the Blob from.
   * @returns A Blob created from the JSON object.
   */
  static async fromJson(json: BlobJson): Promise<Blob> {
    const blobBuffer = Buffer.from(json.blob.slice(2), 'hex');

    const blob = await Blob.fromEncodedBlobBuffer(blobBuffer);

    if (blob.commitment.toString('hex') !== json.kzg_commitment.slice(2)) {
      throw new Error('KZG commitment does not match');
    }

    // We do not check the proof, as it will be different if the challenge is shared
    // across multiple blobs

    return blob;
  }

  /**
   * Get the JSON representation of the blob.
   *
   * @dev WARNING: by default json deals with encoded buffers
   * @param index - optional - The index of the blob in the block.
   * @returns The JSON representation of the blob.
   */
  toJson(index: number): BlobJson {
    return {
      blob: `0x${Buffer.from(this.data).toString('hex')}`,
      index: index.toString(),
      // eslint-disable-next-line camelcase
      kzg_commitment: `0x${this.commitment.toString('hex')}`,
    };
  }

  /**
   * Get the fields from the blob.
   *
   * @dev WARNING: this method does not take into account trailing zeros
   *
   * @returns The fields from the blob.
   */
  toFields(): Fr[] {
    return extractBlobFieldsFromBuffer(this.data);
  }

  /**
   * Get the encoded fields from the blob.
   *
   * @dev This method takes into account trailing zeros
   *
   * @returns The encoded fields from the blob.
   *
   * @throws If unable to deserialize the blob.
   */
  toEncodedFields(): Fr[] {
    try {
      return deserializeEncodedBlobToFields(this.data);
    } catch {
      throw new BlobDeserializationError(
        `Failed to deserialize encoded blob fields, this blob was likely not created by us`,
      );
    }
  }

  /**
   * Get the encoded fields from multiple blobs.
   *
   * @dev This method takes into account trailing zeros
   *
   * @returns The encoded fields from the blobs.
   */
  static toEncodedFields(blobs: Blob[]): Fr[] {
    try {
      return deserializeEncodedBlobToFields(Buffer.concat(blobs.map(b => b.data)));
    } catch {
      throw new BlobDeserializationError(
        `Failed to deserialize encoded blob fields, this blob was likely not created by us`,
      );
    }
  }

  /**
   * Get the commitment fields from the blob.
   *
   * The 48-byte commitment is encoded into two field elements:
   * +------------------+------------------+
   * | Field Element 1  | Field Element 2  |
   * | [bytes 0-31]     | [bytes 32-47]   |
   * +------------------+------------------+
   * |     32 bytes     |     16 bytes    |
   * +------------------+------------------+
   * @returns The commitment fields from the blob.
   */
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

  /**
   * Evaluate the blob at a given challenge and return the evaluation and KZG proof.
   *
   * @param challengeZ - The challenge z at which to evaluate the blob. If not given, assume we want to evaluate at the individual blob's z.
   *
   * @returns -
   *  y: Buffer -  Evaluation y = p(z), where p() is the blob polynomial. BLS12 field element, rep. as BigNum in nr, bigint in ts
   *  proof: Buffer - KZG opening proof for y = p(z). The commitment to quotient polynomial Q, used in compressed BLS12 point format (48 bytes).
   */
  evaluate(challengeZ?: Fr) {
    const z = challengeZ || this.challengeZ;
    const res = computeKzgProof(this.data, z.toBuffer());
    if (!verifyKzgProof(this.commitment, z.toBuffer(), res[1], res[0])) {
      throw new Error(`KZG proof did not verify.`);
    }
    const proof = Buffer.from(res[0]);
    const y = Buffer.from(res[1]);
    return { y, proof };
  }

  /**
   * Get the buffer representation of the ENTIRE blob.
   *
   * @dev WARNING: this buffer contains all metadata aswell as the data itself
   *
   * @returns The buffer representation of the blob.
   */
  toBuffer(): Buffer {
    return Buffer.from(
      serializeToBuffer(
        this.data.length,
        this.data,
        this.fieldsHash,
        this.challengeZ,
        this.commitment.length,
        this.commitment,
      ),
    );
  }

  /**
   * Create a Blob from a buffer.
   *
   * @dev WARNING: this method contains all metadata aswell as the data itself
   *
   * @param buf - The buffer to create the Blob from.
   * @returns A Blob created from the buffer.
   */
  static fromBuffer(buf: Buffer | BufferReader): Blob {
    const reader = BufferReader.asReader(buf);
    return new Blob(reader.readUint8Array(), reader.readObject(Fr), reader.readObject(Fr), reader.readBuffer());
  }

  /**
   * Get the size of the blob in bytes
   */
  getSize() {
    return this.data.length;
  }

  /**
   * @param blobs - The blobs to emit
   * @returns The blobs' compressed commitments in hex prefixed by the number of blobs
   * @dev Used for proposing blocks to validate injected blob commitments match real broadcast blobs:
   * One byte for the number blobs + 48 bytes per blob commitment
   */
  static getPrefixedEthBlobCommitments(blobs: Blob[]): `0x${string}` {
    let buf = Buffer.alloc(0);
    blobs.forEach(blob => {
      buf = Buffer.concat([buf, blob.commitment]);
    });
    // We prefix the number of blobs:
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

  /**
   * @param fields - Fields to broadcast in the blob(s)
   * @returns As many blobs as we require to broadcast the given fields for a block
   * @dev Assumes we share the fields hash between all blobs which can only be done for ONE BLOCK because the hash is calculated in block root.
   */
  static async getBlobsPerBlock(fields: Fr[]): Promise<Blob[]> {
    const numBlobs = Math.max(Math.ceil(fields.length / FIELD_ELEMENTS_PER_BLOB), 1);
    const multiBlobFieldsHash = await poseidon2Hash(fields);
    const res = [];
    for (let i = 0; i < numBlobs; i++) {
      const end = fields.length < (i + 1) * FIELD_ELEMENTS_PER_BLOB ? fields.length : (i + 1) * FIELD_ELEMENTS_PER_BLOB;
      res.push(await Blob.fromFields(fields.slice(i * FIELD_ELEMENTS_PER_BLOB, end), multiBlobFieldsHash));
    }
    return res;
  }
}

// 48 bytes encoded in fields as [Fr, Fr] = [0->31, 31->48]
function commitmentToFields(commitment: Buffer): [Fr, Fr] {
  return [new Fr(commitment.subarray(0, 31)), new Fr(commitment.subarray(31, 48))];
}
