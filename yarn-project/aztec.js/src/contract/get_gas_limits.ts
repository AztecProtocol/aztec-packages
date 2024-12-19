import { type GasUsed, type TxSimulationResult } from '@aztec/circuit-types';

/**
 * Returns suggested total and teardown gas limits for a simulated tx.
 * Note that public gas usage is only accounted for if the publicOutput is present.
 * @param pad - Percentage to pad the suggested gas limits by, (as decimal, e.g., 0.10 for 10%).
 */
export function getGasLimits(simulationResult: TxSimulationResult, pad = 0.1): GasUsed {
  return {
    totalGas: simulationResult.gasUsed.totalGas.mul(1 + pad),
    teardownGas: simulationResult.gasUsed.teardownGas.mul(1 + pad),
    publicGas: simulationResult.gasUsed.publicGas.mul(1 + pad),
  };
}
