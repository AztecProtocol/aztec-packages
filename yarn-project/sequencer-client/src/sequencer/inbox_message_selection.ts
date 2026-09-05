import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';
import type { InboxContract } from '@aztec/ethereum/contracts';
import { minBigint } from '@aztec/foundation/bigint';
import type { InboxMessagePosition, InboxMessageRange, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * The message caps that bound streaming Inbox consumption. Blocks and L1 buckets share the same cap, so a cursor left
 * at least one bucket's worth of messages below the checkpoint cap can always reach the end of the bucket it sits in.
 */
export type InboxConsumptionCaps = {
  /** Maximum number of messages one block may consume (`MAX_L1_TO_L2_MSGS_PER_BLOCK`). */
  perBlockCap: number;
  /** Maximum number of messages one checkpoint may consume (`MAX_L1_TO_L2_MSGS_PER_CHECKPOINT`). */
  perCheckpointCap: number;
  /** Maximum number of messages one L1 Inbox bucket holds, which is the protocol's per-block cap. */
  maxMessagesPerBucket: number;
};

/** The protocol caps, with the bucket size taken from the same generated constant L1 derives it from. */
export const PROTOCOL_INBOX_CONSUMPTION_CAPS: InboxConsumptionCaps = {
  perBlockCap: MAX_L1_TO_L2_MSGS_PER_BLOCK,
  perCheckpointCap: MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
  maxMessagesPerBucket: MAX_L1_TO_L2_MSGS_PER_BLOCK,
};

/** The Inbox contract read the completion step makes: the live bucket ending at or before a message total. */
export type InboxEndpointResolver = Pick<InboxContract, 'getBucketAtOrBeforeTotal'>;

/** The subset of the archiver's message queries streaming consumption needs. */
export type StreamingMessageSource = Pick<
  L1ToL2MessageSource,
  'getSyncedMessagePosition' | 'getMessagePosition' | 'getL1ToL2MessageRange'
>;

/** The cumulative message count a checkpoint may consume through at most. */
export function getCheckpointCapEnd(
  checkpointStartCount: bigint,
  caps: Pick<InboxConsumptionCaps, 'perCheckpointCap'>,
) {
  return checkpointStartCount + BigInt(caps.perCheckpointCap);
}

/**
 * The end of an ordinary block's greedy message selection: every message the local archiver has observed, up to the
 * per-block cap and the checkpoint cap. No L1 call and no bucket boundary is involved; a block may end at any prefix
 * of the message sequence. Never below the cursor, so a block consuming nothing keeps its position.
 */
export function selectOrdinaryMessageEnd(input: {
  cursorCount: bigint;
  localSyncedCount: bigint;
  checkpointStartCount: bigint;
  caps: Pick<InboxConsumptionCaps, 'perBlockCap' | 'perCheckpointCap'>;
}): bigint {
  const { cursorCount, localSyncedCount, checkpointStartCount, caps } = input;
  const end = minBigint(
    localSyncedCount,
    cursorCount + BigInt(caps.perBlockCap),
    getCheckpointCapEnd(checkpointStartCount, caps),
  );
  return end < cursorCount ? cursorCount : end;
}

/**
 * Whether a prospective greedy end would cross the last bucket-sized portion of the checkpoint's message capacity,
 * so the checkpoint must enter message completion before signing it.
 *
 * A checkpoint's final position has to be a live L1 bucket end, and buckets hold at most `maxMessagesPerBucket`
 * messages. A cursor at or below `capEnd - maxMessagesPerBucket` therefore always has the end of the bucket it sits
 * in within the cap; a cursor past that line may not, and a greedy step can pass the last legal endpoint for good.
 * With live bucket ends 444, 700, 800 and 1056 and a cap of 1024, greedy ends 256, 512 and 700 are fine, but the
 * next greedy step to 956 would leave 800 as the last reachable endpoint behind, so completion must select 800
 * first. The threshold is a fixed function of the protocol caps: with a cap of 1024 and buckets of 256 it is the
 * checkpoint start plus 768.
 */
export function shouldEnterMessageCompletion(input: {
  prospectiveGreedyEnd: bigint;
  checkpointStartCount: bigint;
  caps: Pick<InboxConsumptionCaps, 'perCheckpointCap' | 'maxMessagesPerBucket'>;
}): boolean {
  const { prospectiveGreedyEnd, checkpointStartCount, caps } = input;
  if (caps.perCheckpointCap < caps.maxMessagesPerBucket) {
    throw new Error(
      `Inbox checkpoint cap ${caps.perCheckpointCap} is below the bucket size ${caps.maxMessagesPerBucket}`,
    );
  }
  const safeGreedyEnd = getCheckpointCapEnd(checkpointStartCount, caps) - BigInt(caps.maxMessagesPerBucket);
  return prospectiveGreedyEnd > safeGreedyEnd;
}

/**
 * The highest message total a checkpoint entering completion may end at: what the local archiver has observed, what
 * the remaining scheduled blocks can carry, and the checkpoint cap. `remainingScheduledBlocks` counts the block about
 * to be built and only blocks the timetable and configuration still permit; the L1 censorship cap escape is not a
 * local scheduling limit, so a mandatory backlog that fits the cap but not the remaining schedule fails later at the
 * publication preflight.
 */
export function computeCompletionUpperBound(input: {
  cursorCount: bigint;
  localSyncedCount: bigint;
  checkpointStartCount: bigint;
  remainingScheduledBlocks: number;
  caps: Pick<InboxConsumptionCaps, 'perBlockCap' | 'perCheckpointCap'>;
}): bigint {
  const { cursorCount, localSyncedCount, checkpointStartCount, remainingScheduledBlocks, caps } = input;
  const remainingMessageCapacity = BigInt(Math.max(remainingScheduledBlocks, 0)) * BigInt(caps.perBlockCap);
  return minBigint(
    localSyncedCount,
    cursorCount + remainingMessageCapacity,
    getCheckpointCapEnd(checkpointStartCount, caps),
  );
}

/** Why a completion target could not be established from the cursor and the local view. */
export type CompletionTargetFailureReason =
  | 'no_live_endpoint'
  | 'endpoint_behind_cursor'
  | 'endpoint_unavailable_locally'
  | 'local_prefix_changed'
  | 'endpoint_hash_mismatch';

/** A completion target: the live L1 bucket end the checkpoint will consume through, authenticated locally. */
export type CompletionTarget = {
  /** The message position at the bucket end, as the local archiver holds it. */
  target: InboxMessagePosition;
  /** Sequence of the live bucket ending there, the unsigned hint `propose` takes. */
  bucketSeq: bigint;
  /** The messages from the cursor to the target, read from the same snapshot as the target's hash. */
  range: InboxMessageRange;
};

export type CompletionTargetResolution =
  | ({ ok: true } & CompletionTarget)
  | { ok: false; reason: CompletionTargetFailureReason; upperBound: bigint; endpointTotal?: bigint };

/**
 * Resolves the live L1 bucket end at or below `upperBound` and authenticates it against the local message log in
 * one snapshot: the range from the cursor to the endpoint must start at the cursor's hash and end at the bucket's.
 * This is the single Inbox call message completion makes. It establishes a reachable, content-matching endpoint
 * within the local and protocol count limits; whether that endpoint satisfies L1's settlement and censorship rules
 * is left to the integrated publication preflight and to `propose`, so no bucket metadata is fetched beyond it.
 */
export async function resolveCompletionTarget(input: {
  inbox: InboxEndpointResolver;
  messageSource: Pick<StreamingMessageSource, 'getL1ToL2MessageRange'>;
  cursor: InboxMessagePosition;
  upperBound: bigint;
}): Promise<CompletionTargetResolution> {
  const { inbox, messageSource, cursor, upperBound } = input;
  const found = await inbox.getBucketAtOrBeforeTotal(upperBound);
  if (found === undefined) {
    return { ok: false, reason: 'no_live_endpoint', upperBound };
  }
  const endpointTotal = found.bucket.totalMsgCount;
  if (endpointTotal < cursor.totalMessageCount) {
    return { ok: false, reason: 'endpoint_behind_cursor', upperBound, endpointTotal };
  }
  let range: InboxMessageRange;
  try {
    range = await messageSource.getL1ToL2MessageRange(cursor.totalMessageCount, endpointTotal);
  } catch {
    return { ok: false, reason: 'endpoint_unavailable_locally', upperBound, endpointTotal };
  }
  if (!range.start.rollingHash.equals(cursor.rollingHash)) {
    return { ok: false, reason: 'local_prefix_changed', upperBound, endpointTotal };
  }
  if (!range.end.rollingHash.equals(found.bucket.rollingHash)) {
    return { ok: false, reason: 'endpoint_hash_mismatch', upperBound, endpointTotal };
  }
  return { ok: true, target: range.end, bucketSeq: found.seq, range };
}
