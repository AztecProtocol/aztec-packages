import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { L2Tips } from '../block/l2_block_source.js';
import type { InboxBucket } from './inbox_bucket.js';

/**
 * Interface of classes allowing for the retrieval of L1 to L2 messages.
 */
export interface L1ToL2MessageSource {
  /**
   * Gets new L1 to L2 message (to be) included in a given checkpoint.
   * @param checkpointNumber - Checkpoint number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree.
   * @throws If the message tree for the given checkpoint has not yet been sealed on L1
   * (i.e., checkpointNumber >= inbox treeInProgress).
   */
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]>;

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined>;

  /**
   * Returns the latest Inbox bucket opened at or before the given L1 timestamp, or undefined if no such bucket
   * exists (i.e., every synced bucket was opened strictly after the timestamp). Used by the sequencer/validator
   * to resolve the censorship cutoff and message-lag boundaries (AZIP-22 Fast Inbox).
   * @param timestamp - The L1 timestamp (in seconds) to look up at-or-before.
   */
  getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined>;

  /**
   * Returns the Inbox bucket with the given sequence number, or undefined if it has not been synced (AZIP-22 Fast
   * Inbox). Validators use this to resolve the bucket a proposal references and check its rolling hash.
   * @param seq - The bucket sequence number.
   */
  getInboxBucket(seq: bigint): Promise<InboxBucket | undefined>;

  /**
   * Returns the message leaves absorbed into buckets in the range `(fromExclusive, toInclusive]`, in insertion
   * order, for streaming message-bundle derivation (AZIP-22 Fast Inbox). Returns an empty array if the upper
   * bucket has not been synced.
   * @param fromExclusive - The lower bucket sequence bound, exclusive (0 means from the start of the Inbox).
   * @param toInclusive - The upper bucket sequence bound, inclusive.
   */
  getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<Fr[]>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;
}
