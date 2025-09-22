import { NUM_BASE_PARITY_PER_ROOT_PARITY } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { ProofData, type UltraHonkProofData } from '../proofs/proof_data.js';
import { ParityPublicInputs } from './parity_public_inputs.js';

export type ParityBaseProofData = UltraHonkProofData<ParityPublicInputs>;

export class ParityRootPrivateInputs {
  constructor(
    /** Public inputs of the parity base circuits and their proofs and vk data. */
    public readonly children: Tuple<ParityBaseProofData, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.children);
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - The buffer to deserialize from.
   * @returns A new ParityRootPrivateInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ParityRootPrivateInputs(
      makeTuple(NUM_BASE_PARITY_PER_ROOT_PARITY, () => ProofData.fromBuffer(reader, ParityPublicInputs)),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new ParityRootPrivateInputs instance.
   */
  static fromString(str: string) {
    return ParityRootPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(ParityRootPrivateInputs);
  }
}
