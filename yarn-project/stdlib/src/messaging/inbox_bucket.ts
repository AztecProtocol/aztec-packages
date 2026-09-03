import type { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

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

/**
 * Content-addressed reference to a settled Inbox rolling-hash bucket, carried alongside a block proposal so a
 * validator can look the bucket up in its own Inbox view and derive the consumed-message bundle itself, rather than
 * trusting a proposer-supplied message list. The rolling hash commits to every message the Inbox absorbed up to and
 * including the bucket, so it identifies the bucket by content and survives an L1 reorg that only re-times or
 * renumbers buckets; the sequence number and timestamp are read from the locally resolved bucket, never from the
 * wire. A wrong reference can only cause a lookup miss, or select a bundle that re-execution of the block then
 * rejects; the checkpoint header's `inboxRollingHash` remains the signed consensus commitment.
 */
export class InboxBucketRef {
  constructor(
    /** Consensus rolling hash (truncated sha256 chain) after the last message absorbed into the referenced bucket. */
    public readonly inboxRollingHash: Fr,
  ) {}

  /** Serialized size in bytes: one field element. */
  static readonly SIZE = Fr.SIZE_IN_BYTES;

  static get schema(): ZodFor<InboxBucketRef> {
    return z.object({ inboxRollingHash: Fr.schema }).transform(InboxBucketRef.from);
  }

  static from(fields: FieldsOf<InboxBucketRef>): InboxBucketRef {
    return new InboxBucketRef(fields.inboxRollingHash);
  }

  /** Derives a wire reference from a bucket snapshot as tracked by the archiver. */
  static fromBucket(bucket: InboxBucket): InboxBucketRef {
    return new InboxBucketRef(bucket.inboxRollingHash);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.inboxRollingHash]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): InboxBucketRef {
    const reader = BufferReader.asReader(buffer);
    return new InboxBucketRef(reader.readObject(Fr));
  }

  getSize(): number {
    return InboxBucketRef.SIZE;
  }

  equals(other: InboxBucketRef): boolean {
    return this.inboxRollingHash.equals(other.inboxRollingHash);
  }

  static empty(): InboxBucketRef {
    return new InboxBucketRef(Fr.ZERO);
  }

  static random(): InboxBucketRef {
    return new InboxBucketRef(Fr.random());
  }

  toInspect() {
    return { inboxRollingHash: this.inboxRollingHash.toString() };
  }
}
