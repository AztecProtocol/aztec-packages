import { sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/** One L1 Inbox bucket's worth of message leaves, in insertion order, with the L1 timestamp the bucket was opened at. */
export type InboxMessageBucket = {
  /** The bucket's L1 timestamp, in seconds. Rollover siblings share the timestamp of the block they spilled in. */
  timestamp: bigint;
  /** The bucket's message leaves, in insertion order. Never empty. */
  leaves: Fr[];
};

/**
 * The L1-to-L2 message leaves consumed by a checkpoint (or by a single block within it), grouped per L1 Inbox bucket
 * in insertion order.
 *
 * The grouping and each bucket's timestamp are what the Inbox rolling hash commits to: the first leaf of each group is
 * hashed with the bucket-start domain separator and the rest with the plain link separator, and every leaf absorbs its
 * bucket's timestamp. Two histories over the same leaves packed into different buckets, or into buckets opened at
 * different L1 times, therefore reach different rolling hashes. Every bucket is non-empty — a bucket exists only once
 * its first message opened it, and an empty group would claim a bucket boundary with no leaf behind it while
 * flattening away silently. Bucket sequence numbers are deliberately not carried: nothing that recomputes the hash
 * needs them, and the components that do resolve them separately.
 */
export type InboxMessageBundle = InboxMessageBucket[];

/** An empty bundle: a checkpoint or block that consumed no messages. Must not be mutated. */
export const EMPTY_BUNDLE: InboxMessageBundle = [];

/** Total number of message leaves in the bundle, across all buckets. */
export function bundleLength(bundle: InboxMessageBundle): number {
  return sum(bundle.map(bucket => bucket.leaves.length));
}

/** The bundle's message leaves in insertion order, with the bucket grouping dropped. */
export function flattenBundle(bundle: InboxMessageBundle): Fr[] {
  return bundle.flatMap(bucket => bucket.leaves);
}

/**
 * Per-leaf flags marking which leaves open an Inbox bucket, aligned with the leaves {@link flattenBundle} returns.
 * @throws If a bucket holds no leaves, which would silently shift every flag after it.
 */
export function bucketStartsOf(bundle: InboxMessageBundle): boolean[] {
  return bundle.flatMap((bucket, index) => {
    assertNonEmptyBucket(bucket, index);
    return bucket.leaves.map((_leaf, leafIndex) => leafIndex === 0);
  });
}

/**
 * Per-leaf bucket timestamps, aligned with the leaves {@link flattenBundle} returns: every leaf of a bucket carries
 * its bucket's timestamp, which is the value the rolling-hash link absorbs.
 * @throws If a bucket holds no leaves, which would silently shift every timestamp after it.
 */
export function bucketTimestampsOf(bundle: InboxMessageBundle): bigint[] {
  return bundle.flatMap((bucket, index) => {
    assertNonEmptyBucket(bucket, index);
    return bucket.leaves.map(() => bucket.timestamp);
  });
}

/**
 * The sub-bundle holding the leaves at flat positions `[start, end)`, keeping the bucket grouping and timestamps.
 * Boundaries outside the bundle simply select fewer leaves, as with `Array.prototype.slice`.
 *
 * Used to cut a checkpoint's bundle into the per-block bundles the block roots prove. Both boundaries must fall
 * between buckets: a block consumes whole buckets, and a slice that cut one in half could only be expressed as a
 * bundle whose first leaf claims to open a bucket it does not.
 * @throws If `start` or `end` falls inside a bucket.
 */
export function sliceBundle(bundle: InboxMessageBundle, start: number, end: number): InboxMessageBundle {
  const slice: InboxMessageBundle = [];
  let offset = 0;
  for (const bucket of bundle) {
    const bucketEnd = offset + bucket.leaves.length;
    if (offset >= start && bucketEnd <= end) {
      slice.push(bucket);
    } else if (bucketEnd > start && offset < end) {
      throw new Error(
        `Inbox message bundle slice [${start}, ${end}) cuts the bucket at leaves [${offset}, ${bucketEnd})`,
      );
    }
    offset = bucketEnd;
  }
  return slice;
}

function assertNonEmptyBucket(bucket: InboxMessageBucket, index: number) {
  if (bucket.leaves.length === 0) {
    throw new Error(`Inbox message bundle has an empty bucket at index ${index}`);
  }
}

/** Schema for a bundle crossing an RPC boundary; rejects the empty buckets the type forbids. */
export const InboxMessageBundleSchema = z.array(
  z.object({ timestamp: schemas.UInt64, leaves: z.array(schemas.Fr).nonempty() }),
);
