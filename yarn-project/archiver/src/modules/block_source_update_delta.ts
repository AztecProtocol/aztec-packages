import type { L2Block } from '@aztec/stdlib/block';

/**
 * Blocks added during a single archiver sync pass, accumulated across the pass's sub-steps (inbound queue,
 * L1 sync) and used to populate the aggregate `l2BlockSourceUpdated` event.
 *
 * These are hydrated blocks that the pass already had in hand — no extra storage reads are performed to
 * populate them, so a triggered sync can reuse them instead of re-reading the store.
 */
export type L2BlockSourceUpdateDelta = {
  blocksAdded: L2Block[];
};

/** Returns an empty delta to accumulate a sync pass into. */
export function emptyL2BlockSourceUpdateDelta(): L2BlockSourceUpdateDelta {
  return { blocksAdded: [] };
}

/** Appends `source`'s blocks into `target` in place and returns `target`. */
export function mergeL2BlockSourceUpdateDelta(
  target: L2BlockSourceUpdateDelta,
  source: L2BlockSourceUpdateDelta,
): L2BlockSourceUpdateDelta {
  target.blocksAdded.push(...source.blocksAdded);
  return target;
}

/** Returns whether the delta carries any added blocks. */
export function hasL2BlockSourceUpdateDelta(delta: L2BlockSourceUpdateDelta): boolean {
  return delta.blocksAdded.length > 0;
}
