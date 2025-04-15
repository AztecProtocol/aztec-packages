import type { Gas } from './gas.js';

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
