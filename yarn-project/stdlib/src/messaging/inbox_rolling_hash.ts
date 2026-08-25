import { DomainSeparator } from '@aztec/constants';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { numToUInt32BE } from '@aztec/foundation/serialize';

import type { InboxMessageBundle } from './inbox_message_bundle.js';

/**
 * Extends the Inbox rolling-hash chain by a single message leaf, returning the new rolling hash.
 *
 * Each link is `sha256ToField(separator || prev || leaf)` over the 4-byte big-endian domain separator followed by the
 * two 32-byte big-endian values, matching the truncated-to-field sha256 the L1 Inbox accumulates and the noir
 * `accumulate_inbox_rolling_hash` helper. The separator is `INBOX_ROLLING_HASH_BUCKET_START` when the leaf is the
 * first message of an L1 bucket and `INBOX_ROLLING_HASH` otherwise, so the chain commits to how L1 packed the
 * messages into buckets. Both separators distinguish a chain link from the untagged `outHash` merkle node hash, which
 * absorbs the same two-field preimage shape.
 */
export function updateInboxRollingHash(prev: Fr, leaf: Fr, opensBucket: boolean): Fr {
  const separator = opensBucket ? DomainSeparator.INBOX_ROLLING_HASH_BUCKET_START : DomainSeparator.INBOX_ROLLING_HASH;
  return sha256ToField([numToUInt32BE(separator), prev.toBuffer(), leaf.toBuffer()]);
}

/**
 * Extends the Inbox rolling-hash chain by a bundle of message leaves, in order, returning the new rolling hash. The
 * first leaf of every bucket in the bundle opens a bucket. The genesis rolling hash is `Fr.ZERO`, and an empty bundle
 * returns `start` unchanged.
 */
export function accumulateInboxRollingHash(start: Fr, bundle: InboxMessageBundle): Fr {
  let acc = start;
  for (const bucket of bundle) {
    for (const [index, leaf] of bucket.entries()) {
      acc = updateInboxRollingHash(acc, leaf, index === 0);
    }
  }
  return acc;
}
