import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { L1ToL2MessageSponge } from '../messaging/l1_to_l2_message_sponge.js';

export class ParityPublicInputs {
  constructor(
    /** Inbox rolling hash before absorbing this checkpoint's messages. */
    public startRollingHash: Fr,
    /** Inbox rolling hash after absorbing the `numMsgs` real messages. */
    public endRollingHash: Fr,
    /** Message-bundle sponge before absorbing this checkpoint's messages (empty at checkpoint start). */
    public startSponge: L1ToL2MessageSponge,
    /** Message-bundle sponge after absorbing the `numMsgs` real messages. */
    public endSponge: L1ToL2MessageSponge,
    /** Number of real (non-padding) messages absorbed into the rolling hash and the sponge. */
    public numMsgs: number,
    /** Root of the VK tree */
    public vkTreeRoot: Fr,
    /** Prover identity committed to by the circuit, for sybil protection. */
    public proverId: Fr,
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.startRollingHash,
      this.endRollingHash,
      this.startSponge,
      this.endSponge,
      new Fr(this.numMsgs),
      this.vkTreeRoot,
      this.proverId,
    );
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The inputs serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /**
   * Creates a new ParityPublicInputs instance from the given fields.
   * @param fields - The fields to create the instance from.
   * @returns The instance.
   */
  static from(fields: FieldsOf<ParityPublicInputs>): ParityPublicInputs {
    return new ParityPublicInputs(...ParityPublicInputs.getFields(fields));
  }

  /**
   * Extracts the fields from the given instance.
   * @param fields - The instance to get the fields from.
   * @returns The instance fields.
   */
  static getFields(fields: FieldsOf<ParityPublicInputs>) {
    return [
      fields.startRollingHash,
      fields.endRollingHash,
      fields.startSponge,
      fields.endSponge,
      fields.numMsgs,
      fields.vkTreeRoot,
      fields.proverId,
    ] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - The buffer to deserialize from.
   * @returns A new ParityPublicInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ParityPublicInputs(
      reader.readObject(Fr),
      reader.readObject(Fr),
      reader.readObject(L1ToL2MessageSponge),
      reader.readObject(L1ToL2MessageSponge),
      Fr.fromBuffer(reader).toNumber(),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - The hex string to deserialize from.
   * @returns A new ParityPublicInputs instance.
   */
  static fromString(str: string) {
    return ParityPublicInputs.fromBuffer(hexToBuffer(str));
  }

  static get schema() {
    return bufferSchemaFor(ParityPublicInputs);
  }
}
