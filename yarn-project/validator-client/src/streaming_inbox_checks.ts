import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxMessagePrefixRef, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * Reason a streaming-Inbox block proposal fails the per-block acceptance checks. Follows the handler's existing
 * `{ isValid, reason }` string style.
 *
 * `inbox_prefix_unavailable` and `inbox_prefix_mismatch` are local-view outcomes rather than proposer misbehavior:
 * this node's archiver may be behind L1 or on the stale side of a reorg. The handler retries both through a bounded
 * local sync and never treats either as an offense, even if it cannot catch up before the deadline.
 */
export type StreamingBlockCheckReason =
  | 'inbox_prefix_unavailable'
  | 'inbox_prefix_mismatch'
  | 'consumption_moves_backwards'
  | 'bundle_over_block_cap'
  | 'checkpoint_over_msg_cap';

/** Failure reasons that mean "this node cannot confirm the proposal's prefix", which a local sync may fix. */
export const RETRYABLE_STREAMING_BLOCK_CHECK_REASONS: readonly StreamingBlockCheckReason[] = [
  'inbox_prefix_unavailable',
  'inbox_prefix_mismatch',
];

/** Whether a streaming check failure is a local-view outcome the handler retries after a forced sync. */
export function isRetryableStreamingBlockCheckReason(reason: StreamingBlockCheckReason): boolean {
  return RETRYABLE_STREAMING_BLOCK_CHECK_REASONS.includes(reason);
}

/** The subset of the archiver's Inbox queries the per-block streaming checks need. */
export type StreamingInboxMessageSource = Pick<L1ToL2MessageSource, 'getMessagePosition' | 'getL1ToL2MessageRange'>;

/** Inputs to the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckInput = {
  /** Archiver Inbox prefix lookup, resolved against this node's own Inbox view. */
  messageSource: Pick<StreamingInboxMessageSource, 'getMessagePosition'>;
  /**
   * The proposal's signed Inbox prefix reference: the rolling hash of the message prefix the block consumed through,
   * interpreted together with {@link endTotalMsgCount}. It need not name an L1 bucket boundary.
   */
  inboxPrefixRef: InboxMessagePrefixRef | undefined;
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
  /** The signed prefix reference the end count was confirmed against, carried through so the bundle read can re-confirm it. */
  inboxPrefixRef: InboxMessagePrefixRef;
};

/** Result of the per-block streaming Inbox metadata checks. */
export type StreamingBlockMetadataCheckResult =
  | ({
      /** Every metadata check passed; the block's bundle can be derived from the returned count range. */
      accepted: true;
    } & StreamingBlockCountRange)
  | {
      /** A check failed; `reason` mirrors the acceptance condition that rejected the proposal. */
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
      /** A check failed; `reason` mirrors the acceptance condition that rejected the proposal. */
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
 * There is deliberately no requirement that the end count sit on an L1 bucket boundary and no check on how recently
 * the messages arrived: blocks consume whatever message prefix the proposer's archiver had observed, and only the
 * completed checkpoint's final position has to resolve to a live bucket, which the proposer's publication preflight
 * and L1 `propose` enforce. Validators check only content consistency with their own view.
 *
 * Because this phase is cheap and needs nothing off the network, a caller can run it before committing to any
 * expensive work on a proposal, notably before collecting the proposal's transactions over P2P. The reject branch is
 * a single function so a caller can re-run the whole check after forcing a local sync, which is how the validator's
 * proposal handler turns either prefix outcome into a bounded wait: a node whose archiver has not yet followed a
 * reorg holds a *present* prefix hash at the end count that simply is not the canonical one any more, which is
 * indistinguishable here from a proposer naming a prefix that never existed.
 */
export async function checkStreamingBlockProposalMetadata(
  input: StreamingBlockMetadataCheckInput,
): Promise<StreamingBlockMetadataCheckResult> {
  const {
    messageSource,
    inboxPrefixRef,
    endTotalMsgCount,
    parentTotalMsgCount,
    checkpointStartTotalMsgCount,
    perBlockCap,
    perCheckpointCap,
  } = input;

  // Check 1: a streaming proposal must carry a prefix reference to authenticate its consumed range against.
  if (inboxPrefixRef === undefined) {
    return { accepted: false, reason: 'inbox_prefix_unavailable' };
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
  const canonical = await messageSource.getMessagePosition(endTotalMsgCount);
  if (canonical === undefined) {
    return { accepted: false, reason: 'inbox_prefix_unavailable' };
  }
  if (!canonical.rollingHash.equals(inboxPrefixRef.inboxRollingHash)) {
    return { accepted: false, reason: 'inbox_prefix_mismatch' };
  }

  return { accepted: true, parentTotalMsgCount, endTotalMsgCount, inboxPrefixRef };
}

/**
 * Reads the message-leaf bundle a streaming block proposal consumes (for re-execution) together with the prefix hash
 * it ends at, from one snapshot of the local Inbox, and confirms that hash against the signed reference.
 *
 * The metadata check is a point lookup, and an L1 reorg can commit a content-changing message replacement between it
 * and this read. Reading the leaves and the ending hash in one store transaction and comparing that hash to the
 * signed reference means the leaves handed to re-execution are exactly the ones the proposer signed over: a
 * replacement landing before the read shows up as a prefix mismatch here instead of as a re-execution
 * `state_mismatch` against leaves the proposer never saw, which would be a slashable verdict for an honest proposer.
 *
 * A range the source cannot serve whole is reported as `inbox_prefix_unavailable` rather than thrown, since it is the
 * same local-view condition as a missing prefix hash and the caller retries both the same way. A replacement that
 * lands *after* this read is not this function's race: the bundle and the proposal still agree, so re-execution is
 * consistent, and the archiver's insert guard is what refuses to store the block.
 */
export async function readStreamingBlockBundle(
  messageSource: Pick<StreamingInboxMessageSource, 'getL1ToL2MessageRange'>,
  range: StreamingBlockCountRange,
): Promise<StreamingBlockCheckResult> {
  const { parentTotalMsgCount, endTotalMsgCount, inboxPrefixRef } = range;

  let messages: Fr[];
  let endRollingHash: Fr;
  try {
    ({
      messages,
      end: { rollingHash: endRollingHash },
    } = await messageSource.getL1ToL2MessageRange(parentTotalMsgCount, endTotalMsgCount));
  } catch {
    return { accepted: false, reason: 'inbox_prefix_unavailable' };
  }

  if (!endRollingHash.equals(inboxPrefixRef.inboxRollingHash)) {
    return { accepted: false, reason: 'inbox_prefix_mismatch' };
  }

  return { accepted: true, bundle: messages };
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
