import { sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * The L1-to-L2 message leaves consumed by a checkpoint (or by a single block within it), grouped per L1 Inbox bucket
 * in insertion order.
 *
 * The grouping is what the Inbox rolling hash commits to: the first leaf of each group is hashed with the
 * bucket-start domain separator and the rest with the plain link separator, so two histories over the same leaves
 * packed into different buckets reach different rolling hashes. Every inner array is therefore non-empty — a bucket
 * exists only once its first message opened it, and an empty group would claim a bucket boundary with no leaf behind
 * it while flattening away silently. Bucket sequence numbers are deliberately not carried: nothing that recomputes
 * the hash needs them, and the components that do resolve them separately.
 */
export type InboxMessageBundle = Fr[][];

/** An empty bundle: a checkpoint or block that consumed no messages. Must not be mutated. */
export const EMPTY_BUNDLE: InboxMessageBundle = [];

/** Total number of message leaves in the bundle, across all buckets. */
export function bundleLength(bundle: InboxMessageBundle): number {
  return sum(bundle.map(bucket => bucket.length));
}

/** The bundle's message leaves in insertion order, with the bucket grouping dropped. */
export function flattenBundle(bundle: InboxMessageBundle): Fr[] {
  return bundle.flat();
}

/**
 * Per-leaf flags marking which leaves open an Inbox bucket, aligned with the leaves {@link flattenBundle} returns.
 * @throws If a bucket holds no leaves, which would silently shift every flag after it.
 */
export function bucketStartsOf(bundle: InboxMessageBundle): boolean[] {
  return bundle.flatMap((bucket, index) => {
    if (bucket.length === 0) {
      throw new Error(`Inbox message bundle has an empty bucket at index ${index}`);
    }
    return bucket.map((_leaf, leafIndex) => leafIndex === 0);
  });
}

/** Schema for a bundle crossing an RPC boundary; rejects the empty buckets the type forbids. */
export const InboxMessageBundleSchema = z.array(z.array(schemas.Fr).nonempty());
