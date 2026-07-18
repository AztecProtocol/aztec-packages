import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucketRef, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * Reason a streaming-Inbox block proposal fails the per-block acceptance checks (AZIP-22 Fast Inbox). Follows the
 * handler's existing `{ isValid, reason }` string style.
 */
export type StreamingBlockCheckReason =
  | 'bucket_unknown'
  | 'bucket_hash_mismatch'
  | 'parent_bucket_unresolved'
  | 'bucket_moves_backwards'
  | 'bucket_too_new'
  | 'bundle_over_block_cap'
  | 'checkpoint_over_msg_cap';

/** The subset of the archiver's Inbox-bucket queries the per-block streaming checks need. */
export type StreamingInboxBucketSource = Pick<
  L1ToL2MessageSource,
  'getInboxBucket' | 'getInboxBucketByTotalMsgCount' | 'getL1ToL2MessagesBetweenBuckets'
>;

/** Inputs to the per-block streaming Inbox acceptance checks. */
export type StreamingBlockCheckInput = {
  /** Archiver Inbox-bucket queries (resolved against this node's own Inbox view). */
  messageSource: StreamingInboxBucketSource;
  /** The proposal's bucket reference: `bucketSeq` is the lookup hint, `inboxRollingHash` the expected commitment. */
  bucketRef: InboxBucketRef | undefined;
  /** Cumulative Inbox message count consumed through the parent block (its L1-to-L2 tree leaf count; 0 at genesis). */
  parentTotalMsgCount: bigint;
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin. */
  checkpointStartTotalMsgCount: bigint;
  /** Validation-time wall clock in seconds; the lag-eligibility anchor. */
  nowSeconds: bigint;
  /** Minimum bucket age in seconds (`INBOX_LAG_SECONDS`) for a bucket to be lag-eligible. */
  lagSeconds: number;
  /** Maximum number of messages this block may consume (`MAX_L1_TO_L2_MSGS_PER_BLOCK`). */
  perBlockCap: number;
  /** Maximum number of messages the checkpoint may consume in total (`MAX_L1_TO_L2_MSGS_PER_CHECKPOINT`). */
  perCheckpointCap: number;
};

/** Result of the per-block streaming Inbox acceptance checks. */
export type StreamingBlockCheckResult =
  | {
      /** All four checks passed; `bundle` is the message-leaf bundle this block consumes, for re-execution. */
      accepted: true;
      bundle: Fr[];
    }
  | {
      /** A check failed; `reason` mirrors the L1 acceptance condition that would have rejected the proposal. */
      accepted: false;
      reason: StreamingBlockCheckReason;
    };

/**
 * Runs the AZIP-22 Fast Inbox per-block acceptance checks a validator applies to a streaming block proposal, and
 * derives the message-leaf bundle the block consumes (for re-execution). Mirrors the L1 acceptance conditions:
 *
 * 1. **Exists**: the referenced bucket resolves in this node's own Inbox view, and its consensus rolling hash matches
 *    the reference. An unknown bucket is an immediate reject here (the bounded-wait soft path is A-1393); a hash
 *    mismatch means the wire reference disagrees with the local bucket. The reference is trusted only as a `bucketSeq`
 *    lookup hint — timestamp and message counts are read from the locally resolved bucket, never from the wire.
 * 2. **Moves forward**: the bucket's cumulative total is at least the parent block's, so consumption never rewinds.
 *    Equal totals mean the block consumes nothing (empty bundle).
 * 3. **Not too new**: the bucket is at least `lagSeconds` old at validation time (`timestamp <= now - lagSeconds`,
 *    inclusive — a bucket exactly `lagSeconds` old is eligible, matching L1's strict `>` "too new" test).
 * 4. **Caps**: the per-block message count and the running per-checkpoint total fit their respective caps.
 *
 * The reject branch is a single function so A-1393 can wrap `bucket_unknown` with its bounded wait.
 */
export async function checkStreamingBlockProposal(input: StreamingBlockCheckInput): Promise<StreamingBlockCheckResult> {
  const {
    messageSource,
    bucketRef,
    parentTotalMsgCount,
    checkpointStartTotalMsgCount,
    nowSeconds,
    lagSeconds,
    perBlockCap,
    perCheckpointCap,
  } = input;

  // A streaming proposal must carry a bucket reference to derive its bundle from.
  if (bucketRef === undefined) {
    return { accepted: false, reason: 'bucket_unknown' };
  }

  // Check 1: exists in our own Inbox view, and the resolved rolling hash matches the reference.
  const bucket = await messageSource.getInboxBucket(bucketRef.bucketSeq);
  if (bucket === undefined) {
    return { accepted: false, reason: 'bucket_unknown' };
  }
  if (!bucket.inboxRollingHash.equals(bucketRef.inboxRollingHash)) {
    return { accepted: false, reason: 'bucket_hash_mismatch' };
  }

  // Check 2: consumption moves forward relative to the parent block.
  if (bucket.totalMsgCount < parentTotalMsgCount) {
    return { accepted: false, reason: 'bucket_moves_backwards' };
  }

  // Check 3: the bucket is at least `lagSeconds` old at validation time.
  if (bucket.timestamp > nowSeconds - BigInt(lagSeconds)) {
    return { accepted: false, reason: 'bucket_too_new' };
  }

  // Check 4a: the per-block message count fits the per-block cap.
  const blockCount = bucket.totalMsgCount - parentTotalMsgCount;
  if (blockCount > BigInt(perBlockCap)) {
    return { accepted: false, reason: 'bundle_over_block_cap' };
  }

  // Check 4b: the running per-checkpoint total fits the per-checkpoint cap.
  const checkpointCount = bucket.totalMsgCount - checkpointStartTotalMsgCount;
  if (checkpointCount > BigInt(perCheckpointCap)) {
    return { accepted: false, reason: 'checkpoint_over_msg_cap' };
  }

  // Derive the message bundle for re-execution: the leaves consumed between the parent bucket and the proposed one.
  // The parent bucket is the one whose cumulative total equals the parent block's leaf count (post-flip compact
  // indexing); a parent that does not sit on a bucket boundary (a pre-flip padded parent) is unresolvable.
  const parentBucket = await messageSource.getInboxBucketByTotalMsgCount(parentTotalMsgCount);
  if (parentBucket === undefined) {
    return { accepted: false, reason: 'parent_bucket_unresolved' };
  }
  const bundle =
    parentBucket.seq === bucket.seq
      ? []
      : await messageSource.getL1ToL2MessagesBetweenBuckets(parentBucket.seq, bucket.seq);
  return { accepted: true, bundle };
}
