import { GLOBAL_VARIABLES_LENGTH } from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import {
  BufferReader,
  FieldReader,
  bigintToUInt64BE,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { schemas } from '../schemas/index.js';
import type { UInt64 } from '../types/shared.js';

/**
 * Global variables of the L2 block.
 */
export class GlobalVariables {
  constructor(
    /** ChainId for the L2 block. */
    public chainId: Fr,
    /** Version for the L2 block. */
    public version: Fr,
    /** Block number of the L2 block. */
    public blockNumber: Fr,
    /** Slot number of the L2 block */
    public slotNumber: Fr,
    /** Timestamp of the L2 block. */
    public timestamp: UInt64,
    /** Recipient of block reward. */
    public coinbase: EthAddress,
    /** Address to receive fees. */
    public feeRecipient: AztecAddress,
    /** Global gas prices for this block. */
    public gasFees: GasFees,
  ) {}

  static get schema() {
    return z
      .object({
        chainId: schemas.Fr,
        version: schemas.Fr,
        blockNumber: schemas.Fr,
        slotNumber: schemas.Fr,
        timestamp: schemas.BigInt,
        coinbase: schemas.EthAddress,
        feeRecipient: schemas.AztecAddress,
        gasFees: GasFees.schema,
      })
      .transform(GlobalVariables.from);
  }

  getSize(): number {
    return this.toBuffer().length;
  }

  static from(fields: FieldsOf<GlobalVariables>): GlobalVariables {
    return new GlobalVariables(...GlobalVariables.getFields(fields));
  }

  static empty(fields: Partial<FieldsOf<GlobalVariables>> = {}): GlobalVariables {
    return GlobalVariables.from({
      blockNumber: Fr.ZERO,
      slotNumber: Fr.ZERO,
      timestamp: 0n,
      chainId: Fr.ZERO,
      version: Fr.ZERO,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
      ...fields,
    });
  }

  static fromBuffer(buffer: Buffer | BufferReader): GlobalVariables {
    const reader = BufferReader.asReader(buffer);
    return new GlobalVariables(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readUInt64(),
      reader.readObject(EthAddress),
      reader.readObject(AztecAddress),
      reader.readObject(GasFees),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): GlobalVariables {
    const reader = FieldReader.asReader(fields);

    return new GlobalVariables(
      reader.readField(),
      reader.readField(),
      reader.readField(),
      reader.readField(),
      reader.readField().toBigInt(),
      EthAddress.fromField(reader.readField()),
      AztecAddress.fromField(reader.readField()),
      GasFees.fromFields(reader),
    );
  }

  static getFields(fields: FieldsOf<GlobalVariables>) {
    // Note: The order here must match the order in the ProposedHeaderLib solidity library.
    return [
      fields.chainId,
      fields.version,
      fields.blockNumber,
      fields.slotNumber,
      fields.timestamp,
      fields.coinbase,
      fields.feeRecipient,
      fields.gasFees,
    ] as const;
  }

  toBuffer() {
    return serializeToBuffer([
      this.chainId,
      this.version,
      this.blockNumber,
      this.slotNumber,
      bigintToUInt64BE(this.timestamp),
      this.coinbase,
      this.feeRecipient,
      this.gasFees,
    ]);
  }

  toFields() {
    const fields = serializeToFields(...GlobalVariables.getFields(this));
    if (fields.length !== GLOBAL_VARIABLES_LENGTH) {
      throw new Error(
        `Invalid number of fields for GlobalVariables. Expected ${GLOBAL_VARIABLES_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  /**
   * A trimmed version of the JSON representation of the global variables,
   * tailored for human consumption.
   */
  toFriendlyJSON() {
    return {
      blockNumber: this.blockNumber.toNumber(),
      slotNumber: this.slotNumber.toNumber(),
      timestamp: this.timestamp.toString(),
      coinbase: this.coinbase.toString(),
      gasFees: jsonStringify(this.gasFees),
    };
  }

  clone(): GlobalVariables {
    return GlobalVariables.fromBuffer(this.toBuffer());
  }

  isEmpty(): boolean {
    return (
      this.chainId.isZero() &&
      this.version.isZero() &&
      this.blockNumber.isZero() &&
      this.slotNumber.isZero() &&
      this.timestamp === 0n &&
      this.coinbase.isZero() &&
      this.feeRecipient.isZero() &&
      this.gasFees.isEmpty()
    );
  }

  toInspect() {
    return {
      chainId: this.chainId.toNumber(),
      version: this.version.toNumber(),
      blockNumber: this.blockNumber.toNumber(),
      slotNumber: this.slotNumber.toNumber(),
      timestamp: this.timestamp,
      coinbase: this.coinbase.toString(),
      feeRecipient: this.feeRecipient.toString(),
      feePerDaGas: Number(this.gasFees.feePerDaGas),
      feePerL2Gas: Number(this.gasFees.feePerL2Gas),
    };
  }

  [inspect.custom]() {
    return `GlobalVariables ${inspect(this.toInspect())}`;
  }

  public equals(other: this): boolean {
    return (
      this.chainId.equals(other.chainId) &&
      this.version.equals(other.version) &&
      this.blockNumber.equals(other.blockNumber) &&
      this.slotNumber.equals(other.slotNumber) &&
      this.timestamp === other.timestamp &&
      this.coinbase.equals(other.coinbase) &&
      this.feeRecipient.equals(other.feeRecipient) &&
      this.gasFees.equals(other.gasFees)
    );
  }
}
