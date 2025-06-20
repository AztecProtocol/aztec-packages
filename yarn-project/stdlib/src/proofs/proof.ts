import { PAIRING_POINTS_SIZE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { strict as assert } from 'assert';

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

  /**
   * Returns the proof without the public inputs, but includes the pairing point object as part of the proof.
   * @returns Proof in bytes form, including the pairing point object at the start.
   */
  public withoutPublicInputs(): Buffer {
    if (this.isEmpty()) {
      return this.buffer;
    }
    // We are indexing to this particular size because we are assuming the proof buffer looks like:
    // [binary public inputs, binary proof]
    // Here, we are assuming the pairing point object is the last 16 fields of the public inputs.
    assert(this.numPublicInputs >= PAIRING_POINTS_SIZE, 'Proof does not contain an aggregation object');
    const proofStart = Fr.SIZE_IN_BYTES * (this.numPublicInputs - PAIRING_POINTS_SIZE);
    assert(this.buffer.length >= proofStart, 'Proof buffer is not appropriately sized to call withoutPublicInputs()');
    return this.buffer.subarray(proofStart);
  }

  // This function assumes that the proof will contain an aggregation object and look something like:
  // [binary public inputs, aggregation object, rest of proof]
  // We are extracting the binary public inputs and reading them as Frs.
  public extractPublicInputs(): Fr[] {
    if (this.isEmpty()) {
      // return array of this.numPublicInputs 0s
      return new Array(this.numPublicInputs).fill(Fr.zero());
    }
    assert(this.numPublicInputs >= PAIRING_POINTS_SIZE, 'Proof does not contain an aggregation object');
    const numInnerPublicInputs = this.numPublicInputs - PAIRING_POINTS_SIZE;
    const reader = BufferReader.asReader(this.buffer.subarray(0, Fr.SIZE_IN_BYTES * numInnerPublicInputs));
    const publicInputs = reader.readArray(numInnerPublicInputs, Fr);
    return publicInputs;
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
