import type { WaitOpts } from '@aztec/aztec.js/contracts';
import type { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/aztec.js/protocol';
import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import type { Sequencer, SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import type { L2BlockTag } from '@aztec/stdlib/block';
import type { AztecNode, CheckpointTag } from '@aztec/stdlib/interfaces/client';
import type { L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import type { TxHash, TxReceipt, TxStatus } from '@aztec/stdlib/tx';

/** Options for the block-number polling helpers. */
export type WaitForBlockOpts = {
  /** Which chain tip to read; defaults to 'proposed'. */
  tag?: L2BlockTag;
  /** How the node's block number must relate to `target`; defaults to `(actual, target) => actual >= target`. */
  compare?: (actual: number, target: number) => boolean;
  /** Seconds before the poll rejects; defaults to 60. */
  timeout?: number;
  /** Seconds between polls; defaults to 1. */
  interval?: number;
};

/**
 * Polls `node.getBlockNumber(tag)` until `opts.compare(actual, target)` holds (default `>=`). Replaces
 * the ad-hoc `retryUntil(() => node.getBlockNumber(tag) <op> target)` polls scattered across the suite,
 * where the node may sync forward or prune backward — the caller passes the comparator for whichever it
 * expects.
 * @returns The block number once the comparison holds.
 */
export function waitForBlockNumber(node: AztecNode, target: number, opts: WaitForBlockOpts = {}): Promise<BlockNumber> {
  const tag = opts.tag ?? 'proposed';
  const compare = opts.compare ?? ((actual, target) => actual >= target);
  // Wrap the matched value: retryUntil treats any falsy return as "keep polling", so a legitimate
  // match of block 0 (e.g. a freshly-pruned tip) would otherwise loop until timeout.
  return retryUntil(
    async () => {
      const blockNumber = await node.getBlockNumber(tag);
      return compare(blockNumber, target) ? { blockNumber } : undefined;
    },
    `block ${tag} ${compare} ${target}`,
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

/** Options for the tx-receipt polling helpers. */
export type WaitForTxReceiptOpts = {
  /** Seconds before the poll rejects; defaults to 30. */
  timeout?: number;
  /** Seconds between polls; defaults to 1. */
  interval?: number;
};

/**
 * Polls `node.getTxReceipt(txHash)` until `predicate(receipt)` holds, resolving with the receipt.
 * Wraps the `retryUntil` that the block-building reorg tests hand-roll while waiting for a tx to
 * transition between statuses (pruned, re-included, ...).
 * @returns The receipt once the predicate holds.
 */
export function waitForTxReceipt(
  node: AztecNode,
  txHash: TxHash,
  predicate: (receipt: TxReceipt) => boolean,
  opts: WaitForTxReceiptOpts = {},
): Promise<TxReceipt> {
  return retryUntil(
    async () => {
      const receipt = await node.getTxReceipt(txHash);
      return predicate(receipt) ? { receipt } : undefined;
    },
    `tx receipt for ${txHash.toString()}`,
    opts.timeout ?? 30,
    opts.interval ?? 1,
  ).then(({ receipt }) => receipt);
}

/** Polls until `node.getTxReceipt(txHash).status === status`. Thin wrapper over {@link waitForTxReceipt}. */
export function waitForTxStatus(
  node: AztecNode,
  txHash: TxHash,
  status: TxStatus,
  opts: WaitForTxReceiptOpts = {},
): Promise<TxReceipt> {
  return waitForTxReceipt(node, txHash, receipt => receipt.status === status, opts);
}

/** Compares the node's pending-tx count against the target; defaults to `>=`. */
export type PendingTxCountComparator = (actual: number, target: number) => boolean;

/** Options for {@link waitForPendingTxCount}. */
export type WaitForPendingTxCountOpts = {
  /** How the node's pending-tx count must relate to `target`; defaults to `(actual, target) => actual >= target`. */
  compare?: PendingTxCountComparator;
  /** Seconds before the poll rejects; defaults to 30. */
  timeout?: number;
  /** Seconds between polls; defaults to 1. */
  interval?: number;
};

/**
 * Polls `node.getPendingTxCount()` until `opts.compare(actual, target)` holds (default `>=`).
 * Replaces the hand-rolled mempool-size poll in the slashing tests.
 * @returns The pending-tx count once the comparison holds.
 */
export function waitForPendingTxCount(
  node: AztecNode,
  target: number,
  opts: WaitForPendingTxCountOpts = {},
): Promise<number> {
  const compare = opts.compare ?? ((actual, target) => actual >= target);
  // Wrap the matched value: retryUntil treats any falsy return as "keep polling", so a legitimate
  // match of 0 pending txs would otherwise loop until timeout instead of resolving.
  return retryUntil(
    async () => {
      const count = await node.getPendingTxCount();
      return compare(count, target) ? { count } : undefined;
    },
    `pending tx count ${compare} ${target}`,
    opts.timeout ?? 30,
    opts.interval ?? 1,
  ).then(({ count }) => count);
}

/** Options for {@link waitForSequencerState}. */
export type WaitForSequencerStateOpts = {
  /** Milliseconds before the wait rejects; defaults to 30000. */
  timeout?: number;
  /**
   * Action to run after subscribing to the sequencer but before awaiting the transition. Subscribing
   * first guarantees the state change the action triggers is not missed between the action and the
   * listener attaching.
   */
  after?: () => unknown;
};

/**
 * Resolves once `sequencer` reaches `state`. Subscribes to the `state-changed` event first, then (if
 * `opts.after` is given) runs the action, then resolves immediately if the sequencer is already at
 * `state`, otherwise waits for the transition. The listener is cleaned up on both resolve and timeout.
 * Replaces the hand-rolled `state-changed` on/off subscriptions duplicated across the fee, cross-chain,
 * and keystore-reload tests.
 */
export async function waitForSequencerState(
  sequencer: Sequencer,
  state: SequencerState,
  opts: WaitForSequencerStateOpts = {},
): Promise<void> {
  const timeout = opts.timeout ?? 30000;
  const { promise, resolve, reject } = promiseWithResolvers<void>();

  let settled = false;
  const handler = (args: Parameters<SequencerEvents['state-changed']>[0]) => {
    if (args.newState === state) {
      finish(resolve);
    }
  };
  const timer = setTimeout(
    () => finish(() => reject(new Error(`Timeout waiting for sequencer ${state} state`))),
    timeout,
  );
  function finish(complete: () => void) {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    sequencer.off('state-changed', handler);
    complete();
  }

  sequencer.on('state-changed', handler);
  try {
    await opts.after?.();
    if (sequencer.status().state === state) {
      finish(resolve);
    }
    await promise;
  } catch (err) {
    finish(() => {});
    throw err;
  }
}
