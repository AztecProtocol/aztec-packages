import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxHash, TxStatus } from '@aztec/stdlib/tx';

/**
 * Based on receipts obtained from `aztecNode` returns which pending transactions changed their status to finalized or
 * dropped.
 */
export async function getStatusChangeOfPending(
  pending: TxHash[],
  aztecNode: AztecNode,
): Promise<{ txHashesToFinalize: TxHash[]; txHashesToDrop: TxHash[] }> {
  // Get receipts for all pending tx hashes.
  const receipts = await Promise.all(pending.map(pendingTxHash => aztecNode.getTxReceipt(pendingTxHash)));

  const txHashesToFinalize: TxHash[] = [];
  const txHashesToDrop: TxHash[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const txHash = pending[i];

    if (receipt.status === TxStatus.FINALIZED && receipt.hasExecutionSucceeded()) {
      // Tx has been included in a block and the corresponding block is finalized --> we mark the indexes as
      // finalized.
      txHashesToFinalize.push(txHash);
    } else if (receipt.isDropped() || receipt.hasExecutionReverted()) {
      // Tx was dropped or reverted --> we drop the corresponding pending indexes.
      // TODO(#17615): Don't drop pending indexes corresponding to non-revertible phases.
      txHashesToDrop.push(txHash);
    } else {
      // Tx is still pending, not yet finalized, or was mined successfully but not yet finalized --> we don't do anything.
    }
  }

  return { txHashesToFinalize, txHashesToDrop };
}
