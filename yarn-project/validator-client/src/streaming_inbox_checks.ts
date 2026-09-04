import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucketRef, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * Reason a streaming-Inbox block proposal fails the per-block acceptance checks. Follows the
 * handler's existing `{ isValid, reason }` string style.
 *
 * `prefix_unavailable` and `prefix_mismatch` are both local-view outcomes rather than proposer misbehavior, and the
 * handler retries both once after forcing a local sync: this node can be the one holding the stale prefix.
 */
export type StreamingBlockCheckReason =
  | 'prefix_unavailable'
  | 'prefix_mismatch'
  | 'consumption_moves_backwards'
  | 'bundle_over_block_cap'
  | 'checkpoint_over_msg_cap';

/** Failure reasons that mean "this node cannot resolve the proposal's prefix", which a local sync may fix. */
export const RETRYABLE_STREAMING_BLOCK_CHECK_REASONS: StreamingBlockCheckReason[] = [
  'prefix_unavailable',
  'prefix_mismatch',
];

/** The subset of the archiver's Inbox queries the per-block streaming checks need. */
export type StreamingInboxMessageSource = Pick<
  L1ToL2MessageSource,
  'getInboxRollingHashAt' | 'getL1ToL2MessagesBetweenLeafCounts'
>;

/** Inputs to the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckInput = {
  /** Archiver Inbox prefix lookup (resolved against this node's own Inbox view). */
  messageSource: Pick<StreamingInboxMessageSource, 'getInboxRollingHashAt'>;
  /**
   * The proposal's signed Inbox prefix reference: the rolling hash of the message prefix the block consumed through.
   * Interpreted together with {@link endTotalMsgCount}; it need not name a current bucket boundary.
   */
  bucketRef: InboxBucketRef | undefined;
  /** Cumulative Inbox message count consumed through this block, from its signed header's L1-to-L2 leaf count. */
  endTotalMsgCount: bigint;
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
  messageSource: StreamingInboxMessageSource;
};

/** The message-count range a passing block proposal consumes; the input to bundle derivation. */
export type StreamingBlockCountRange = {
  /** Cumulative Inbox message count the block's bundle starts at, inclusive. */
  parentTotalMsgCount: bigint;
  /** Cumulative Inbox message count the block's bundle ends at, exclusive. Equal to the start for an empty bundle. */
  endTotalMsgCount: bigint;
  /**
   * The signed prefix reference the end count was confirmed against, carried through so the bundle read can
   * re-confirm it without the caller having to prove again that the proposal had one.
   */
  bucketRef: InboxBucketRef;
};

/** Result of the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckResult =
  | ({
      /** Every metadata check passed; the block's bundle can be derived from the returned count range. */
      accepted: true;
    } & StreamingBlockCountRange)
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
 *
 * A block's consumed position is a pair of signed values: the end count from its header's L1-to-L2 leaf count, and
 * the prefix rolling hash from the proposal's reference. Because each message's rolling hash chains the one before
 * it, a matching hash at the end count proves the proposer consumed exactly the message prefix this node holds, so
 * the bundle between the parent's count and this one is determined by content alone. The checks, in order:
 *
 * 1. **Reference present**: a streaming proposal must carry a prefix reference to authenticate against.
 * 2. **Moves forward**: the end count is at least the parent block's, so consumption never rewinds. Equal counts
 *    mean the block consumes nothing (empty bundle), which still has its prefix hash checked.
 * 3. **Caps**: the per-block message count and the running per-checkpoint total fit their respective caps.
 * 4. **Prefix matches**: the canonical prefix hash at the end count exists locally and equals the signed reference.
 *
 * Deliberately absent is any requirement that the end count sit on a boundary of the bucket partition this node
 * currently holds. An L1 reorg that re-mines the same messages under different bucket boundaries leaves every leaf
 * and every prefix hash intact while moving the boundaries, so a block that ended on a boundary the reorg merged
 * away is still exactly as valid as when it was signed. Only a completed checkpoint's final position must resolve to
 * a current bucket, because that is what the L1 `bucketHint` and the censorship/cap asserts are taken against.
 *
 * There is likewise no check on how recently a bucket was opened. *When* messages become consumable is the
 * proposer's own policy — it waits for the opening L1 block to gain a canonical descendant so it does not build on a
 * block its archiver will disown — and L1 has no matching rule: `propose` accepts any position the censorship cutoff
 * and the caps allow, whenever it is proposed. A validator that rejected a young bucket would therefore refuse to
 * attest to a checkpoint L1 accepts, so validators check only what L1 checks plus consistency with their own view.
 *
 * Because this phase is cheap and needs nothing off the network, a caller can run it before committing to any
 * expensive work on a proposal — notably before collecting the proposal's transactions over P2P.
 *
 * The reject branch is a single function so a caller can re-run the whole check after forcing a local sync, which is
 * how the validator's proposal handler turns either of the two prefix outcomes into a bounded wait. Both are
 * retried: a node whose archiver has not yet followed a reorg holds a *present* prefix hash at the end count that
 * simply is not the canonical one any more, which is indistinguishable from a proposer naming a prefix that never
 * existed.
 */
export async function checkStreamingBlockProposalMetadata(
  input: StreamingBlockMetadataCheckInput,
): Promise<StreamingBlockMetadataCheckResult> {
  const {
    messageSource,
    bucketRef,
    endTotalMsgCount,
    parentTotalMsgCount,
    checkpointStartTotalMsgCount,
    perBlockCap,
    perCheckpointCap,
  } = input;

  // Check 1: a streaming proposal must carry a prefix reference to authenticate its consumed range against.
  if (bucketRef === undefined) {
    return { accepted: false, reason: 'prefix_unavailable' };
  }

  // Check 2: consumption moves forward relative to the parent block.
  if (endTotalMsgCount < parentTotalMsgCount) {
    return { accepted: false, reason: 'consumption_moves_backwards' };
  }

  // Check 3a: the per-block message count fits the per-block cap.
  if (endTotalMsgCount - parentTotalMsgCount > BigInt(perBlockCap)) {
    return { accepted: false, reason: 'bundle_over_block_cap' };
  }

  // Check 3b: the running per-checkpoint total fits the per-checkpoint cap.
  if (endTotalMsgCount - checkpointStartTotalMsgCount > BigInt(perCheckpointCap)) {
    return { accepted: false, reason: 'checkpoint_over_msg_cap' };
  }

  // Check 4: the canonical prefix at the signed end count hashes to the signed reference. An empty block is checked
  // here too: its unchanged count must still name the prefix the proposer signed, so an empty range is never a
  // licence to skip the hash.
  const canonicalHash = await messageSource.getInboxRollingHashAt(endTotalMsgCount);
  if (canonicalHash === undefined) {
    return { accepted: false, reason: 'prefix_unavailable' };
  }
  if (!canonicalHash.equals(bucketRef.inboxRollingHash)) {
    return { accepted: false, reason: 'prefix_mismatch' };
  }

  return { accepted: true, parentTotalMsgCount, endTotalMsgCount, bucketRef };
}

/**
 * Reads the message-leaf bundle a streaming block proposal consumes (for re-execution) and re-confirms the signed
 * prefix hash *after* the read, so the leaves handed to re-execution and the confirmed prefix come from the same
 * stable view of the local Inbox.
 *
 * The re-confirmation is what makes this safe to call after
 * {@link checkStreamingBlockProposalMetadata}. That check is a point lookup, and an L1 reorg can commit a
 * content-changing message replacement between it and this read. Without the second check the range would either
 * return the *new* leaves — making re-execution report a `state_mismatch` against a proposal that was valid on the
 * view it was checked against, which is a slashable verdict for an honest proposer — or fail outright after a
 * dropped suffix. Reading first and confirming second catches both: a replacement landing on either side of the
 * read leaves the prefix hash at the end count no longer matching the signed reference.
 *
 * A range the source cannot serve whole is reported as `prefix_unavailable` rather than thrown, since it is the same
 * local-view condition as a missing prefix hash and the caller retries both the same way.
 *
 * A replacement that lands *after* the confirmation is not this function's race: the bundle and the proposal still
 * agree, so re-execution is consistent, and the archiver's insert guard is what refuses to store the block.
 */
export async function readStreamingBlockBundle(
  messageSource: StreamingInboxMessageSource,
  range: StreamingBlockCountRange,
): Promise<StreamingBlockCheckResult> {
  const { parentTotalMsgCount, endTotalMsgCount, bucketRef } = range;

  let bundle: Fr[];
  try {
    bundle =
      endTotalMsgCount === parentTotalMsgCount
        ? []
        : await messageSource.getL1ToL2MessagesBetweenLeafCounts(parentTotalMsgCount, endTotalMsgCount);
  } catch {
    return { accepted: false, reason: 'prefix_unavailable' };
  }

  const canonicalHash = await messageSource.getInboxRollingHashAt(endTotalMsgCount);
  if (canonicalHash === undefined) {
    return { accepted: false, reason: 'prefix_unavailable' };
  }
  if (!canonicalHash.equals(bucketRef.inboxRollingHash)) {
    return { accepted: false, reason: 'prefix_mismatch' };
  }

  return { accepted: true, bundle };
}

/**
 * Runs the per-block acceptance checks a validator applies to a streaming block proposal, and derives the
 * message-leaf bundle the block consumes. Composes {@link checkStreamingBlockProposalMetadata} with
 * {@link readStreamingBlockBundle} for callers that have no use for running the two phases separately.
 */
export async function checkStreamingBlockProposal(input: StreamingBlockCheckInput): Promise<StreamingBlockCheckResult> {
  const metadata = await checkStreamingBlockProposalMetadata(input);
  if (!metadata.accepted) {
    return metadata;
  }
  return readStreamingBlockBundle(input.messageSource, metadata);
}
