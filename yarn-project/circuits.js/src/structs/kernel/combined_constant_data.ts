import { Fr } from '@aztec/foundation/fields';
import { hexSchemaFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { BlockHeader } from '../block_header.js';
import { GlobalVariables } from '../global_variables.js';
import { TxContext } from '../tx_context.js';
import { type TxConstantData } from './tx_constant_data.js';

/**
 * Data that is constant/not modified by neither of the kernels.
 */
export class CombinedConstantData {
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
    /** Present when output by a public kernel, empty otherwise. */
    public globalVariables: GlobalVariables,
  ) {}

  static combine(TxConstantData: TxConstantData, globalVariables: GlobalVariables) {
    return new CombinedConstantData(
      TxConstantData.historicalHeader,
      TxConstantData.txContext,
      TxConstantData.vkTreeRoot,
      TxConstantData.protocolContractTreeRoot,
      globalVariables,
    );
  }

  static get schema() {
    return z
      .object({
        historicalHeader: BlockHeader.schema,
        txContext: TxContext.schema,
        vkTreeRoot: schemas.Fr,
        protocolContractTreeRoot: schemas.Fr,
        globalVariables: GlobalVariables.schema,
      })
      .transform(CombinedConstantData.from)
      .or(hexSchemaFor(CombinedConstantData));
  }

  toBuffer() {
    return serializeToBuffer(
      this.historicalHeader,
      this.txContext,
      this.vkTreeRoot,
      this.protocolContractTreeRoot,
      this.globalVariables,
    );
  }

  clone(): CombinedConstantData {
    return CombinedConstantData.fromBuffer(this.toBuffer());
  }

  getSize() {
    return (
      this.historicalHeader.getSize() +
      this.txContext.getSize() +
      this.vkTreeRoot.size +
      this.protocolContractTreeRoot.size +
      this.globalVariables.getSize()
    );
  }

  static from({
    historicalHeader,
    txContext,
    vkTreeRoot,
    protocolContractTreeRoot,
    globalVariables,
  }: FieldsOf<CombinedConstantData>): CombinedConstantData {
    return new CombinedConstantData(historicalHeader, txContext, vkTreeRoot, protocolContractTreeRoot, globalVariables);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or buffer reader to read from.
   * @returns A new instance of CombinedConstantData.
   */
  static fromBuffer(buffer: Buffer | BufferReader): CombinedConstantData {
    const reader = BufferReader.asReader(buffer);
    return new CombinedConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readObject(GlobalVariables),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): CombinedConstantData {
    const reader = FieldReader.asReader(fields);
    return new CombinedConstantData(
      reader.readObject(BlockHeader),
      reader.readObject(TxContext),
      reader.readField(),
      reader.readField(),
      reader.readObject(GlobalVariables),
    );
  }

  static empty() {
    return new CombinedConstantData(BlockHeader.empty(), TxContext.empty(), Fr.ZERO, Fr.ZERO, GlobalVariables.empty());
  }
}
