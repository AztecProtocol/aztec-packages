import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { L1ToL2MessageSponge } from '../messaging/l1_to_l2_message_sponge.js';

export class ParityPublicInputs {
  constructor(
    /**
     * The L1 `in_hash` (sha256 frontier root of the checkpoint's messages). Unconstrained pass-through: InboxParity
     * echoes the value the prover supplies; it stays the authoritative L1 check until the Fast Inbox flip.
     */
    public inHash: Fr,
    /** Inbox rolling hash before absorbing this checkpoint's messages. */
    public startRollingHash: Fr,
    /** Inbox rolling hash after absorbing the checkpoint's real messages. */
    public endRollingHash: Fr,
    /** Message-bundle sponge after absorbing the same real messages into the empty per-checkpoint sponge. */
    public endSponge: L1ToL2MessageSponge,
    /** Prover identity committed to by the circuit, for sybil protection. */
    public proverId: Fr,
  ) {
    if (inHash.toBuffer()[0] != 0) {
      throw new Error(`inHash buffer must be 31 bytes. Got 32 bytes`);
    }
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.inHash, this.startRollingHash, this.endRollingHash, this.endSponge, this.proverId);
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
    return [fields.inHash, fields.startRollingHash, fields.endRollingHash, fields.endSponge, fields.proverId] as const;
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
      reader.readObject(Fr),
      reader.readObject(L1ToL2MessageSponge),
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
