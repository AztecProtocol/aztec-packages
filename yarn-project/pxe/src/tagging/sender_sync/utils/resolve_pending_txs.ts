import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { type MinedTxReceipt, type TxHash, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import type { PendingTx } from '../../../storage/tagging_store/sender_tagging_store.js';
import { classifyPendingTxsFromLogs, classifyPendingTxsFromReceipts } from './classify_pending_txs.js';
import type { TxInLogs } from './load_and_store_new_tagging_indexes.js';

/** What a window's node reads established about each of its pending txs. */
export type ResolvedPendingTxs = {
  txHashesFinalizedFromLogs: TxHash[];
  txHashesFinalizedFromReceipts: TxHash[];
  txHashesDropped: TxHash[];
  /** Both sources land here: the logs when a surviving tag fell inside the window, a receipt otherwise. */
  receiptsWithExecutionReverted: MinedTxReceipt<{ includeTxEffect: true }>[];
};

/**
 * Resolves a window's pending txs. All of the window's node reads happen here.
 *
 * The logs it is handed settle most txs on their own, as {@link classifyPendingTxsFromLogs} explains. Two groups are
 * left over, and share one further round trip:
 *
 * - txs absent from the logs, whose receipt is what tells whether they are still in the mempool, dropped, or reverted;
 * - txs the logs show as reverted, which only their tx effect resolves.
 *
 * A third round trip is paid only when those receipts reveal a reverted tx, since its effect cannot be requested
 * before its status says it reverted.
 */
export async function resolvePendingTxs(
  pendingTxs: PendingTx[],
  txsInLogs: Map<string, TxInLogs>,
  finalizedBlockNumber: BlockNumber,
  aztecNode: AztecNode,
): Promise<ResolvedPendingTxs> {
  const statusFromLogs = classifyPendingTxsFromLogs(pendingTxs, txsInLogs, finalizedBlockNumber);

  const [statusOfAbsent, receiptsOfRevertedInLogs] = await Promise.all([
    classifyPendingTxsFromReceipts(statusFromLogs.txHashesAbsent, aztecNode),
    getReceiptsWithEffect(statusFromLogs.txHashesWithExecutionReverted, aztecNode),
  ]);

  const receiptsOfRevertedAbsent = await getReceiptsWithEffect(statusOfAbsent.txHashesWithExecutionReverted, aztecNode);

  return {
    txHashesFinalizedFromLogs: statusFromLogs.txHashesFinalized,
    txHashesFinalizedFromReceipts: statusOfAbsent.txHashesFinalized,
    txHashesDropped: statusOfAbsent.txHashesDropped,
    // Both groups were judged finalized before this fetch, the first off our own tip and the second off an earlier
    // receipt, so both are confirmed against what the node says now. Finalizing off a reorgeable block would burn
    // the indexes.
    receiptsWithExecutionReverted: [...receiptsOfRevertedInLogs, ...receiptsOfRevertedAbsent].filter(isFinalized),
  };
}

function getReceiptsWithEffect(txHashes: TxHash[], aztecNode: AztecNode) {
  return Promise.all(txHashes.map(txHash => aztecNode.getTxReceipt(txHash, { includeTxEffect: true })));
}

function isFinalized(
  receipt: TxReceipt<{ includeTxEffect: true }>,
): receipt is MinedTxReceipt<{ includeTxEffect: true }> {
  return receipt.status === TxStatus.FINALIZED;
}
