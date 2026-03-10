import { minBigint } from '@aztec/foundation/bigint';
import { Buffer32 } from '@aztec/foundation/buffer';
import type { Tx } from '@aztec/stdlib/tx';

/**
 * Returns a string representing the priority of a tx.
 * Txs with a higher priority value are returned first when retrieving pending tx hashes.
 * Priority is the estimated total tip: capped per-gas priority fees multiplied by gas limits.
 */
export function getPendingTxPriority(tx: Tx): string {
  return Buffer32.fromBigInt(getTxPriorityFee(tx)).toString();
}

/** Returns the estimated total priority fee (tip) for a tx, weighted by gas limits. */
export function getTxPriorityFee(tx: Tx): bigint {
  const { maxPriorityFeesPerGas: priorityFees, maxFeesPerGas, gasLimits } = tx.getGasSettings();
  return (
    minBigint(maxFeesPerGas.feePerDaGas, priorityFees.feePerDaGas) * BigInt(gasLimits.daGas) +
    minBigint(maxFeesPerGas.feePerL2Gas, priorityFees.feePerL2Gas) * BigInt(gasLimits.l2Gas)
  );
}
