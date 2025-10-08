import { TX_CONSTANT_DATA_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { BlockHeader } from './block_header.js';
import { TxContext } from './tx_context.js';

/**
 * Version of `PrivateTxConstantData` exposed by the tail circuits
 * It compresses the protocol contracts list to a hash to minimize the number of public inputs.
 * Refer to `PrivateTxConstantData` for more details.
 */
export class TxConstantData {
  constructor(
    public anchorBlockHeader: BlockHeader,
    public txContext: TxContext,
    public vkTreeRoot: Fr,
    public protocolContractsHash: Fr,
  ) {}

  static from(fields: FieldsOf<TxConstantData>) {
    return new TxConstantData(...TxConstantData.getFields(fields));
  }

  static getFields(fields: FieldsOf<TxConstantData>) {
    return [fields.anchorBlockHeader, fields.txContext, fields.vkTreeRoot, fields.protocolContractsHash] as const;
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
      this.anchorBlockHeader.getSize() +
      this.txContext.getSize() +
      this.vkTreeRoot.size +
      this.protocolContractsHash.size
    );
  }

  clone(): TxConstantData {
    return TxConstantData.fromBuffer(this.toBuffer());
  }
}
