import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';
import { SortedTxStatuses, TxStatus } from '@aztec/stdlib/tx';

import { DefaultWaitOpts, type WaitOpts } from '../contract/wait_opts.js';

export const waitForNode = async (node: AztecNode, logger?: Logger) => {
  await retryUntil(async () => {
    try {
      logger?.verbose('Attempting to contact Aztec node...');
      await node.getNodeInfo();
      logger?.verbose('Contacted Aztec node');
      return true;
    } catch {
      logger?.verbose('Failed to contact Aztec Node');
    }
    return undefined;
  }, 'RPC Get Node Info');
};

/** Returns true if the receipt status is at least the desired status level. */
function hasReachedStatus(receipt: TxReceipt, desiredStatus: TxStatus): boolean {
  return SortedTxStatuses.indexOf(receipt.status) >= SortedTxStatuses.indexOf(desiredStatus);
}

/**
 * Waits for a transaction to be mined and returns its receipt.
 * @param node - The Aztec node to query for transaction status
 * @param txHash - The hash of the transaction to wait for
 * @param opts - Optional configuration for waiting behavior
 * @returns The transaction receipt
 * @throws If the transaction fails and dontThrowOnRevert is not set
 */
export async function waitForTx(node: AztecNode, txHash: TxHash, opts?: WaitOpts): Promise<TxReceipt> {
  const startTime = Date.now();
  const ignoreDroppedReceiptsFor = opts?.ignoreDroppedReceiptsFor ?? DefaultWaitOpts.ignoreDroppedReceiptsFor;
  const waitForStatus = opts?.waitForStatus ?? TxStatus.CHECKPOINTED;

  const receipt = await retryUntil(
    async () => {
      const txReceipt = await node.getTxReceipt(txHash);
      // If receipt is not yet available, try again
      if (txReceipt.isPending()) {
        return undefined;
      }
      // If the tx was "dropped", either return it or ignore based on timing.
      // We can ignore it at first because the transaction may have been sent to node 1, and now we're asking node 2 for the receipt.
      // If we don't allow a short grace period, we could incorrectly return a TxReceipt with status DROPPED.
      if (txReceipt.isDropped()) {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        if (!ignoreDroppedReceiptsFor || elapsedSeconds > ignoreDroppedReceiptsFor) {
          return txReceipt;
        }
        return undefined;
      }
      // Check if the receipt has reached the desired status level
      if (!hasReachedStatus(txReceipt, waitForStatus)) {
        return undefined;
      }
      return txReceipt;
    },
    'isMined',
    opts?.timeout ?? DefaultWaitOpts.timeout,
    opts?.interval ?? DefaultWaitOpts.interval,
  );

  if (!receipt.isMined()) {
    throw new Error(`Transaction ${txHash.toString()} was ${receipt.status}. Reason: ${receipt.error ?? 'unknown'}`);
  }
  if (!receipt.hasExecutionSucceeded() && !opts?.dontThrowOnRevert) {
    throw new Error(
      `Transaction ${txHash.toString()} reverted: ${receipt.executionResult}. Reason: ${receipt.error ?? 'unknown'}`,
    );
  }

  return receipt;
}

export { createAztecNodeClient, type AztecNode } from '@aztec/stdlib/interfaces/client';
