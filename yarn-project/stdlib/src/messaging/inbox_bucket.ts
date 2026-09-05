import type { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * Snapshot of an Inbox rolling-hash bucket as tracked by the archiver.
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
   * L1 block in which this bucket was opened. Buckets are keyed by L1 block timestamp, so on a chain that allows
   * consecutive blocks to share a timestamp (anvil with manual mining, for instance) a bucket may span several L1
   * blocks and only the opening one is recorded. Production Ethereum timestamps are strictly increasing, so there a
   * bucket never spans more than one block.
   */
  l1BlockNumber: bigint;
  /**
   * Hash of that L1 block as seen when the bucket was synced; lets callers test whether the bucket is still on the
   * canonical chain. Since only the opening block is recorded, a reorg that touches only a later co-timestamped block
   * of the same bucket is not detectable from this hash.
   */
  l1BlockHash: Buffer32;
};

export const InboxBucketSchema = z.object({
  seq: schemas.BigInt,
  inboxRollingHash: Fr.schema,
  totalMsgCount: schemas.BigInt,
  timestamp: schemas.BigInt,
  msgCount: schemas.Integer,
  lastMessageIndex: schemas.BigInt,
  l1BlockNumber: schemas.BigInt,
  l1BlockHash: schemas.Buffer32,
}) satisfies z.ZodType<InboxBucket>;
