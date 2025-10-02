import { retryUntil } from '@aztec/foundation/retry';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import type { TxReceipt } from '../index.js';
import { DefaultWaitOpts } from './sent_tx.js';

/**
 * Options for waiting for a transaction to be proven.
 */
export type WaitForProvenOpts = {
  /** Time to wait for the tx to be proven before timing out */
  provenTimeout?: number;
  /** Elapsed time between polls to the node */
  interval?: number;
};

export const DefaultWaitForProvenOpts: WaitForProvenOpts = {
  provenTimeout: 600,
  interval: DefaultWaitOpts.interval,
};

/**
 * Wait for a transaction to be proven by polling the node
 */
export async function waitForProven(node: AztecNode, receipt: TxReceipt, opts?: WaitForProvenOpts) {
  if (!receipt.blockNumber) {
    throw new Error(`Cannot wait for proven: receipt of tx ${receipt.txHash} does not have a block number`);
  }
  return await retryUntil(
    async () => {
      const provenBlock = await node.getProvenBlockNumber();
      return provenBlock >= receipt.blockNumber! ? provenBlock : undefined;
    },
    'isProven',
    opts?.provenTimeout ?? DefaultWaitForProvenOpts.provenTimeout,
    opts?.interval ?? DefaultWaitForProvenOpts.interval,
  );
}
