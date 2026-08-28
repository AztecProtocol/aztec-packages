import type { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
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
  /** L1 block in which this bucket was opened. */
  l1BlockNumber: bigint;
  /**
   * Hash of that L1 block as seen when the bucket was synced; lets callers test whether the bucket is still on the
   * canonical chain.
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
 * Reference to a settled Inbox rolling-hash bucket, carried alongside a block proposal so a
 * validator can look the bucket up in its own Inbox view and derive the consumed-message bundle itself, rather than
 * trusting a proposer-supplied message list. Pins the bucket by its dense sequence number and recency-key timestamp
 * and asserts the expected consensus rolling hash. A wrong reference can only cause a lookup miss or hash mismatch; it
 * can never change what a validator accepts, because the checkpoint header's `inboxRollingHash` remains the signed
 * consensus commitment (mirrors the unsigned bucket hint on L1's `Rollup.propose`).
 */
export class InboxBucketRef {
  constructor(
    /** Dense, monotonically increasing sequence number of the referenced bucket in the Inbox ring. */
    public readonly bucketSeq: bigint,
    /** L1 block timestamp (in seconds) at which the referenced bucket was opened; its recency key. */
    public readonly bucketTimestamp: bigint,
    /** Consensus rolling hash (truncated sha256 chain) after the last message absorbed into the referenced bucket. */
    public readonly inboxRollingHash: Fr,
  ) {}

  /** Serialized size in bytes: two uint64 fields plus one field element. */
  static readonly SIZE = 8 + 8 + Fr.SIZE_IN_BYTES;

  static get schema(): ZodFor<InboxBucketRef> {
    return z
      .object({
        bucketSeq: schemas.BigInt,
        bucketTimestamp: schemas.BigInt,
        inboxRollingHash: Fr.schema,
      })
      .transform(InboxBucketRef.from);
  }

  static from(fields: FieldsOf<InboxBucketRef>): InboxBucketRef {
    return new InboxBucketRef(fields.bucketSeq, fields.bucketTimestamp, fields.inboxRollingHash);
  }

  /** Derives a wire reference from a bucket snapshot as tracked by the archiver. */
  static fromBucket(bucket: InboxBucket): InboxBucketRef {
    return new InboxBucketRef(bucket.seq, bucket.timestamp, bucket.inboxRollingHash);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      bigintToUInt64BE(this.bucketSeq),
      bigintToUInt64BE(this.bucketTimestamp),
      this.inboxRollingHash,
    ]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): InboxBucketRef {
    const reader = BufferReader.asReader(buffer);
    return new InboxBucketRef(reader.readUInt64(), reader.readUInt64(), reader.readObject(Fr));
  }

  getSize(): number {
    return InboxBucketRef.SIZE;
  }

  equals(other: InboxBucketRef): boolean {
    return (
      this.bucketSeq === other.bucketSeq &&
      this.bucketTimestamp === other.bucketTimestamp &&
      this.inboxRollingHash.equals(other.inboxRollingHash)
    );
  }

  static empty(): InboxBucketRef {
    return new InboxBucketRef(0n, 0n, Fr.ZERO);
  }

  static random(): InboxBucketRef {
    return new InboxBucketRef(
      BigInt(Math.floor(Math.random() * 1000)),
      BigInt(Math.floor(Math.random() * 1_000_000)),
      Fr.random(),
    );
  }

  toInspect() {
    return {
      bucketSeq: this.bucketSeq.toString(),
      bucketTimestamp: this.bucketTimestamp.toString(),
      inboxRollingHash: this.inboxRollingHash.toString(),
    };
  }
}
