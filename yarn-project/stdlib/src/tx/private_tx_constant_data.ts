import { TX_CONSTANT_DATA_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { BlockHeader } from './block_header.js';
import { ProtocolContracts } from './protocol_contracts.js';
import { TxContext } from './tx_context.js';

/**
 * Data that is constant/not modified by neither of the kernels.
 */
export class PrivateTxConstantData {
  constructor(
    /** Header of a block whose state is used during execution (not the block the transaction is included in). */
    public anchorBlockHeader: BlockHeader,
    /**
     * Context of the transaction.
     *
     * Note: `chainId` and `version` in txContext are not redundant to the values in
     * self.anchor_block_header.global_variables because they can be different in case of a protocol upgrade. In such
     * a situation we could be using header from a block before the upgrade took place but be using the updated
     * protocol to execute and prove the transaction.
     */
    public txContext: TxContext,
    /**
     * Root of the vk tree for the protocol circuits.
     */
    public vkTreeRoot: Fr,
    /**
     * List of protocol contracts.
     */
    public protocolContracts: ProtocolContracts,
  ) {}

  static from(fields: FieldsOf<PrivateTxConstantData>) {
    return new PrivateTxConstantData(...PrivateTxConstantData.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateTxConstantData>) {
    return [fields.anchorBlockHeader, fields.txContext, fields.vkTreeRoot, fields.protocolContracts] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PrivateTxConstantData {
    const reader = FieldReader.asReader(fields);
    return new PrivateTxConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      reader.readField(),
      reader.readObject(ProtocolContracts),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateTxConstantData.getFields(this));
    if (fields.length !== TX_CONSTANT_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateTxConstantData. Expected ${TX_CONSTANT_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateTxConstantData {
    const reader = BufferReader.asReader(buffer);
    return new PrivateTxConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      Fr.fromBuffer(reader),
      reader.readObject(ProtocolContracts),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateTxConstantData.getFields(this));
  }

  static empty() {
    return new PrivateTxConstantData(BlockHeader.empty(), TxContext.empty(), Fr.ZERO, ProtocolContracts.empty());
  }

  getSize() {
    return (
      this.anchorBlockHeader.getSize() +
      this.txContext.getSize() +
      this.vkTreeRoot.size +
      this.protocolContracts.getSize()
    );
  }

  clone(): PrivateTxConstantData {
    return PrivateTxConstantData.fromBuffer(this.toBuffer());
  }
}
