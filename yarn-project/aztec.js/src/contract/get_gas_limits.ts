import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
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
  const { totalGas, teardownGas } = simulationResult.gasUsed;

  // The simulated usage must fit within the per-tx maxima, otherwise the tx can never be included.
  if (totalGas.l2Gas > MAX_PROCESSABLE_L2_GAS) {
    throw new Error('Transaction consumes more l2 gas than the maximum processable gas');
  }
  if (totalGas.daGas > MAX_TX_DA_GAS) {
    throw new Error('Transaction consumes more da gas than a single tx can post to a blob');
  }

  // Pad the limits by the buffer, then cap each dimension at its per-tx maximum so the buffer cannot
  // push a limit past what inbound validation accepts.
  return {
    gasLimits: capGas(totalGas.mul(1 + pad)),
    teardownGasLimits: capGas(teardownGas.mul(1 + pad)),
  };
}

/** Caps each gas dimension at its per-tx maximum. */
function capGas(gas: Gas): Gas {
  return new Gas(Math.min(gas.daGas, MAX_TX_DA_GAS), Math.min(gas.l2Gas, MAX_PROCESSABLE_L2_GAS));
}
