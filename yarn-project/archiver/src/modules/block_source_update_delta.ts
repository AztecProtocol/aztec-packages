import type { L2Block } from '@aztec/stdlib/block';

/**
 * Blocks added and pruned during a single archiver sync pass, accumulated across the pass's sub-steps
 * (inbound queue, L1 sync, prune helpers) and used to populate the aggregate `l2BlockSourceUpdated` event.
 *
 * Both fields hold hydrated blocks that the pass already had in hand — no extra storage reads are performed
 * to populate them, so `blocksPruned` in particular is best-effort and only filled from paths that already
 * receive the pruned blocks from updater calls.
 */
export type L2BlockSourceUpdateDelta = {
  blocksAdded: L2Block[];
  blocksPruned: L2Block[];
};

/** Returns an empty delta to accumulate a sync pass into. */
export function emptyL2BlockSourceUpdateDelta(): L2BlockSourceUpdateDelta {
  return { blocksAdded: [], blocksPruned: [] };
}

/** Appends `source`'s blocks into `target` in place and returns `target`. */
export function mergeL2BlockSourceUpdateDelta(
  target: L2BlockSourceUpdateDelta,
  source: L2BlockSourceUpdateDelta,
): L2BlockSourceUpdateDelta {
  target.blocksAdded.push(...source.blocksAdded);
  target.blocksPruned.push(...source.blocksPruned);
  return target;
}

/** Returns whether the delta carries any added or pruned blocks. */
export function hasL2BlockSourceUpdateDelta(delta: L2BlockSourceUpdateDelta): boolean {
  return delta.blocksAdded.length > 0 || delta.blocksPruned.length > 0;
}
