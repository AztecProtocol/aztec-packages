import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { TX_CONSTANT_DATA_LENGTH } from '../../constants.gen.js';
import { BlockHeader } from '../block_header.js';
import { TxContext } from '../tx_context.js';

/**
 * Data that is constant/not modified by neither of the kernels.
 */
export class TxConstantData {
  constructor(
    /** Header of a block whose state is used during execution (not the block the transaction is included in). */
    public historicalHeader: BlockHeader,
    /**
     * Context of the transaction.
     *
     * Note: `chainId` and `version` in txContext are not redundant to the values in
     * self.historical_header.global_variables because they can be different in case of a protocol upgrade. In such
     * a situation we could be using header from a block before the upgrade took place but be using the updated
     * protocol to execute and prove the transaction.
     */
    public txContext: TxContext,
    /**
     * Root of the vk tree for the protocol circuits.
     */
    public vkTreeRoot: Fr,
    /**
     * Root of the tree for the protocol contracts.
     */
    public protocolContractTreeRoot: Fr,
  ) {}

  static from(fields: FieldsOf<TxConstantData>) {
    return new TxConstantData(...TxConstantData.getFields(fields));
  }

  static getFields(fields: FieldsOf<TxConstantData>) {
    return [fields.historicalHeader, fields.txContext, fields.vkTreeRoot, fields.protocolContractTreeRoot] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): TxConstantData {
    const reader = FieldReader.asReader(fields);
    return new TxConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      reader.readField(),
      reader.readField(),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...TxConstantData.getFields(this));
    if (fields.length !== TX_CONSTANT_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for TxConstantData. Expected ${TX_CONSTANT_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader): TxConstantData {
    const reader = BufferReader.asReader(buffer);
    return new TxConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(...TxConstantData.getFields(this));
  }

  static empty() {
    return new TxConstantData(BlockHeader.empty(), TxContext.empty(), Fr.ZERO, Fr.ZERO);
  }

  getSize() {
    return (
      this.historicalHeader.getSize() +
      this.txContext.getSize() +
      this.vkTreeRoot.size +
      this.protocolContractTreeRoot.size
    );
  }

  clone(): TxConstantData {
    return TxConstantData.fromBuffer(this.toBuffer());
  }
}
