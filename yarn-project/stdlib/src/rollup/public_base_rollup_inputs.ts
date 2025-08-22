import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { AvmProofData } from './avm_proof_data.js';
import { PublicBaseRollupHints } from './base_rollup_hints.js';
import { PublicTubeData } from './public_tube_data.js';

export class PublicTxBaseRollupPrivateInputs {
  constructor(
    public tubeData: PublicTubeData,
    public avmProofData: AvmProofData,
    public hints: PublicBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>): PublicTxBaseRollupPrivateInputs {
    return new PublicTxBaseRollupPrivateInputs(...PublicTxBaseRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>) {
    return [fields.tubeData, fields.avmProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicTxBaseRollupPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicTxBaseRollupPrivateInputs(
      reader.readObject(PublicTubeData),
      reader.readObject(AvmProofData),
      reader.readObject(PublicBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicTxBaseRollupPrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicTxBaseRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static empty() {
    return new PublicTxBaseRollupPrivateInputs(
      PublicTubeData.empty(),
      AvmProofData.empty(),
      PublicBaseRollupHints.empty(),
    );
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(PublicTxBaseRollupPrivateInputs);
  }
}
