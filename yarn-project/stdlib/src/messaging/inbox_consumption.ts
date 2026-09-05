import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';

/**
 * Smallest number of blocks a checkpoint must be able to build for the streaming Inbox to be guaranteed to clear any
 * mandatory backlog, and therefore the floor on a network's `maxBlocksPerCheckpoint`.
 *
 * Blocks consume message prefixes rather than whole buckets, so each block can carry up to
 * `MAX_L1_TO_L2_MSGS_PER_BLOCK` messages whatever L1's bucket partition looks like. A checkpoint's mandatory backlog
 * is bounded by its own cap: once consuming the next bucket would exceed `MAX_L1_TO_L2_MSGS_PER_CHECKPOINT` the
 * remaining backlog stops being mandatory. Clearing a cap-sized backlog therefore takes
 * `ceil(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT / MAX_L1_TO_L2_MSGS_PER_BLOCK)` blocks.
 *
 * A network configured below this floor can be halted permanently: an adversary posts a cap-sized backlog, no
 * checkpoint can reach the censorship floor within its block budget, every checkpoint is rejected, and because a
 * rejected checkpoint never advances the consumed position the next checkpoint faces the identical backlog.
 */
export const MIN_BLOCKS_FOR_INBOX_CATCHUP = Math.ceil(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT / MAX_L1_TO_L2_MSGS_PER_BLOCK);
