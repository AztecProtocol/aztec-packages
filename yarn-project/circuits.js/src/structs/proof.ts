import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { AGGREGATION_OBJECT_LENGTH } from '../constants.gen.js';

const EMPTY_PROOF_SIZE = 42;

/**
 * The Proof class is a wrapper around the circuits proof.
 * Underlying it is a buffer of proof data in a form a barretenberg prover understands.
 * It provides methods to easily create, serialize, and deserialize the proof data for efficient
 * communication and storage.
 */
export class Proof {
  // Make sure this type is not confused with other buffer wrappers
  readonly __proofBrand: any;

  // Honk proofs start with a 4 byte length prefix
  // the proof metadata starts immediately after
  private readonly metadataOffset = 4;
  // the metadata is 3 Frs long
  // the public inputs are after it
  private readonly publicInputsOffset = 100;

  constructor(
    /**
     * Holds the serialized proof data in a binary buffer format.
     */
    public buffer: Buffer,

    public numPublicInputs: number,
  ) {}

  /**
   * Create a Proof from a Buffer or BufferReader.
   * Expects a length-encoding.
   *
   * @param buffer - A Buffer or BufferReader containing the length-encoded proof data.
   * @returns A Proof instance containing the decoded proof data.
   */
  static fromBuffer(buffer: Buffer | BufferReader): Proof {
    const reader = BufferReader.asReader(buffer);
    const size = reader.readNumber();
    const buf = reader.readBytes(size);
    const numPublicInputs = reader.readNumber();
    return new Proof(buf, numPublicInputs);
  }

  /**
   * Convert the Proof instance to a custom Buffer format.
   * This function serializes the Proof's buffer length and data sequentially into a new Buffer.
   *
   * @returns A Buffer containing the serialized proof data in custom format.
   */
  public toBuffer() {
    return serializeToBuffer(this.buffer.length, this.buffer, this.numPublicInputs);
  }

  /**
   * Serialize the Proof instance to a hex string.
   * @returns The hex string representation of the proof data.
   */
  public toString() {
    return bufferToHex(this.toBuffer());
  }

  public withoutPublicInputs(): Buffer {
    return Buffer.concat([
      this.buffer.subarray(this.metadataOffset, this.publicInputsOffset),
      this.buffer.subarray(this.publicInputsOffset + Fr.SIZE_IN_BYTES * this.numPublicInputs),
    ]);
  }

  public extractPublicInputs(): Fr[] {
    const reader = BufferReader.asReader(
      this.buffer.subarray(this.publicInputsOffset, this.publicInputsOffset + Fr.SIZE_IN_BYTES * this.numPublicInputs),
    );
    return reader.readArray(this.numPublicInputs, Fr);
  }

  public extractAggregationObject(): Fr[] {
    const publicInputs = this.extractPublicInputs();
    return publicInputs.slice(-1 * AGGREGATION_OBJECT_LENGTH);
  }

  /**
   * Deserialize a Proof instance from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns - A new Proof instance.
   */
  static fromString(str: string) {
    return Proof.fromBuffer(hexToBuffer(str));
  }

  /** Returns whether this proof is actually empty. */
  public isEmpty() {
    return (
      this.buffer.length === EMPTY_PROOF_SIZE && this.buffer.every(byte => byte === 0) && this.numPublicInputs === 0
    );
  }

  /** Returns an empty proof. */
  static empty() {
    return makeEmptyProof();
  }
}

/**
 * Makes an empty proof.
 * Note: Used for local devnet milestone where we are not proving anything yet.
 * @returns The empty "proof".
 */
export function makeEmptyProof() {
  return new Proof(Buffer.alloc(EMPTY_PROOF_SIZE, 0), 0);
}
