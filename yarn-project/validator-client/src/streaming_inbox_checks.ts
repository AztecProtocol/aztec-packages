import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket, InboxBucketRef, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * Reason a streaming-Inbox block proposal fails the per-block acceptance checks. Follows the
 * handler's existing `{ isValid, reason }` string style.
 */
export type StreamingBlockCheckReason =
  | 'bucket_unknown'
  | 'parent_bucket_unresolved'
  | 'bucket_moves_backwards'
  | 'bundle_over_block_cap'
  | 'checkpoint_over_msg_cap';

/** The subset of the archiver's Inbox-bucket queries the per-block streaming checks need. */
export type StreamingInboxBucketSource = Pick<
  L1ToL2MessageSource,
  'getInboxBucketByRollingHash' | 'getInboxBucketByTotalMsgCount' | 'getL1ToL2MessagesBetweenBuckets'
>;

/** Inputs to the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckInput = {
  /** Archiver Inbox-bucket queries (resolved against this node's own Inbox view). */
  messageSource: Pick<StreamingInboxBucketSource, 'getInboxBucketByRollingHash' | 'getInboxBucketByTotalMsgCount'>;
  /** The proposal's bucket reference: the rolling hash of the bucket the block consumed through. */
  bucketRef: InboxBucketRef | undefined;
  /** Cumulative Inbox message count consumed through the parent block (its L1-to-L2 tree leaf count; 0 at genesis). */
  parentTotalMsgCount: bigint;
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin. */
  checkpointStartTotalMsgCount: bigint;
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
 * 1. **Exists**: a bucket carrying the referenced rolling hash resolves in this node's own Inbox view. The hash
 *    commits to every message up to the bucket, so it is the bucket's identity: a bucket an L1 reorg re-timed or
 *    renumbered still resolves, and one whose messages changed does not. An unknown bucket is an immediate reject
 *    here; the caller decides whether it is worth waiting for a local sync and re-running the checks (the validator's
 *    proposal handler does, bounded by the attestation deadline), since "not synced yet" and "reorged away" look the
 *    same from here. Sequence number, timestamp and message counts are read from the locally resolved bucket, never
 *    from the wire.
 * 2. **Moves forward**: the bucket's cumulative total is at least the parent block's, so consumption never rewinds.
 *    Equal totals mean the block consumes nothing (empty bundle).
 * 3. **Caps**: the per-block message count and the running per-checkpoint total fit their respective caps.
 * 4. **Parent boundary**: the parent block's cumulative total sits on a bucket boundary, so the consumed range is
 *    well defined.
 *
 * There is deliberately no check on how recently the bucket was opened. *When* a bucket becomes consumable is the
 * proposer's own policy — it waits for the bucket's opening L1 block to gain a canonical descendant so it does not
 * build on a block its archiver will disown — and L1 has no matching rule: `propose` accepts any bucket the
 * censorship cutoff and the caps allow, whenever it is proposed. A validator that rejected a young bucket would
 * therefore refuse to attest to a checkpoint L1 accepts, so validators check only what L1 checks plus consistency
 * with their own Inbox view.
 *
 * Because this phase is cheap and needs nothing off the network, a caller can run it before committing to any
 * expensive work on a proposal — notably before collecting the proposal's transactions over P2P.
 *
 * The reject branch is a single function so a caller can re-run the whole check after forcing a local sync, which
 * is how the validator's proposal handler turns a `bucket_unknown` into a bounded wait.
 */
export async function checkStreamingBlockProposalMetadata(
  input: StreamingBlockMetadataCheckInput,
): Promise<StreamingBlockMetadataCheckResult> {
  const { messageSource, bucketRef, parentTotalMsgCount, checkpointStartTotalMsgCount, perBlockCap, perCheckpointCap } =
    input;

  // A streaming proposal must carry a bucket reference to derive its bundle from.
  if (bucketRef === undefined) {
    return { accepted: false, reason: 'bucket_unknown' };
  }

  // Check 1: a bucket carrying the referenced rolling hash exists in our own Inbox view.
  const bucket = await messageSource.getInboxBucketByRollingHash(bucketRef.inboxRollingHash);
  if (bucket === undefined) {
    return { accepted: false, reason: 'bucket_unknown' };
  }

  // Check 2: consumption moves forward relative to the parent block.
  if (bucket.totalMsgCount < parentTotalMsgCount) {
    return { accepted: false, reason: 'bucket_moves_backwards' };
  }

  // Check 3a: the per-block message count fits the per-block cap.
  const blockCount = bucket.totalMsgCount - parentTotalMsgCount;
  if (blockCount > BigInt(perBlockCap)) {
    return { accepted: false, reason: 'bundle_over_block_cap' };
  }

  // Check 3b: the running per-checkpoint total fits the per-checkpoint cap.
  const checkpointCount = bucket.totalMsgCount - checkpointStartTotalMsgCount;
  if (checkpointCount > BigInt(perCheckpointCap)) {
    return { accepted: false, reason: 'checkpoint_over_msg_cap' };
  }

  // Check 4: the parent bucket is the one whose cumulative total equals the parent block's leaf count (messages are
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
