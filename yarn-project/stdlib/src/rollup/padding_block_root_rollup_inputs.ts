import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { EpochConstantData } from './epoch_constant_data.js';

/**
 * Inputs of the padding block root rollup circuit.
 */
export class PaddingBlockRootRollupInputs {
  constructor(public readonly constants: EpochConstantData) {}

  static from(fields: FieldsOf<PaddingBlockRootRollupInputs>): PaddingBlockRootRollupInputs {
    return new PaddingBlockRootRollupInputs(...PaddingBlockRootRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PaddingBlockRootRollupInputs>) {
    return [fields.constants] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PaddingBlockRootRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new PaddingBlockRootRollupInputs(reader.readObject(EpochConstantData));
  }

  toBuffer() {
    return serializeToBuffer(...PaddingBlockRootRollupInputs.getFields(this));
  }

  static fromString(str: string) {
    return PaddingBlockRootRollupInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(PaddingBlockRootRollupInputs);
  }
}
