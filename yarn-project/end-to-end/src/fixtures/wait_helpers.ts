import type { WaitOpts } from '@aztec/aztec.js/contracts';
import { waitForTx } from '@aztec/aztec.js/node';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import type { L2BlockTag } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';

/** Options for the block-number polling helpers. */
export type WaitForBlockOpts = {
  /** Which chain tip to read; defaults to 'proposed'. */
  tag?: L2BlockTag;
  /** Seconds before the poll rejects; defaults to 60. */
  timeout?: number;
  /** Seconds between polls; defaults to 1. */
  interval?: number;
};

/**
 * Polls `node.getBlockNumber(tag)` until it reaches `target`. Replaces the ad-hoc
 * `retryUntil(() => node.getBlockNumber(tag) >= target)` polls scattered across the suite.
 * @returns The block number once it reaches `target`.
 */
export function waitForBlockNumber(node: AztecNode, target: number, opts: WaitForBlockOpts = {}): Promise<BlockNumber> {
  const tag = opts.tag ?? 'proposed';
  return retryUntil(
    async () => {
      const blockNumber = await node.getBlockNumber(tag);
      return blockNumber >= target ? blockNumber : undefined;
    },
    `block ${tag} >= ${target}`,
    opts.timeout ?? 60,
    opts.interval ?? 1,
  );
}

/** Convenience for {@link waitForBlockNumber} on the proven tip. */
export function waitForProvenBlock(
  node: AztecNode,
  target: number,
  opts: Omit<WaitForBlockOpts, 'tag'> = {},
): Promise<BlockNumber> {
  return waitForBlockNumber(node, target, { ...opts, tag: 'proven' });
}

/**
 * Waits for all of `txHashes` to reach the desired status on `node`. The plural form of
 * {@link waitForTx}; resolves with the receipts in input order.
 */
export function waitForTxs(node: AztecNode, txHashes: TxHash[], opts?: WaitOpts): Promise<TxReceipt[]> {
  return Promise.all(txHashes.map(txHash => waitForTx(node, txHash, opts)));
}
