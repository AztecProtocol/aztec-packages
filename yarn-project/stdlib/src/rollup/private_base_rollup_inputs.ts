import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateBaseRollupHints } from './base_rollup_hints.js';
import { PrivateTubeData } from './private_tube_data.js';

export class PrivateTxBaseRollupPrivateInputs {
  constructor(
    public tubeData: PrivateTubeData,
    public hints: PrivateBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PrivateTxBaseRollupPrivateInputs>): PrivateTxBaseRollupPrivateInputs {
    return new PrivateTxBaseRollupPrivateInputs(...PrivateTxBaseRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateTxBaseRollupPrivateInputs>) {
    return [fields.tubeData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateTxBaseRollupPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateTxBaseRollupPrivateInputs(
      reader.readObject(PrivateTubeData),
      reader.readObject(PrivateBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateTxBaseRollupPrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PrivateTxBaseRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty() {
    return new PrivateTxBaseRollupPrivateInputs(PrivateTubeData.empty(), PrivateBaseRollupHints.empty());
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(PrivateTxBaseRollupPrivateInputs);
  }
}
