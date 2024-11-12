import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { BaseRollupHints } from './base_rollup_hints.js';
import { PrivateTubeData } from './private_tube_data.js';

export class PrivateBaseRollupInputs {
  constructor(public tubeData: PrivateTubeData, public hints: BaseRollupHints) {}

  static from(fields: FieldsOf<PrivateBaseRollupInputs>): PrivateBaseRollupInputs {
    return new PrivateBaseRollupInputs(...PrivateBaseRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateBaseRollupInputs>) {
    return [fields.tubeData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateBaseRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateBaseRollupInputs(reader.readObject(PrivateTubeData), reader.readObject(BaseRollupHints));
  }

  toBuffer() {
    return serializeToBuffer(...PrivateBaseRollupInputs.getFields(this));
  }

  static fromString(str: string) {
    return PrivateBaseRollupInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static empty() {
    return new PrivateBaseRollupInputs(PrivateTubeData.empty(), BaseRollupHints.empty());
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toString();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return hexSchemaFor(PrivateBaseRollupInputs);
  }
}
