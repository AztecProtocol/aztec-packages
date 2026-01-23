import { Buffer32 } from '@aztec/foundation/buffer';
import type { Tx } from '@aztec/stdlib/tx';

/**
 * Returns a string representing the priority of a tx.
 * Txs with a higher priority value are returned first when retrieving pending tx hashes.
 * We currently use the sum of the priority fees for the tx for this value, represented as hex.
 */
export function getPendingTxPriority(tx: Tx): string {
  return Buffer32.fromBigInt(getTxPriorityFee(tx)).toString();
}

/**
 * Returns the priority of a tx.
 */
export function getTxPriorityFee(tx: Tx): bigint {
  const priorityFees = tx.getGasSettings().maxPriorityFeesPerGas;
  const totalFees = priorityFees.feePerDaGas + priorityFees.feePerL2Gas;
  return totalFees;
}
