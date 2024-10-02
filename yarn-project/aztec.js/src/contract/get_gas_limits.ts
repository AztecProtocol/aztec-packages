import { PublicKernelPhase, type TxSimulationResult } from '@aztec/circuit-types';
import { Gas } from '@aztec/circuits.js';

/**
 * Returns suggested total and teardown gas limits for a simulated tx.
 * Note that public gas usage is only accounted for if the publicOutput is present.
 * @param pad - Percentage to pad the suggested gas limits by, defaults to 10%.
 */
export function getGasLimits(simulationResult: TxSimulationResult, simulationTeardownGasLimits: Gas, pad = 0.1) {
  const simulatedTx = simulationResult.toSimulatedTx();
  const privateGasUsed = simulatedTx.data.publicInputs.end.gasUsed
    .sub(simulationTeardownGasLimits)
    .add(simulatedTx.data.forPublic?.endNonRevertibleData.gasUsed ?? Gas.empty());
  if (simulationResult.publicOutput) {
    const publicGasUsed = Object.values(simulationResult.publicOutput.gasUsed)
      .filter(Boolean)
      .reduce((total, current) => total.add(current), Gas.empty());
    const teardownGas = simulationResult.publicOutput.gasUsed[PublicKernelPhase.TEARDOWN] ?? Gas.empty();

    return {
      totalGas: privateGasUsed.add(publicGasUsed).mul(1 + pad),
      teardownGas: teardownGas.mul(1 + pad),
    };
  }
  return { totalGas: privateGasUsed.mul(1 + pad), teardownGas: Gas.empty() };
}
