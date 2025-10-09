import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';

/**
 * Constants that are the same for the entire checkpoint.
 */
export class CheckpointConstantData {
  constructor(
    /** ChainId of the rollup. */
    public chainId: Fr,
    /** Version of the rollup. */
    public version: Fr,
    /** Root of the verification key tree. */
    public vkTreeRoot: Fr,
    /** Hash of the protocol contracts list. */
    public protocolContractsHash: Fr,
    /** Identifier of the prover. */
    public proverId: Fr,
    /** Slot number of the checkpoint. */
    public slotNumber: Fr,
    /** Coinbase address of the rollup. */
    public coinbase: EthAddress,
    /** Address to receive fees. */
    public feeRecipient: AztecAddress,
    /** Global gas fees for this checkpoint. */
    public gasFees: GasFees,
  ) {}

  static from(fields: FieldsOf<CheckpointConstantData>) {
    return new CheckpointConstantData(...CheckpointConstantData.getFields(fields));
  }

  static getFields(fields: FieldsOf<CheckpointConstantData>) {
    return [
      fields.chainId,
      fields.version,
      fields.vkTreeRoot,
      fields.protocolContractsHash,
      fields.proverId,
      fields.slotNumber,
      fields.coinbase,
      fields.feeRecipient,
      fields.gasFees,
    ] as const;
  }

  static empty() {
    return new CheckpointConstantData(
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      EthAddress.ZERO,
      AztecAddress.ZERO,
      GasFees.empty(),
    );
  }

  toBuffer() {
    return serializeToBuffer(...CheckpointConstantData.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointConstantData(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readObject(EthAddress),
      reader.readObject(AztecAddress),
      reader.readObject(GasFees),
    );
  }
}
