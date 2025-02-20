import { type TxSimulationResult } from '@aztec/circuit-types';
import { type Gas } from '@aztec/circuits.js';

/**
 * Returns suggested total and teardown gas limits for a simulated tx.
 * Note that public gas usage is only accounted for if the publicOutput is present.
 * @param pad - Percentage to pad the suggested gas limits by, (as decimal, e.g., 0.10 for 10%).
 */
export function getGasLimits(
  simulationResult: TxSimulationResult,
  pad = 0.1,
): {
  /**
   * Total gas used across private and public
   */
  totalGas: Gas;
  /**
   * Teardown gas used
   */
  teardownGas: Gas;
} {
  return {
    totalGas: simulationResult.gasUsed.totalGas.mul(1 + pad),
    teardownGas: simulationResult.gasUsed.teardownGas.mul(1 + pad),
  };
}
