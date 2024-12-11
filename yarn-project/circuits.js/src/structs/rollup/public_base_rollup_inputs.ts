import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { AvmProofData } from './avm_proof_data.js';
import { PublicBaseRollupHints } from './base_rollup_hints.js';
import { PublicTubeData } from './public_tube_data.js';

export class PublicBaseRollupInputs {
  constructor(
    public tubeData: PublicTubeData,
    public avmProofData: AvmProofData,
    public hints: PublicBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PublicBaseRollupInputs>): PublicBaseRollupInputs {
    return new PublicBaseRollupInputs(...PublicBaseRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicBaseRollupInputs>) {
    return [fields.tubeData, fields.avmProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicBaseRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicBaseRollupInputs(
      reader.readObject(PublicTubeData),
      reader.readObject(AvmProofData),
      reader.readObject(PublicBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicBaseRollupInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicBaseRollupInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty() {
    return new PublicBaseRollupInputs(PublicTubeData.empty(), AvmProofData.empty(), PublicBaseRollupHints.empty());
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(PublicBaseRollupInputs);
  }
}
