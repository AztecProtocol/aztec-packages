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

/** The Inbox contract read an endpoint block makes: the live bucket ending at or before a message total. */
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
 * The threshold that separates local-only selection from one that must consult L1: the checkpoint cap less one
 * bucket's worth of messages.
 *
 * A checkpoint's final position has to be a live L1 bucket end, and buckets hold at most `maxMessagesPerBucket`
 * messages. While a block's end stays at or below this line the bucket the cursor lands in still ends within the cap
 * and within one block's capacity, so no endpoint has been passed for good. A step above it may pass the last legal
 * endpoint: with live bucket ends 444, 700, 800 and 1056 and a cap of 1024, ends 256, 512 and 700 are fine, but a
 * step to 956 could leave 800 behind. With a cap of 1024 and buckets of 256 the threshold is the checkpoint start
 * plus 768.
 */
export function getOrdinaryCeiling(
  checkpointStartCount: bigint,
  caps: Pick<InboxConsumptionCaps, 'perCheckpointCap' | 'maxMessagesPerBucket'>,
): bigint {
  if (caps.perCheckpointCap < caps.maxMessagesPerBucket) {
    throw new Error(
      `Inbox checkpoint cap ${caps.perCheckpointCap} is below the bucket size ${caps.maxMessagesPerBucket}`,
    );
  }
  return getCheckpointCapEnd(checkpointStartCount, caps) - BigInt(caps.maxMessagesPerBucket);
}

/**
 * The end of a block's greedy message selection: every message the local archiver has observed, up to the per-block
 * and checkpoint caps. No L1 call and no bucket boundary is involved; a block may end at any prefix of the message
 * sequence. Never below the cursor, so a block consuming nothing keeps its position. This is the *prospective* end:
 * whether the block may take it without consulting L1 is {@link mustQueryEndpoint}.
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
 * The furthest a block may advance on the local log alone without risking the checkpoint's last legal endpoint: the
 * greedy end held down to the threshold. A block whose endpoint lookup fails or resolves short of this still takes
 * it, since ending at or below the threshold always leaves one bucket of checkpoint capacity in reserve.
 */
export function selectSafeLocalEnd(input: {
  cursorCount: bigint;
  localSyncedCount: bigint;
  checkpointStartCount: bigint;
  caps: Pick<InboxConsumptionCaps, 'perBlockCap' | 'perCheckpointCap' | 'maxMessagesPerBucket'>;
}): bigint {
  const { cursorCount, localSyncedCount, checkpointStartCount, caps } = input;
  const end = minBigint(
    localSyncedCount,
    cursorCount + BigInt(caps.perBlockCap),
    getOrdinaryCeiling(checkpointStartCount, caps),
  );
  return end < cursorCount ? cursorCount : end;
}

/**
 * Whether this block has to resolve a live L1 bucket end before selecting its range: either it is the checkpoint's
 * final block, whose position must be such an end, or its prospective greedy end would pass the threshold. The test
 * is on the prospective end after the per-block cap, not on the cursor: from a cursor of 700 a step to 956 already
 * needs the lookup, while a large backlog from a low cursor does not.
 */
export function mustQueryEndpoint(input: {
  prospectiveEnd: bigint;
  checkpointStartCount: bigint;
  isFinalBlock: boolean;
  caps: Pick<InboxConsumptionCaps, 'perCheckpointCap' | 'maxMessagesPerBucket'>;
}): boolean {
  const { prospectiveEnd, checkpointStartCount, isFinalBlock, caps } = input;
  return isFinalBlock || prospectiveEnd > getOrdinaryCeiling(checkpointStartCount, caps);
}

/**
 * The highest message total an endpoint lookup may return: what the local archiver has observed and the checkpoint
 * cap. A non-final block takes the checkpoint-wide bound even though it can only consume one block's worth toward
 * the result, so that a mandatory bucket beyond its own reach is not stranded by a nearer endpoint; the final block,
 * which has to land on the endpoint, is additionally bounded by what it alone can carry.
 */
export function getEndpointUpperBound(input: {
  cursorCount: bigint;
  localSyncedCount: bigint;
  checkpointStartCount: bigint;
  isFinalBlock: boolean;
  caps: Pick<InboxConsumptionCaps, 'perBlockCap' | 'perCheckpointCap'>;
}): bigint {
  const { cursorCount, localSyncedCount, checkpointStartCount, isFinalBlock, caps } = input;
  const bound = minBigint(localSyncedCount, getCheckpointCapEnd(checkpointStartCount, caps));
  return isFinalBlock ? minBigint(bound, cursorCount + BigInt(caps.perBlockCap)) : bound;
}

/** Why a checkpoint endpoint could not be established from the cursor and the local view. */
export type EndpointFailureReason =
  | 'no_live_endpoint'
  | 'endpoint_behind_cursor'
  | 'endpoint_unavailable_locally'
  | 'local_prefix_changed'
  | 'endpoint_hash_mismatch';

/** A checkpoint endpoint: the live L1 bucket end a block consumes through, authenticated locally. */
export type ResolvedEndpoint = {
  /** The message position at the bucket end, as the local archiver holds it. */
  endpoint: InboxMessagePosition;
  /** Sequence of the live bucket ending there, the unsigned hint `propose` takes. */
  bucketSeq: bigint;
  /** The messages from the cursor to the endpoint, read from the same snapshot as the endpoint's hash. */
  range: InboxMessageRange;
};

export type EndpointResolution =
  | ({ ok: true } & ResolvedEndpoint)
  | { ok: false; reason: EndpointFailureReason; upperBound: bigint; endpointTotal?: bigint };

/**
 * Resolves the live L1 bucket end at or below `upperBound` and authenticates it against the local message log in
 * one snapshot: the range from the cursor to the endpoint must start at the cursor's hash and end at the bucket's.
 * This is the single Inbox call an endpoint block makes. It establishes a reachable, content-matching endpoint
 * within the local and protocol count limits; whether that endpoint satisfies L1's settlement and censorship rules
 * is left to the integrated publication preflight and to `propose`, so no bucket metadata is fetched beyond it.
 */
export async function resolveEndpoint(input: {
  inbox: InboxEndpointResolver;
  messageSource: Pick<StreamingMessageSource, 'getL1ToL2MessageRange'>;
  cursor: InboxMessagePosition;
  upperBound: bigint;
}): Promise<EndpointResolution> {
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
  return { ok: true, endpoint: range.end, bucketSeq: found.seq, range };
}
