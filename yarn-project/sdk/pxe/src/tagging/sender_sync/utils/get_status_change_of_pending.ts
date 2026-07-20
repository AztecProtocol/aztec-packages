import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxHash, TxStatus } from '@aztec/stdlib/tx';

/** Classification of a batch of pending tx hashes by the status change implied by their receipts. */
export type StatusChange = {
  txHashesToFinalize: TxHash[];
  txHashesToDrop: TxHash[];
  txHashesWithExecutionReverted: TxHash[];
};

export const EMPTY_STATUS_CHANGE: StatusChange = {
  txHashesToFinalize: [],
  txHashesToDrop: [],
  txHashesWithExecutionReverted: [],
};

/** Concatenates two status changes field-by-field. */
export function mergeStatusChanges(a: StatusChange, b: StatusChange): StatusChange {
  return {
    txHashesToFinalize: [...a.txHashesToFinalize, ...b.txHashesToFinalize],
    txHashesToDrop: [...a.txHashesToDrop, ...b.txHashesToDrop],
    txHashesWithExecutionReverted: [...a.txHashesWithExecutionReverted, ...b.txHashesWithExecutionReverted],
  };
}

/**
 * Based on receipts obtained from `aztecNode` returns which pending transactions changed their status to finalized,
 * dropped, or execution-reverted (but mined).
 */
export async function getStatusChangeOfPending(pending: TxHash[], aztecNode: AztecNode): Promise<StatusChange> {
  // Get receipts for all pending tx hashes.
  const receipts = await Promise.all(pending.map(pendingTxHash => aztecNode.getTxReceipt(pendingTxHash)));

  const txHashesToFinalize: TxHash[] = [];
  const txHashesToDrop: TxHash[] = [];
  const txHashesWithExecutionReverted: TxHash[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const txHash = pending[i];

    if (receipt.status === TxStatus.FINALIZED) {
      // Tx has been included in a block and the corresponding block is finalized
      if (receipt.hasExecutionSucceeded()) {
        // No part of execution reverted - we just finalize all the indexes.
        txHashesToFinalize.push(txHash);
      } else if (receipt.hasExecutionReverted()) {
        // Tx was mined but execution reverted (app logic, teardown, or both). Some logs from the non-revertible
        // phase may still be onchain. We check which tags made it onchain and finalize those; drop the rest.
        txHashesWithExecutionReverted.push(txHash);
      } else {
        // Defensive check - this branch should never be triggered
        throw new Error(
          'Both hasExecutionSucceeded and hasExecutionReverted on the receipt returned false. This should never happen and it implies a bug. Please open an issue.',
        );
      }
    } else if (receipt.isDropped()) {
      // Tx was dropped from the mempool --> we drop the corresponding pending indexes.
      txHashesToDrop.push(txHash);
    } else {
      // Tx is still pending, not yet finalized, or was mined successfully but not yet finalized --> we don't do anything.
    }
  }

  return { txHashesToFinalize, txHashesToDrop, txHashesWithExecutionReverted };
}
