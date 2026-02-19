import { GLOBAL_VARIABLES_LENGTH } from '@aztec/constants';
import { BlockNumber, BlockNumberSchema, SlotNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
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
import type { UInt64 } from '../types/index.js';

/**
 * Global variables that are constant across the entire checkpoint (slot).
 * Excludes blockNumber since that varies per block within a checkpoint.
 */
export type CheckpointGlobalVariables = Omit<FieldsOf<GlobalVariables>, 'blockNumber'>;

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
    public blockNumber: BlockNumber,
    /** Slot number of the L2 block */
    public slotNumber: SlotNumber,
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
        blockNumber: BlockNumberSchema,
        slotNumber: schemas.SlotNumber,
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

  /**
   * Creates a GlobalVariables instance from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing GlobalVariables fields
   * @returns A GlobalVariables instance
   */
  static fromPlainObject(obj: any): GlobalVariables {
    return new GlobalVariables(
      Fr.fromPlainObject(obj.chainId),
      Fr.fromPlainObject(obj.version),
      obj.blockNumber,
      SlotNumber(Fr.fromPlainObject(obj.slotNumber).toNumber()),
      typeof obj.timestamp === 'bigint' ? obj.timestamp : BigInt(obj.timestamp),
      EthAddress.fromPlainObject(obj.coinbase),
      AztecAddress.fromPlainObject(obj.feeRecipient),
      GasFees.fromPlainObject(obj.gasFees),
    );
  }

  static empty(fields: Partial<FieldsOf<GlobalVariables>> = {}): GlobalVariables {
    return GlobalVariables.from({
      blockNumber: BlockNumber.ZERO,
      slotNumber: SlotNumber.ZERO,
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
      BlockNumber(reader.readNumber()),
      SlotNumber(reader.readNumber()),
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
      BlockNumber(reader.readU32()),
      SlotNumber(reader.readU32()),
      reader.readField().toBigInt(),
      EthAddress.fromField(reader.readField()),
      AztecAddress.fromField(reader.readField()),
      GasFees.fromFields(reader),
    );
  }

  static getFields(fields: FieldsOf<GlobalVariables>) {
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
      blockNumber: this.blockNumber,
      slotNumber: this.slotNumber,
      timestamp: this.timestamp.toString(),
      coinbase: this.coinbase.toString(),
      gasFees: jsonStringify(this.gasFees),
    };
  }

  /**
   * Converts GlobalVariables to a plain object suitable for MessagePack serialization.
   * This method ensures that slotNumber is serialized as a Fr (Field element) to match
   * the C++ struct definition which expects slot_number as FF.
   */
  toJSON() {
    return {
      chainId: this.chainId,
      version: this.version,
      blockNumber: this.blockNumber,
      slotNumber: new Fr(this.slotNumber), // Convert to Fr for C++ compatibility
      timestamp: this.timestamp,
      coinbase: this.coinbase,
      feeRecipient: this.feeRecipient,
      gasFees: this.gasFees,
    };
  }

  clone(): GlobalVariables {
    return GlobalVariables.fromBuffer(this.toBuffer());
  }

  isEmpty(): boolean {
    return (
      this.chainId.isZero() &&
      this.version.isZero() &&
      this.blockNumber === 0 &&
      this.slotNumber === 0 &&
      this.timestamp === 0n &&
      this.coinbase.isZero() &&
      this.feeRecipient.isZero() &&
      this.gasFees.isEmpty()
    );
  }

  static random(overrides: Partial<FieldsOf<GlobalVariables>> = {}): GlobalVariables {
    return GlobalVariables.from({
      chainId: new Fr(randomInt(100_000)),
      version: new Fr(randomInt(100_000)),
      blockNumber: BlockNumber(randomInt(100_000)),
      slotNumber: SlotNumber(randomInt(100_000)),
      coinbase: EthAddress.random(),
      feeRecipient: AztecAddress.fromField(Fr.random()),
      gasFees: GasFees.random(),
      timestamp: BigInt(randomInt(100_000_000)),
      ...overrides,
    });
  }

  toInspect() {
    return {
      chainId: this.chainId.toNumber(),
      version: this.version.toNumber(),
      blockNumber: this.blockNumber,
      slotNumber: this.slotNumber,
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
      this.blockNumber === other.blockNumber &&
      this.slotNumber === other.slotNumber &&
      this.timestamp === other.timestamp &&
      this.coinbase.equals(other.coinbase) &&
      this.feeRecipient.equals(other.feeRecipient) &&
      this.gasFees.equals(other.gasFees)
    );
  }
}
