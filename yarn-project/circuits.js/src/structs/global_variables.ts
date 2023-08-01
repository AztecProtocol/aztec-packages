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
    /**
     * Block number of the L2 block.
     */
    public blockNumber: Fr,
    /**
     * Timestamp of the L2 block.
     */
    public timestamp: Fr,
  ) {}

  static from(fields: FieldsOf<GlobalVariables>): GlobalVariables {
    return new GlobalVariables(...GlobalVariables.getFields(fields));
  }

  /**
   * Get the genesis GlobalVariables given a chainId and version.
   * @param chainId - The chainId of the L2 block.
   * @param version - The version of the L2 block.
   * @returns GlobalVariables for the genesis block.
   */
  static genesis(chainId: bigint, version: bigint): GlobalVariables {
    return new GlobalVariables(new Fr(chainId), new Fr(version), Fr.zero(), Fr.zero());
  }

  static empty(): GlobalVariables {
    return new GlobalVariables(Fr.zero(), Fr.zero(), Fr.zero(), Fr.zero());
  }

  static fromBuffer(buffer: Buffer | BufferReader): GlobalVariables {
    const reader = BufferReader.asReader(buffer);
    return new GlobalVariables(reader.readFr(), reader.readFr(), reader.readFr(), reader.readFr());
  }

  static getFields(fields: FieldsOf<GlobalVariables>) {
    return [fields.chainId, fields.version, fields.blockNumber, fields.timestamp] as const;
  }

  toBuffer() {
    return serializeToBuffer(...GlobalVariables.getFields(this));
  }
}
