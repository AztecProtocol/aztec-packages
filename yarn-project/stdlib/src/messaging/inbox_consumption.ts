import { SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getTimestampForSlot } from '../epoch-helpers/index.js';
import type { InboxBucket } from './inbox_bucket.js';

/**
 * Censorship cutoff timestamp for a checkpoint proposed in `slot` (AZIP-22 Fast Inbox), mirroring the cutoff in
 * `ProposeLib.validateInboxConsumption`. A checkpoint proposed in slot `S` is built during slot `S - 1`, so
 * `buildFrameStart(S) = toTimestamp(S - 1)` and `cutoff(S) = buildFrameStart(S) - lagSeconds`. Buckets opened at or
 * before the cutoff are mandatory to consume by the checkpoint's last block; the strict `>` on the L1 "past cutoff"
 * test (see {@link isInboxConsumptionSufficient}) makes a bucket opened exactly at the cutoff mandatory.
 *
 * This is the single source of truth for the cutoff formula shared by the sequencer's streaming bucket selection and
 * the validator's last-block censorship check.
 */
export function getInboxCutoffTimestamp(
  slot: SlotNumber,
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
  lagSeconds: number,
): bigint {
  return getTimestampForSlot(SlotNumber(slot - 1), l1Constants) - BigInt(lagSeconds);
}

/**
 * Whether a checkpoint whose last-consumed bucket is immediately followed by `nextBucket` meets the censorship floor,
 * mirroring the mandatory-consumption assert in `ProposeLib.validateInboxConsumption` (AZIP-22 Fast Inbox).
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
