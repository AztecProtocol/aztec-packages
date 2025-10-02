import { AVM_MAX_PROCESSABLE_L2_GAS } from '@aztec/constants';
import { Gas } from '@aztec/stdlib/gas';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

/**
 * Returns suggested total and teardown gas limits for a simulated tx.
 * @param pad - Percentage to pad the suggested gas limits by, (as decimal, e.g., 0.10 for 10%).
 */
export function getGasLimits(
  simulationResult: TxSimulationResult,
  pad = 0.1,
): {
  /**
   * Gas limit for the tx, excluding teardown gas
   */
  gasLimits: Gas;
  /**
   * Gas limit for the teardown phase
   */
  teardownGasLimits: Gas;
} {
  // Total gas does not use the teardown gas limit, but the actual total gas used by the tx.
  const gasLimits = simulationResult.gasUsed.totalGas.mul(1 + pad);
  const teardownGasLimits = simulationResult.gasUsed.teardownGas.mul(1 + pad);

  if (gasLimits.l2Gas > AVM_MAX_PROCESSABLE_L2_GAS) {
    throw new Error('Transaction consumes more gas than the AVM maximum processable gas');
  }
  return {
    gasLimits,
    teardownGasLimits,
  };
}
