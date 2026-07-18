import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * Snapshot of an Inbox rolling-hash bucket as tracked by the archiver (AZIP-22 Fast Inbox).
 *
 * A bucket accumulates the message leaves inserted into the Inbox within a single L1 block (up to a per-bucket
 * maximum, after which further messages in the same block spill into the next bucket). Buckets are identified by
 * a dense, monotonically increasing sequence number and keyed for recency lookups by the L1 block timestamp at
 * which they were opened. Mirrors the on-chain `InboxBucket` struct plus the fields the archiver derives while
 * syncing.
 */
export type InboxBucket = {
  /** Dense, monotonically increasing sequence number of this bucket in the Inbox ring. */
  seq: bigint;
  /** Consensus rolling hash (truncated sha256 chain) after the last message absorbed into this bucket. */
  inboxRollingHash: Fr;
  /** Cumulative number of messages inserted into the Inbox up to and including this bucket. */
  totalMsgCount: bigint;
  /** L1 block timestamp at which this bucket was opened; the recency key for lag/cutoff comparisons, in seconds. */
  timestamp: bigint;
  /** Number of messages absorbed into this bucket. */
  msgCount: number;
  /** Global leaf index of the last message absorbed into this bucket. */
  lastMessageIndex: bigint;
  /**
   * Whether this is the latest bucket the archiver has synced. A latest bucket may still grow as more messages
   * arrive on L1; earlier buckets are complete. Consumers that need a settled bucket apply a lag on the timestamp.
   */
  isOpen: boolean;
};

export const InboxBucketSchema = z.object({
  seq: schemas.BigInt,
  inboxRollingHash: Fr.schema,
  totalMsgCount: schemas.BigInt,
  timestamp: schemas.BigInt,
  msgCount: schemas.Integer,
  lastMessageIndex: schemas.BigInt,
  isOpen: z.boolean(),
}) satisfies z.ZodType<InboxBucket>;
