import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { FieldsOf } from '../index.js';
import { serializeToBuffer } from '../utils/index.js';

/**
 * Global variables of the L2 block.
 */
export class GlobalVariables {
  constructor(
    /**
     * ChainId for the L2 block.
     */
    public chainId: Fr,
    /**
     * version for the L2 block.
     */
    public version: Fr,
  ) {}

  static from(fields: FieldsOf<GlobalVariables>): GlobalVariables {
    return new GlobalVariables(...GlobalVariables.getFields(fields));
  }

  static fromBuffer(buffer: Buffer | BufferReader): GlobalVariables {
    const reader = BufferReader.asReader(buffer);
    return new GlobalVariables(reader.readFr(), reader.readFr());
  }

  static getFields(fields: FieldsOf<GlobalVariables>) {
    return [fields.chainId, fields.version] as const;
  }

  toBuffer() {
    return serializeToBuffer(...GlobalVariables.getFields(this));
  }
}
