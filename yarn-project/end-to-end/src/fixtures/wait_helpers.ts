import type { WaitOpts } from '@aztec/aztec.js/contracts';
import type { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/aztec.js/protocol';
import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import type { L2BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, CheckpointTag } from '@aztec/stdlib/interfaces/client';
import type { L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
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
  // Wrap the matched value: retryUntil treats any falsy return as "keep polling", so a legitimate
  // match of block 0 (e.g. a freshly-pruned tip) would otherwise loop until timeout.
  return retryUntil(
    async () => {
      const blockNumber = await node.getBlockNumber(tag);
      return blockNumber >= target ? { blockNumber } : undefined;
    },
    `block ${tag} >= ${target}`,
    opts.timeout ?? 60,
    opts.interval ?? 1,
  ).then(({ blockNumber }) => blockNumber);
}

/** Convenience for {@link waitForBlockNumber} on the proven tip. */
export function waitForProvenBlock(
  node: AztecNode,
  target: number,
  opts: Omit<WaitForBlockOpts, 'tag'> = {},
): Promise<BlockNumber> {
  return waitForBlockNumber(node, target, { ...opts, tag: 'proven' });
}

/** Compares the node's checkpoint number against the target; defaults to `>=`. */
export type CheckpointComparator = (actual: number, target: number) => boolean;

/** Options for {@link waitForNodeCheckpoint}. */
export type WaitForCheckpointOpts = {
  /** Which checkpoint tip to read; defaults to 'checkpointed'. */
  tag?: CheckpointTag;
  /** How the node's checkpoint number must relate to `target`; defaults to `(actual, target) => actual >= target`. */
  compare?: CheckpointComparator;
  /** Seconds before the poll rejects; defaults to 30. */
  timeout?: number;
  /** Seconds between polls; defaults to 0.5. */
  interval?: number;
};

/**
 * Polls a single node's checkpoint number until `opts.compare(actual, target)` holds. Replaces the
 * `retryUntil(() => node.getChainTips().then(tips => tips.<tag>.checkpoint.number <op> target))` polls
 * duplicated across the reorg/proving tests, where the node may sync forward, prune backward, or land
 * exactly on a value — the caller passes the comparator lambda for whichever it expects.
 * @returns The node's checkpoint number once the comparison holds.
 */
export function waitForNodeCheckpoint(
  node: AztecNode,
  target: number,
  opts: WaitForCheckpointOpts = {},
): Promise<CheckpointNumber> {
  const tag = opts.tag ?? 'checkpointed';
  const compare = opts.compare ?? ((actual, target) => actual >= target);
  // Wrap the matched value: retryUntil treats any falsy return as "keep polling", so a legitimate
  // match of checkpoint 0 (e.g. proven === 0 or checkpointed <= 1 after a prune) would otherwise
  // loop until timeout instead of resolving.
  return retryUntil(
    async () => {
      const checkpointNumber = await node.getCheckpointNumber(tag);
      return compare(checkpointNumber, target) ? { checkpointNumber } : undefined;
    },
    `node checkpoint ${tag} ${compare} ${target}`,
    opts.timeout ?? 30,
    opts.interval ?? 0.5,
  ).then(({ checkpointNumber }) => checkpointNumber);
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

/** Options for {@link waitForBlocksAtSlots}. */
export type WaitForBlocksAtSlotsOpts = {
  /** Block number to start scanning from; defaults to the initial L2 block. */
  from?: BlockNumber;
  /** How many blocks to fetch per poll; defaults to 10. */
  limit?: number;
  /** Seconds before the poll rejects; defaults to 20. */
  timeout?: number;
  /** Seconds between polls; defaults to 1. */
  interval?: number;
};

/**
 * Polls `node.getBlocks` until every slot in `slots` is present among the fetched blocks' slot
 * numbers. Replaces the hand-rolled `retryUntil` over `getBlocks(...).map(getSlot)` membership check.
 */
export async function waitForBlocksAtSlots(
  node: AztecNode,
  slots: SlotNumber[],
  opts: WaitForBlocksAtSlotsOpts = {},
): Promise<void> {
  const from = opts.from ?? INITIAL_L2_BLOCK_NUM;
  const limit = opts.limit ?? 10;
  await retryUntil(
    async () => {
      const blocks = await node.getBlocks(from, limit);
      const foundSlots = blocks.map(block => block.header.getSlot());
      return slots.every(slot => foundSlots.includes(slot)) || undefined;
    },
    `blocks at slots ${slots.join(', ')}`,
    opts.timeout ?? 20,
    opts.interval ?? 1,
  );
}

/**
 * Polls `node.getL2ToL1MembershipWitness(txHash, message)` until a witness is available, resolving
 * with it. Wraps the `retryUntil` the cross-chain tests hand-roll while waiting for an L2-to-L1
 * message's membership witness to become provable.
 */
export function waitForL2ToL1Witness(
  node: AztecNode,
  txHash: TxHash,
  message: Fr,
  opts: { timeout?: number; interval?: number } = {},
): Promise<L2ToL1MembershipWitness> {
  return retryUntil(
    () => node.getL2ToL1MembershipWitness(txHash, message),
    `L2-to-L1 membership witness for ${txHash.toString()}`,
    opts.timeout ?? 30,
    opts.interval ?? 1,
  );
}
