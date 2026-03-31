import {
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
  GAS_SETTINGS_LENGTH,
  MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
  MAX_PROCESSABLE_L2_GAS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { Gas, GasDimensions } from './gas.js';
import { GasFees } from './gas_fees.js';

// docs:start:gas_settings_vars
/** Gas usage and fees limits set by the transaction sender for different dimensions and phases. */
export class GasSettings {
  constructor(
    public readonly gasLimits: Gas,
    public readonly teardownGasLimits: Gas,
    public readonly maxFeesPerGas: GasFees,
    public readonly maxPriorityFeesPerGas: GasFees,
  ) {}
  // docs:end:gas_settings_vars

  static get schema() {
    return z
      .object({
        gasLimits: Gas.schema,
        teardownGasLimits: Gas.schema,
        maxFeesPerGas: GasFees.schema,
        maxPriorityFeesPerGas: GasFees.schema,
      })
      .transform(GasSettings.from);
  }

  getSize(): number {
    return this.toBuffer().length;
  }

  static from(args: {
    gasLimits: FieldsOf<Gas>;
    teardownGasLimits: FieldsOf<Gas>;
    maxFeesPerGas: FieldsOf<GasFees>;
    maxPriorityFeesPerGas: FieldsOf<GasFees>;
  }) {
    return new GasSettings(
      Gas.from(args.gasLimits),
      Gas.from(args.teardownGasLimits),
      GasFees.from(args.maxFeesPerGas),
      GasFees.from(args.maxPriorityFeesPerGas),
    );
  }

  /**
   * Creates a GasSettings instance from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing GasSettings fields
   * @returns A GasSettings instance
   */
  static fromPlainObject(obj: any): GasSettings {
    if (obj instanceof GasSettings) {
      return obj;
    }
    return new GasSettings(
      Gas.fromPlainObject(obj.gasLimits),
      Gas.fromPlainObject(obj.teardownGasLimits),
      GasFees.fromPlainObject(obj.maxFeesPerGas),
      GasFees.fromPlainObject(obj.maxPriorityFeesPerGas),
    );
  }

  clone() {
    return new GasSettings(
      this.gasLimits.clone(),
      this.teardownGasLimits.clone(),
      this.maxFeesPerGas.clone(),
      this.maxPriorityFeesPerGas.clone(),
    );
  }

  /** Returns the maximum fee to be paid according to gas limits and max fees set. */
  getFeeLimit() {
    return GasDimensions.reduce(
      (acc, dimension) => new Fr(this.maxFeesPerGas.get(dimension)).mul(new Fr(this.gasLimits.get(dimension))).add(acc),
      Fr.ZERO,
    );
  }

  /** Zero-value gas settings. */
  static empty() {
    return new GasSettings(Gas.empty(), Gas.empty(), GasFees.empty(), GasFees.empty());
  }

  /** Maximum gas settings the network can process. Fills in gas limits at the protocol maximum if not provided. */
  static withMaxLimits(overrides: {
    gasLimits?: Gas;
    teardownGasLimits?: Gas;
    maxFeesPerGas: GasFees;
    maxPriorityFeesPerGas?: GasFees;
  }) {
    return GasSettings.from({
      gasLimits: overrides.gasLimits ?? {
        l2Gas: MAX_PROCESSABLE_L2_GAS,
        daGas: MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
      },
      teardownGasLimits: overrides.teardownGasLimits ?? {
        // These are technically not the max, but if we allocate all the gas to teardown, no txs would be processable due
        // to teardown gas being paid unconditionally and upfront. This is a fundamental limitation and the chosen values
        // are somewhat arbitrary.
        l2Gas: DEFAULT_TEARDOWN_L2_GAS_LIMIT,
        daGas: DEFAULT_TEARDOWN_DA_GAS_LIMIT,
      },
      maxFeesPerGas: overrides.maxFeesPerGas,
      maxPriorityFeesPerGas: overrides.maxPriorityFeesPerGas ?? GasFees.empty(),
    });
  }

  /**
   * Gas settings for simulation/estimation only. Uses intentionally high limits above what the
   * network can process, so the simulation runs without hitting gas caps. The actual gas used
   * is then read from the simulation result to set real limits for sending.
   */
  static forEstimation(overrides: {
    gasLimits?: Gas;
    teardownGasLimits?: Gas;
    maxFeesPerGas: GasFees;
    maxPriorityFeesPerGas?: GasFees;
  }) {
    return GasSettings.from({
      gasLimits: overrides.gasLimits ?? {
        l2Gas: GAS_ESTIMATION_L2_GAS_LIMIT,
        daGas: GAS_ESTIMATION_DA_GAS_LIMIT,
      },
      teardownGasLimits: overrides.teardownGasLimits ?? {
        l2Gas: GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
        daGas: GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
      },
      maxFeesPerGas: overrides.maxFeesPerGas,
      maxPriorityFeesPerGas: overrides.maxPriorityFeesPerGas ?? GasFees.empty(),
    });
  }

  isEmpty() {
    return (
      this.gasLimits.isEmpty() &&
      this.teardownGasLimits.isEmpty() &&
      this.maxFeesPerGas.isEmpty() &&
      this.maxPriorityFeesPerGas.isEmpty()
    );
  }

  equals(other: GasSettings) {
    return (
      this.gasLimits.equals(other.gasLimits) &&
      this.teardownGasLimits.equals(other.teardownGasLimits) &&
      this.maxFeesPerGas.equals(other.maxFeesPerGas) &&
      this.maxPriorityFeesPerGas.equals(other.maxPriorityFeesPerGas)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): GasSettings {
    const reader = BufferReader.asReader(buffer);
    return new GasSettings(
      reader.readObject(Gas),
      reader.readObject(Gas),
      reader.readObject(GasFees),
      reader.readObject(GasFees),
    );
  }

  toBuffer() {
    return serializeToBuffer(...GasSettings.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): GasSettings {
    const reader = FieldReader.asReader(fields);
    return new GasSettings(
      reader.readObject(Gas),
      reader.readObject(Gas),
      reader.readObject(GasFees),
      reader.readObject(GasFees),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...GasSettings.getFields(this));
    if (fields.length !== GAS_SETTINGS_LENGTH) {
      throw new Error(
        `Invalid number of fields for GasSettings. Expected ${GAS_SETTINGS_LENGTH} but got ${fields.length}`,
      );
    }
    return fields;
  }

  static getFields(fields: FieldsOf<GasSettings>) {
    return [fields.gasLimits, fields.teardownGasLimits, fields.maxFeesPerGas, fields.maxPriorityFeesPerGas] as const;
  }
}
