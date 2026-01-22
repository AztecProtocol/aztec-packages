import { SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';

/**
 * Constants that are the same for the entire checkpoint.
 * Used in circuits during rollup proving.
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
    public slotNumber: SlotNumber,
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
      SlotNumber.ZERO,
      EthAddress.ZERO,
      AztecAddress.ZERO,
      GasFees.empty(),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.chainId,
      this.version,
      this.vkTreeRoot,
      this.protocolContractsHash,
      this.proverId,
      new Fr(this.slotNumber),
      this.coinbase,
      this.feeRecipient,
      this.gasFees,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointConstantData(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      SlotNumber(Fr.fromBuffer(reader).toNumber()),
      reader.readObject(EthAddress),
      reader.readObject(AztecAddress),
      reader.readObject(GasFees),
    );
  }

  /**
   * Returns the slot number as a SlotNumber branded type.
   * @deprecated Use slotNumber directly instead.
   */
  getSlotNumber(): SlotNumber {
    return this.slotNumber;
  }

  toInspect() {
    return {
      chainId: this.chainId.toNumber(),
      version: this.version.toNumber(),
      vkTreeRoot: this.vkTreeRoot.toString(),
      protocolContractsHash: this.protocolContractsHash.toString(),
      proverId: this.proverId.toString(),
      slotNumber: this.slotNumber,
      coinbase: this.coinbase.toString(),
      feeRecipient: this.feeRecipient.toString(),
      gasFees: this.gasFees.toInspect(),
    };
  }

  [inspect.custom]() {
    return `CheckpointConstantData ${inspect(this.toInspect())}`;
  }
}
