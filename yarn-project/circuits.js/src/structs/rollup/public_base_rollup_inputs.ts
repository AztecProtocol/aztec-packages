import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { AvmProofData } from './avm_proof_data.js';
import { BaseRollupHints } from './base_rollup_hints.js';
import { PublicTubeData } from './public_tube_data.js';

export class PublicBaseRollupInputs {
  constructor(public tubeData: PublicTubeData, public avmProofData: AvmProofData, public hints: BaseRollupHints) {}

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
      reader.readObject(BaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicBaseRollupInputs.getFields(this));
  }
  static fromString(str: string) {
    return PublicBaseRollupInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static empty() {
    return new PublicBaseRollupInputs(PublicTubeData.empty(), AvmProofData.empty(), BaseRollupHints.empty());
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toString();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return hexSchemaFor(PublicBaseRollupInputs);
  }
}
