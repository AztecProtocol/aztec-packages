import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket, InboxBucketRef, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * Reason a streaming-Inbox block proposal fails the per-block acceptance checks. Follows the
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

/** Inputs to the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckInput = {
  /** Archiver Inbox-bucket queries (resolved against this node's own Inbox view). */
  messageSource: Pick<StreamingInboxBucketSource, 'getInboxBucket' | 'getInboxBucketByTotalMsgCount'>;
  /** The proposal's bucket reference: `bucketSeq` is the lookup hint, `inboxRollingHash` the expected commitment. */
  bucketRef: InboxBucketRef | undefined;
  /** Cumulative Inbox message count consumed through the parent block (its L1-to-L2 tree leaf count; 0 at genesis). */
  parentTotalMsgCount: bigint;
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin. */
  checkpointStartTotalMsgCount: bigint;
  /** Validation-time wall clock in seconds; the lag-eligibility anchor. */
  nowSeconds: bigint;
  /**
   * Minimum bucket age in seconds for a bucket to be lag-eligible: one configured Ethereum slot, the same value the
   * sequencer's selection uses.
   *
   * Age in seconds is a proxy for L1 reorg depth, and only an exact one when no L1 slot is missed: with missed slots a
   * bucket can be a full Ethereum slot old and still sit in the latest L1 block. A block-depth rule would be
   * stronger — require at least one later L1 block to have synced — and is implementable without new L1 state, since
   * the archiver records each bucket's `l1BlockNumber`.
   */
  minBucketAgeSeconds: number;
  /** Maximum number of messages this block may consume (`MAX_L1_TO_L2_MSGS_PER_BLOCK`). */
  perBlockCap: number;
  /** Maximum number of messages the checkpoint may consume in total (`MAX_L1_TO_L2_MSGS_PER_CHECKPOINT`). */
  perCheckpointCap: number;
};

/** Inputs to the full per-block streaming Inbox acceptance checks, metadata plus bundle derivation. */
export type StreamingBlockCheckInput = Omit<StreamingBlockMetadataCheckInput, 'messageSource'> & {
  messageSource: StreamingInboxBucketSource;
};

/** The buckets a passing block proposal consumes between; the input to bundle derivation. */
export type StreamingBlockBucketRange = {
  /** The bucket the block consumes through, resolved from this node's own Inbox view. */
  bucket: InboxBucket;
  /** The bucket the parent block consumed through. Equal to `bucket` when the block consumes nothing. */
  parentBucket: InboxBucket;
};

/** Result of the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckResult =
  | ({
      /** Every metadata check passed; the block's bundle can be derived from the returned bucket range. */
      accepted: true;
    } & StreamingBlockBucketRange)
  | {
      /** A check failed; `reason` mirrors the L1 acceptance condition that would have rejected the proposal. */
      accepted: false;
      reason: StreamingBlockCheckReason;
    };

/** Result of the per-block streaming Inbox acceptance checks. */
export type StreamingBlockCheckResult =
  | {
      /** All checks passed; `bundle` is the message-leaf bundle this block consumes, for re-execution. */
      accepted: true;
      bundle: Fr[];
    }
  | {
      /** A check failed; `reason` mirrors the L1 acceptance condition that would have rejected the proposal. */
      accepted: false;
      reason: StreamingBlockCheckReason;
    };

/**
 * Runs the metadata half of the per-block acceptance checks a validator applies to a streaming block proposal:
 * every check that is a bounded number of point lookups against the local Inbox view, with no message data read.
 * Mirrors the L1 acceptance conditions:
 *
 * 1. **Exists**: the referenced bucket resolves in this node's own Inbox view, and its consensus rolling hash matches
 *    the reference. An unknown bucket is an immediate reject here (there is no bounded wait yet); a hash
 *    mismatch means the wire reference disagrees with the local bucket. The reference is trusted only as a `bucketSeq`
 *    lookup hint — timestamp and message counts are read from the locally resolved bucket, never from the wire.
 * 2. **Moves forward**: the bucket's cumulative total is at least the parent block's, so consumption never rewinds.
 *    Equal totals mean the block consumes nothing (empty bundle).
 * 3. **Not too new**: the bucket is at least `minBucketAgeSeconds` old at validation time
 *    (`timestamp <= now - minBucketAgeSeconds`, inclusive — a bucket exactly that old is eligible, matching L1's
 *    strict `>` "too new" test).
 * 4. **Caps**: the per-block message count and the running per-checkpoint total fit their respective caps.
 * 5. **Parent boundary**: the parent block's cumulative total sits on a bucket boundary, so the consumed range is
 *    well defined.
 *
 * Because this phase is cheap and needs nothing off the network, a caller can run it before committing to any
 * expensive work on a proposal — notably before collecting the proposal's transactions over P2P.
 *
 * The reject branch is a single function so a future bounded wait can wrap `bucket_unknown`.
 */
export async function checkStreamingBlockProposalMetadata(
  input: StreamingBlockMetadataCheckInput,
): Promise<StreamingBlockMetadataCheckResult> {
  const {
    messageSource,
    bucketRef,
    parentTotalMsgCount,
    checkpointStartTotalMsgCount,
    nowSeconds,
    minBucketAgeSeconds,
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

  // Check 3: the bucket is at least `minBucketAgeSeconds` old at validation time.
  if (bucket.timestamp > nowSeconds - BigInt(minBucketAgeSeconds)) {
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

  // Check 5: the parent bucket is the one whose cumulative total equals the parent block's leaf count (messages are
  // indexed compactly, with no padding); a parent whose count does not sit on a bucket boundary is unresolvable.
  const parentBucket = await messageSource.getInboxBucketByTotalMsgCount(parentTotalMsgCount);
  if (parentBucket === undefined) {
    return { accepted: false, reason: 'parent_bucket_unresolved' };
  }

  return { accepted: true, bucket, parentBucket };
}

/**
 * Derives the message-leaf bundle a streaming block proposal consumes (for re-execution): the leaves between the
 * parent bucket and the proposed one, bounded by the per-block cap that
 * {@link checkStreamingBlockProposalMetadata} already enforced.
 */
export function getStreamingBlockBundle(
  messageSource: Pick<StreamingInboxBucketSource, 'getL1ToL2MessagesBetweenBuckets'>,
  range: StreamingBlockBucketRange,
): Promise<Fr[]> {
  const { bucket, parentBucket } = range;
  return parentBucket.seq === bucket.seq
    ? Promise.resolve([])
    : messageSource.getL1ToL2MessagesBetweenBuckets(parentBucket.seq, bucket.seq);
}

/**
 * Runs the per-block acceptance checks a validator applies to a streaming block proposal, and derives the
 * message-leaf bundle the block consumes. Composes {@link checkStreamingBlockProposalMetadata} with
 * {@link getStreamingBlockBundle} for callers that have no use for running the two phases separately.
 */
export async function checkStreamingBlockProposal(input: StreamingBlockCheckInput): Promise<StreamingBlockCheckResult> {
  const metadata = await checkStreamingBlockProposalMetadata(input);
  if (!metadata.accepted) {
    return metadata;
  }
  return { accepted: true, bundle: await getStreamingBlockBundle(input.messageSource, metadata) };
}
