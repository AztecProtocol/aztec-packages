import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxHash, TxStatus } from '@aztec/stdlib/tx';

import type { PendingTx } from '../../../storage/tagging_store/sender_tagging_store.js';
import type { TxInLogs } from './load_and_store_new_tagging_indexes.js';

/** A sync window's pending txs, grouped by what the window's logs evidence about each of them. */
export type LogClassification = {
  txHashesFinalized: TxHash[];
  txHashesWithExecutionReverted: TxHash[];
  txHashesAbsent: TxHash[];
};

/** Groups a window's pending txs by what its logs say about them. */
export function classifyPendingTxsFromLogs(
  pendingTxs: PendingTx[],
  txsInLogs: Map<string, TxInLogs>,
  finalizedBlockNumber: BlockNumber,
): LogClassification {
  const txHashesFinalized: TxHash[] = [];
  const txHashesWithExecutionReverted: TxHash[] = [];
  const txHashesAbsent: TxHash[] = [];

  for (const pendingTx of pendingTxs) {
    const txHash = TxHash.fromString(pendingTx.txHash);
    const txInLogs = txsInLogs.get(pendingTx.txHash);
    if (!txInLogs) {
      txHashesAbsent.push(txHash);
    } else if (txInLogs.blockNumber > finalizedBlockNumber) {
      // A tx in the logs is mined in the log's block, so it is finalized exactly when that block is at or below the
      // finalized tip. This one is not, so it belongs to no group until the tip catches up.
    } else if (txInLogs.taggingIndexes.includes(pendingTx.highestIndex)) {
      txHashesFinalized.push(txHash);
    } else {
      // A partially reverted tx: the revert dropped the logs carrying its higher indexes.
      txHashesWithExecutionReverted.push(txHash);
    }
  }

  return { txHashesFinalized, txHashesWithExecutionReverted, txHashesAbsent };
}

/** A batch of pending txs grouped by what their receipts report about them. */
export type ReceiptClassification = {
  txHashesFinalized: TxHash[];
  txHashesDropped: TxHash[];
  txHashesWithExecutionReverted: TxHash[];
};

/** Groups pending txs by what their receipts say, for the txs the logs could not resolve. */
export async function classifyPendingTxsFromReceipts(
  pending: TxHash[],
  aztecNode: AztecNode,
): Promise<ReceiptClassification> {
  const receipts = await Promise.all(pending.map(pendingTxHash => aztecNode.getTxReceipt(pendingTxHash)));

  const txHashesFinalized: TxHash[] = [];
  const txHashesDropped: TxHash[] = [];
  const txHashesWithExecutionReverted: TxHash[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const txHash = pending[i];

    if (receipt.status === TxStatus.FINALIZED) {
      // Tx has been included in a block and the corresponding block is finalized
      if (receipt.hasExecutionSucceeded()) {
        // No part of execution reverted - we just finalize all the indexes.
        txHashesFinalized.push(txHash);
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
      txHashesDropped.push(txHash);
    } else {
      // Tx is still pending, not yet finalized, or was mined successfully but not yet finalized --> we don't do
      // anything.
    }
  }

  return { txHashesFinalized, txHashesDropped, txHashesWithExecutionReverted };
}
