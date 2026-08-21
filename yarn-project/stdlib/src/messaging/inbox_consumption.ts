import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';
import { SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getTimestampForSlot } from '../epoch-helpers/index.js';
import type { InboxBucket } from './inbox_bucket.js';

/**
 * Censorship cutoff timestamp for a checkpoint proposed in `slot`, mirroring the cutoff in
 * `ProposeLib.validateInboxConsumption`, which is `TimeLib.getBuildFrameStart(slot)`. A checkpoint proposed in slot
 * `S` is built during slot `S - 1`, and the build frame opens one Ethereum slot before that slot starts, since the
 * builder works from the L1 state as of the preceding L1 block: `cutoff(S) = toTimestamp(S - 1) - E`. Buckets opened
 * at or before the cutoff were visible to every node for the whole build frame and are mandatory to consume by the
 * checkpoint's last block; the strict `>` on the L1 "past cutoff" test (see {@link isInboxConsumptionSufficient})
 * makes a bucket opened exactly at the cutoff mandatory.
 *
 * This is the single source of truth for the cutoff formula shared by the sequencer's streaming bucket selection and
 * the validator's last-block censorship check.
 */
export function getInboxCutoffTimestamp(
  slot: SlotNumber,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>,
): bigint {
  return getTimestampForSlot(SlotNumber(slot - 1), l1Constants) - BigInt(l1Constants.ethereumSlotDuration);
}

/**
 * Smallest number of blocks a checkpoint must be able to build for the streaming Inbox to be guaranteed to clear any
 * mandatory backlog, and therefore the floor on a network's `maxBlocksPerCheckpoint`.
 *
 * Blocks consume whole buckets — a bucket is never split — so a block can only consume a bucket prefix whose message
 * count fits `MAX_L1_TO_L2_MSGS_PER_BLOCK`. The worst case alternates a one-message bucket with a full
 * `MAX_L1_TO_L2_MSGS_PER_BLOCK`-message bucket: each such pair needs two blocks (the pair's `cap + 1` messages
 * overflow one block), and the backlog only stops being mandatory once consuming the next bucket would exceed
 * `MAX_L1_TO_L2_MSGS_PER_CHECKPOINT` (the cap-escape). That bounds the backlog at `cap + 1` messages per block-pair
 * and yields `2 * ceil((MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1) / (MAX_L1_TO_L2_MSGS_PER_BLOCK + 1)) - 1` blocks (the
 * final pair needs only its first block).
 *
 * A network configured below this floor can be halted permanently: an adversary posts that bucket pattern, no
 * checkpoint can reach the censorship floor within its block budget, every checkpoint is rejected, and because a
 * rejected checkpoint never advances the consumed position the next checkpoint faces the identical backlog.
 */
export const MIN_BLOCKS_FOR_INBOX_CATCHUP =
  2 * Math.ceil((MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1) / (MAX_L1_TO_L2_MSGS_PER_BLOCK + 1)) - 1;

/**
 * Whether a checkpoint whose last-consumed bucket is immediately followed by `nextBucket` meets the censorship floor,
 * mirroring the mandatory-consumption assert in `ProposeLib.validateInboxConsumption`.
 * Consumption is sufficient when the first unconsumed bucket:
 *  - does not exist (the checkpoint consumed everything the Inbox has), or
 *  - was opened strictly after the cutoff (`timestamp > cutoffTimestamp`), or
 *  - consuming through it would exceed the per-checkpoint cap (the cap-escape).
 *
 * The strict `>` matches L1: a bucket opened exactly at the cutoff must be consumed. This is the single source of
 * truth for the minimum-consumption / cap-escape rule shared by the sequencer's selection floor and the validator.
 */
export function isInboxConsumptionSufficient(input: {
  /** The first unconsumed bucket (the one after the checkpoint's last-consumed bucket), or undefined if none exists. */
  nextBucket: Pick<InboxBucket, 'timestamp' | 'totalMsgCount'> | undefined;
  /** Censorship cutoff timestamp from {@link getInboxCutoffTimestamp}. */
  cutoffTimestamp: bigint;
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin. */
  checkpointStartTotalMsgCount: bigint;
  /** Maximum number of messages the checkpoint may consume in total (`MAX_L1_TO_L2_MSGS_PER_CHECKPOINT`). */
  perCheckpointCap: number;
}): boolean {
  const { nextBucket, cutoffTimestamp, checkpointStartTotalMsgCount, perCheckpointCap } = input;
  if (nextBucket === undefined) {
    return true;
  }
  if (nextBucket.timestamp > cutoffTimestamp) {
    return true;
  }
  return nextBucket.totalMsgCount - checkpointStartTotalMsgCount > BigInt(perCheckpointCap);
}
