import { DEFAULT_GAS_LIMIT, DEFAULT_TEARDOWN_GAS_LIMIT, GAS_SETTINGS_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
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

  /** Default gas settings to use when user has not provided them. Requires explicit max fees per gas. */
  static default(overrides: {
    gasLimits?: Gas;
    teardownGasLimits?: Gas;
    maxFeesPerGas: GasFees;
    maxPriorityFeesPerGas?: GasFees;
  }) {
    return GasSettings.from({
      gasLimits: overrides.gasLimits ?? { l2Gas: DEFAULT_GAS_LIMIT, daGas: DEFAULT_GAS_LIMIT },
      teardownGasLimits: overrides.teardownGasLimits ?? {
        l2Gas: DEFAULT_TEARDOWN_GAS_LIMIT,
        daGas: DEFAULT_TEARDOWN_GAS_LIMIT,
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
