import { DA_GAS_PER_FIELD, MAX_PROCESSABLE_L2_GAS, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS } from '@aztec/constants';
import { Gas } from '@aztec/stdlib/gas';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

// The most DA gas a single tx can consume: its effects cannot encode more than
// MAX_TX_BLOB_DATA_SIZE_IN_FIELDS fields in a blob, each costing DA_GAS_PER_FIELD. Declaring a higher DA
// gas limit gets the tx rejected by inbound validation (see GasLimitsValidator), so the padded estimate
// must be capped here. The unpadded estimate never exceeds this, so capping never under-provisions a tx.
const MAX_TX_DA_GAS = MAX_TX_BLOB_DATA_SIZE_IN_FIELDS * DA_GAS_PER_FIELD;

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

  if (gasLimits.l2Gas > MAX_PROCESSABLE_L2_GAS) {
    throw new Error('Transaction consumes more l2 gas than the maximum processable gas');
  }

  return {
    gasLimits: capDaGas(gasLimits),
    teardownGasLimits: capDaGas(teardownGasLimits),
  };
}

/** Caps the DA gas dimension at the per-tx maximum so the padding buffer can't push the tx over the inbound limit. */
function capDaGas(gas: Gas): Gas {
  return new Gas(Math.min(gas.daGas, MAX_TX_DA_GAS), gas.l2Gas);
}
