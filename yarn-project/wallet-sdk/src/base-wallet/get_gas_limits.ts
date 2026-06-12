import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Gas, type GasUsed } from '@aztec/stdlib/gas';

/**
 * Returns suggested total and teardown gas limits for a simulated tx, clamped to the network's per-tx
 * admission limits.
 *
 * The network only admits transactions that declare up to `maxTxGasLimits` per dimension (the
 * node-advertised `txsLimits.gas`). Wallets pass the value read from their own node info, but since node info
 * is remote input it is defensively clamped here to the per-tx protocol maxima so a value above them is never
 * honored. If the simulated usage already exceeds the resulting admission limits the tx can never be included,
 * so this throws a descriptive error instead of returning a limit the node would reject. Otherwise it pads the
 * usage and clamps each dimension to the admission limit.
 * @param gasUsed - The gas actually consumed during simulation.
 * @param maxTxGasLimits - The maximum gas a single tx may declare on this network (the node-advertised `txsLimits.gas`).
 * @param pad - Fraction to pad the suggested gas limits by (as a decimal, e.g. 0.1 for 10%). The effective
 * padding shrinks to zero as usage approaches the network limit, since the network will not admit a higher
 * declared limit regardless of the buffer.
 */
export function getGasLimits(
  gasUsed: GasUsed,
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
  const { totalGas, teardownGas } = gasUsed;

  // `maxTxGasLimits` is the node-advertised admission limit. Node info is remote input, so we defensively
  // clamp to the per-tx protocol maxima so a value above them can never be honored.
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

/**
 * Validates that caller-declared gas limits do not exceed the network's per-tx admission limits, throwing a
 * descriptive error per dimension when they do. The node's inbound validation checks declared
 * `gasSettings.gasLimits`, so we mirror that here to surface the rejection locally before the tx is sent.
 * @param gasLimits - The gas limits the transaction will declare.
 * @param maxTxGasLimits - The maximum gas a single tx may declare on this network (the node-advertised `txsLimits.gas`).
 */
export function assertGasLimitsWithinNetworkLimits(gasLimits: Gas, maxTxGasLimits: Gas): void {
  if (gasLimits.daGas > maxTxGasLimits.daGas) {
    throw new Error(
      `Declared DA gas limit (${gasLimits.daGas}) exceeds the maximum this network allows per tx (${maxTxGasLimits.daGas})`,
    );
  }
  if (gasLimits.l2Gas > maxTxGasLimits.l2Gas) {
    throw new Error(
      `Declared L2 gas limit (${gasLimits.l2Gas}) exceeds the maximum this network allows per tx (${maxTxGasLimits.l2Gas})`,
    );
  }
}
