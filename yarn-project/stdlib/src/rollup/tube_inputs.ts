import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { ClientIvcProof } from '../proofs/client_ivc_proof.js';

/**
 * Inputs for the tube circuit, which turns a client IVC proof folding stack into an ultrahonk proof.
 * 'usePublicTailVk' signifies if we should prove this with the public or private kernel tail client IVC VKs.
 */
export class TubeInputs {
  constructor(
    public usePublicTailVk: boolean,
    public clientIVCData: ClientIvcProof,
  ) {}

  static from(fields: FieldsOf<TubeInputs>): TubeInputs {
    return new TubeInputs(...TubeInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<TubeInputs>) {
    return [fields.usePublicTailVk, fields.clientIVCData] as const;
  }

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...TubeInputs.getFields(this));
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
   * @returns A new TubeInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TubeInputs {
    const reader = BufferReader.asReader(buffer);
    return new TubeInputs(reader.readBoolean(), reader.readObject(ClientIvcProof));
  }

  isEmpty(): boolean {
    return this.clientIVCData.isEmpty();
  }
  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new TubeInputs instance.
   */
  static fromString(str: string) {
    return TubeInputs.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new TubeInputs(false, ClientIvcProof.empty());
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(TubeInputs);
  }
}
