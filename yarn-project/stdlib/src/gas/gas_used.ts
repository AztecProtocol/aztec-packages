import { Gas } from './gas.js';

export interface GasUsed {
  /**
   * Total gas used across both private and public executions.
   * Note that this does not determine the transaction fee. The fee is calculated with billedGas, which uses `teardownGasLimits` from
   * `GasSettings`, rather than actual teardown gas.
   */
  totalGas: Gas;

  /** Total gas used during public execution, including actual teardown gas */
  publicGas: Gas;

  /**
   * The actual gas used in the teardown phase.
   */
  teardownGas: Gas;

  /**
   * The gas billed for the transaction. This uses teardown gas limit instead of actual teardown gas.
   */
  billedGas: Gas;
}

/**
 * Creates a GasUsed from a plain object without Zod validation.
 * This method is optimized for performance and skips validation, making it suitable
 * for deserializing trusted data (e.g., from C++ via MessagePack).
 * @param obj - Plain object containing GasUsed fields
 * @returns A GasUsed object
 */
export function gasUsedFromPlainObject(obj: any): GasUsed {
  return {
    totalGas: Gas.fromPlainObject(obj.totalGas),
    publicGas: Gas.fromPlainObject(obj.publicGas),
    teardownGas: Gas.fromPlainObject(obj.teardownGas),
    billedGas: Gas.fromPlainObject(obj.billedGas),
  };
}

// Export as a namespace to match the pattern
export const GasUsed = {
  fromPlainObject: gasUsedFromPlainObject,
};
