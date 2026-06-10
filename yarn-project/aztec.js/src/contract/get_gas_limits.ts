import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Gas } from '@aztec/stdlib/gas';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

/**
 * Returns suggested total and teardown gas limits for a simulated tx, clamped to the network's per-tx
 * admission limits.
 *
 * The network only admits transactions that declare up to `maxTxGasLimits` per dimension (the
 * node-advertised `txsLimits.gas`). That value is defensively clamped here to the per-tx protocol maxima so
 * a caller-supplied limit above them is never honored. If the simulated usage already exceeds the resulting
 * admission limits the tx can never be included, so this throws a descriptive error instead of returning a
 * limit the node would reject. Otherwise it pads the usage and clamps each dimension to the admission limit.
 * @param simulationResult - The result of simulating the tx, used to read the gas actually consumed.
 * @param maxTxGasLimits - The maximum gas a single tx may declare on this network (`Wallet.getMaxTxGasLimits()`).
 * @param pad - Fraction to pad the suggested gas limits by (as a decimal, e.g. 0.1 for 10%). The effective
 * padding shrinks to zero as usage approaches the network limit, since the network will not admit a higher
 * declared limit regardless of the buffer.
 */
export function getGasLimits(
  simulationResult: TxSimulationResult,
  maxTxGasLimits: Gas,
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

  // `maxTxGasLimits` is the node-advertised admission limit and our wallets pass node-clamped values, but
  // this is exported public API. Defensively clamp to the per-tx protocol maxima so a caller-supplied limit
  // above them can never be honored.
  const maxLimits = new Gas(
    Math.min(maxTxGasLimits.daGas, MAX_TX_DA_GAS),
    Math.min(maxTxGasLimits.l2Gas, MAX_PROCESSABLE_L2_GAS),
  );

  // The simulated usage must fit within the admission limits, otherwise the tx can never be included.
  if (totalGas.daGas > maxLimits.daGas) {
    throw new Error(
      `Transaction consumes ${totalGas.daGas} DA gas but the network only admits transactions declaring up to ${maxLimits.daGas} DA gas`,
    );
  }
  if (totalGas.l2Gas > maxLimits.l2Gas) {
    throw new Error(
      `Transaction consumes ${totalGas.l2Gas} L2 gas but the network only admits transactions declaring up to ${maxLimits.l2Gas} L2 gas`,
    );
  }

  // Pad the limits by the buffer, then cap each dimension at the admission limit so the buffer cannot push a
  // declared limit past what inbound validation accepts. Teardown is part of the total, so clamping it to the
  // admission limit is safe.
  return {
    gasLimits: padGas(totalGas, pad, maxLimits),
    teardownGasLimits: padGas(teardownGas, pad, maxLimits),
  };
}

/** Pads each gas dimension, capping it at the network admission limit. */
function padGas(gas: Gas, pad: number, cap: Gas): Gas {
  const padded = gas.mul(1 + pad);
  return new Gas(Math.min(padded.daGas, cap.daGas), Math.min(padded.l2Gas, cap.l2Gas));
}
