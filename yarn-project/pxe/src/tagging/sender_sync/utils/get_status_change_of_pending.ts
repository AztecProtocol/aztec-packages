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
  // Get receipts for all pending tx hashes and the finalized block number.
  const [receipts, tips] = await Promise.all([
    Promise.all(pending.map(pendingTxHash => aztecNode.getTxReceipt(pendingTxHash))),
    aztecNode.getL2Tips(),
  ]);

  const txHashesToFinalize: TxHash[] = [];
  const txHashesToDrop: TxHash[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const txHash = pending[i];

    if (
      receipt.status === TxStatus.SUCCESS &&
      receipt.blockNumber &&
      receipt.blockNumber <= tips.finalized.block.number
    ) {
      // Tx has been included in a block and the corresponding block is finalized --> we mark the indexes as
      // finalized.
      txHashesToFinalize.push(txHash);
    } else if (
      receipt.status === TxStatus.DROPPED ||
      receipt.status === TxStatus.APP_LOGIC_REVERTED ||
      receipt.status === TxStatus.TEARDOWN_REVERTED ||
      receipt.status === TxStatus.BOTH_REVERTED
    ) {
      // Tx was dropped or reverted --> we drop the corresponding pending indexes.
      // TODO(#17615): Don't drop pending indexes corresponding to non-revertible phases.
      txHashesToDrop.push(txHash);
    } else {
      // Tx is still pending or the corresponding block is not yet finalized --> we don't do anything.
    }
  }

  return { txHashesToFinalize, txHashesToDrop };
}
