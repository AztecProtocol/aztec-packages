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
 * Content-addressed reference to the ordered Inbox message prefix a block consumed through, carried alongside a
 * block proposal so a validator can confirm the prefix against its own Inbox view and read the consumed-message
 * bundle itself, rather than trusting a proposer-supplied message list.
 *
 * The reference is only half of the pair that authenticates a block: it must be interpreted together with the
 * *count* the block's signed header commits to in `state.l1ToL2MessageTree.nextAvailableLeafIndex`. Because every
 * message's rolling hash chains the one before it, a hash matching at that count proves the proposer consumed
 * exactly the leaves the validator holds, which is what makes the range between the parent's count and this one
 * canonical by content.
 *
 * The referenced position need **not** be a boundary of the bucket partition a node currently holds. An L1 reorg
 * that re-mines the same messages under different bucket boundaries leaves every leaf and every prefix hash intact
 * while moving the boundaries, so a block that ended on a boundary the reorg merged away stays exactly as valid as
 * when it was signed. Only a completed checkpoint's final position must still resolve to a current bucket, since
 * that is what the L1 `bucketHint` and the censorship/cap asserts are read against.
 *
 * The name is retained from when the reference did name a bucket; it is kept so the wire format and every call site
 * stay untouched, and the terminology migration is deferred. A wrong reference can only cause a confirmation miss,
 * or select a bundle that re-execution of the block then rejects; the checkpoint header's `inboxRollingHash` remains
 * the signed consensus commitment.
 */
export class InboxBucketRef {
  constructor(
    /**
     * Consensus rolling hash (truncated sha256 chain) of the canonical message prefix the block consumed through,
     * i.e. after the message at `header.state.l1ToL2MessageTree.nextAvailableLeafIndex - 1`. Zero at genesis.
     */
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

  /**
   * Derives a wire reference from a bucket snapshot as tracked by the archiver. A bucket's rolling hash *is* the
   * prefix hash at its cumulative total, so this is the convenience form for a position that happens to sit on a
   * current boundary; a position interior to a bucket is referenced by constructing the prefix hash directly.
   */
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
