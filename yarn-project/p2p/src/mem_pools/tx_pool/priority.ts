import { type Tx } from '@aztec/circuit-types';
import { Buffer32 } from '@aztec/foundation/buffer';

/**
 * Returns a string representing the priority of a tx.
 * Txs with a higher priority value are returned first when retrieving pending tx hashes.
 * We currently use the sum of the priority fees for the tx for this value, represented as hex.
 */
export function getPendingTxPriority(tx: Tx): string {
  const priorityFees = tx.getGasSettings().maxPriorityFeesPerGas;
  const totalFees = priorityFees.feePerDaGas.toBigInt() + priorityFees.feePerL2Gas.toBigInt();
  return Buffer32.fromBigInt(totalFees).toString();
}
