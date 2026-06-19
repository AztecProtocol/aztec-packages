import type { WaitOpts } from '@aztec/aztec.js/contracts';
import { waitForTx } from '@aztec/aztec.js/node';
import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import type { L2BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, CheckpointTag } from '@aztec/stdlib/interfaces/client';
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

/** How the polled checkpoint number must relate to the target before {@link waitForNodeCheckpoint} resolves. */
export type CheckpointComparison = 'eq' | 'gte' | 'gt' | 'lte' | 'lt';

const checkpointComparators: Record<CheckpointComparison, (actual: number, target: number) => boolean> = {
  eq: (actual, target) => actual === target,
  gte: (actual, target) => actual >= target,
  gt: (actual, target) => actual > target,
  lte: (actual, target) => actual <= target,
  lt: (actual, target) => actual < target,
};

/** Options for {@link waitForNodeCheckpoint}. */
export type WaitForCheckpointOpts = {
  /** Which checkpoint tip to read; defaults to 'checkpointed'. */
  tag?: CheckpointTag;
  /** How the node's checkpoint number must relate to `target`; defaults to 'gte'. */
  comparison?: CheckpointComparison;
  /** Seconds before the poll rejects; defaults to 30. */
  timeout?: number;
  /** Seconds between polls; defaults to 0.5. */
  interval?: number;
};

/**
 * Polls a single node's checkpoint number until it relates to `target` per `opts.comparison`.
 * Replaces the `retryUntil(() => node.getChainTips().then(tips => tips.<tag>.checkpoint.number <op> target))`
 * polls duplicated across the reorg/proving tests, where the node may sync forward ('gte'/'gt'), prune
 * backward ('lte'/'lt'), or land exactly on a value ('eq').
 * @returns The node's checkpoint number once the comparison holds.
 */
export function waitForNodeCheckpoint(
  node: AztecNode,
  target: number,
  opts: WaitForCheckpointOpts = {},
): Promise<CheckpointNumber> {
  const tag = opts.tag ?? 'checkpointed';
  const comparison = opts.comparison ?? 'gte';
  const matches = checkpointComparators[comparison];
  return retryUntil(
    async () => {
      const checkpointNumber = await node.getCheckpointNumber(tag);
      return matches(checkpointNumber, target) ? checkpointNumber : undefined;
    },
    `node checkpoint ${tag} ${comparison} ${target}`,
    opts.timeout ?? 30,
    opts.interval ?? 0.5,
  );
}

/** Convenience for {@link waitForNodeCheckpoint} on the proven tip. */
export function waitForNodeProvenCheckpoint(
  node: AztecNode,
  target: number,
  opts: Omit<WaitForCheckpointOpts, 'tag'> = {},
): Promise<CheckpointNumber> {
  return waitForNodeCheckpoint(node, target, { ...opts, tag: 'proven' });
}

/**
 * Waits for all of `txHashes` to reach the desired status on `node`. The plural form of
 * {@link waitForTx}; resolves with the receipts in input order.
 */
export function waitForTxs(node: AztecNode, txHashes: TxHash[], opts?: WaitOpts): Promise<TxReceipt[]> {
  return Promise.all(txHashes.map(txHash => waitForTx(node, txHash, opts)));
}
