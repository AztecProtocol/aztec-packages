import { type Gas } from '@aztec/circuits.js';

export interface GasUsed {
  /**
   * Total gas used across both private and public executions.
   * Note that this does not determine the transaction fee. The fee is calculated using `teardownGasLimits` from
   * `GasSettings`, rather than actual teardown gas.
   */
  totalGas: Gas;

  /** Total gas used during public execution, including teardown gas */
  publicGas: Gas;

  /**
   * The actual gas used in the teardown phase.
   */
  teardownGas: Gas;
}
