import { DomainSeparator } from '@aztec/constants';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { numToUInt32BE } from '@aztec/foundation/serialize';

import type { InboxMessageBundle } from './inbox_message_bundle.js';

const MAX_BUCKET_TIMESTAMP = 2n ** 64n - 1n;

/**
 * Extends the Inbox rolling-hash chain by a single message leaf, returning the new rolling hash.
 *
 * Each link is `sha256ToField(separator || prev || leaf || timestamp)` over the 4-byte big-endian domain separator,
 * the two 32-byte big-endian values, and the 8-byte big-endian timestamp of the bucket the leaf belongs to, matching
 * the truncated-to-field sha256 the L1 Inbox accumulates and the noir `accumulate_inbox_rolling_hash` helper. The
 * separator is `INBOX_ROLLING_HASH_BUCKET_START` when the leaf is the first message of an L1 bucket and
 * `INBOX_ROLLING_HASH` otherwise, so the chain commits to how L1 packed the messages into buckets and to when it
 * opened each one. Both separators distinguish a chain link from the untagged `outHash` merkle node hash, which
 * absorbs the same two-field preimage shape.
 * @throws If `timestamp` does not fit the eight bytes L1 stores it in, which would otherwise hash a truncated value.
 */
export function updateInboxRollingHash(prev: Fr, leaf: Fr, opensBucket: boolean, timestamp: bigint): Fr {
  if (timestamp < 0n || timestamp > MAX_BUCKET_TIMESTAMP) {
    throw new Error(`Inbox bucket timestamp ${timestamp} does not fit in a uint64`);
  }
  const separator = opensBucket ? DomainSeparator.INBOX_ROLLING_HASH_BUCKET_START : DomainSeparator.INBOX_ROLLING_HASH;
  return sha256ToField([numToUInt32BE(separator), prev.toBuffer(), leaf.toBuffer(), toBufferBE(timestamp, 8)]);
}

/**
 * Extends the Inbox rolling-hash chain by a bundle of message leaves, in order, returning the new rolling hash. The
 * first leaf of every bucket in the bundle opens a bucket, and every leaf links with its bucket's timestamp. The
 * genesis rolling hash is `Fr.ZERO`, and an empty bundle returns `start` unchanged.
 */
export function accumulateInboxRollingHash(start: Fr, bundle: InboxMessageBundle): Fr {
  let acc = start;
  for (const bucket of bundle) {
    for (const [index, leaf] of bucket.leaves.entries()) {
      acc = updateInboxRollingHash(acc, leaf, index === 0, bucket.timestamp);
    }
  }
  return acc;
}
