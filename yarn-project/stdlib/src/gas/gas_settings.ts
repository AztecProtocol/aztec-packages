import { GAS_SETTINGS_LENGTH, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT, MAX_PROCESSABLE_L2_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, BufferSink, FieldReader, serializeToFields, serializeToSink } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { Gas, GasDimensions } from './gas.js';
import { GasFees } from './gas_fees.js';

/** Approximate max DA gas limit. Arbitrary, assuming 4 blocks per checkpoint — users should use gas estimation. */
export const APPROXIMATE_MAX_DA_GAS_PER_BLOCK = Math.floor(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 4);
/** Fallback teardown L2 gas limit. Arbitrary — users should use gas estimation. */
export const FALLBACK_TEARDOWN_L2_GAS_LIMIT = Math.floor(MAX_PROCESSABLE_L2_GAS / 8);
/** Fallback teardown DA gas limit. Arbitrary — users should use gas estimation. */
export const FALLBACK_TEARDOWN_DA_GAS_LIMIT = Math.floor(APPROXIMATE_MAX_DA_GAS_PER_BLOCK / 2);

// For gas estimation, we use intentionally high limits above what the network can process,
// so the simulation runs without hitting gas caps. Since teardown gas is counted towards total,
// the total estimation limit is teardown + max processable.
export const GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT = MAX_PROCESSABLE_L2_GAS;
export const GAS_ESTIMATION_L2_GAS_LIMIT = GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT + MAX_PROCESSABLE_L2_GAS;
export const GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;
export const GAS_ESTIMATION_DA_GAS_LIMIT = GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT + MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;

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

  /**
   * Fills in gas limits high enough for transactions to be included in most cases.
   * gasLimits is set to the maximum the protocol allows; since teardown gas is reserved
   * from gasLimits during private execution (see gas_meter.nr), the effective gas available
   * for app logic will be gasLimits - teardownGasLimits - privateOverhead.
   * The DA gas limit is set to an approximate max per block assuming 4 blocks per checkpoint,
   * since using the maximum per checkpoint would cause nodes to reject transactions.
   * These values won't work if:
   *  - Teardown consumes more than the arbitrarily assigned fallback limits
   *  - The rest of the transaction consumes more than the remaining gas after teardown
   *  - The DA gas limit is too low for the transaction, while still within the checkpoint limit
   */
  static fallback(overrides: {
    gasLimits?: Gas;
    teardownGasLimits?: Gas;
    maxFeesPerGas: GasFees;
    maxPriorityFeesPerGas?: GasFees;
  }) {
    return GasSettings.from({
      gasLimits: overrides.gasLimits ?? {
        l2Gas: MAX_PROCESSABLE_L2_GAS,
        daGas: APPROXIMATE_MAX_DA_GAS_PER_BLOCK,
      },
      teardownGasLimits: overrides.teardownGasLimits ?? {
        l2Gas: FALLBACK_TEARDOWN_L2_GAS_LIMIT,
        daGas: FALLBACK_TEARDOWN_DA_GAS_LIMIT,
      },
      maxFeesPerGas: overrides.maxFeesPerGas,
      maxPriorityFeesPerGas: overrides.maxPriorityFeesPerGas ?? GasFees.empty(),
    });
  }

  /**
   * Gas settings for simulation/estimation only.
   * Since teardown gas is reserved upfront from gasLimits during private execution (see gas_meter.nr),
   * the effective gas available for app logic is gasLimits - teardownGasLimits - privateOverhead.
   * To ensure estimation never hits gas caps, we set both limits above what the protocol allows:
   * teardown gets MAX_PROCESSABLE and gasLimits gets teardown + MAX_PROCESSABLE, so the full
   * processable amount remains available for each phase independently. To be used in conjunction
   * with skipTxValidation: true during public simulation, or the node would reject the transaction
   * outright due to gas limits being above protocol max.
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

  toBuffer(): Buffer;
  toBuffer(sink: BufferSink): void;
  toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    serializeToSink(sink, ...GasSettings.getFields(this));
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
