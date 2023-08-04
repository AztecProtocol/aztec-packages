import { BufferReader } from '@aztec/foundation/serialize';
import { serializeToBuffer } from '../../utils/serialize.js';
import { TxContext } from '../tx_context.js';
import { ConstantBlockHashData } from './constant_block_hash_data.js';


/**
 * Data that is constant/not modified by neither of the kernels.
 */
export class CombinedConstantData {
  constructor(
    /**
     * Roots of the trees relevant for both kernel circuits.
     */
    public ConstantBlockHashData: ConstantBlockHashData,
    /**
     * Context of the transaction.
     */
    public txContext: TxContext,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.ConstantBlockHashData, this.txContext);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or buffer reader to read from.
   * @returns A new instance of CombinedConstantData.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedConstantData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedConstantData(reader.readObject(ConstantBlockHashData), reader.readObject(TxContext));
  }

  static empty() {
    return new CombinedConstantData(ConstantBlockHashData.empty(), TxContext.empty());
  }
}
