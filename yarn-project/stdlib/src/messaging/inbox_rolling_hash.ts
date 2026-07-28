import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';

/**
 * Extends the Inbox rolling-hash chain by a single message leaf, returning the new rolling hash.
 *
 * Each link is `sha256ToField(prev || leaf)` over the two 32-byte big-endian values, matching the truncated-to-field
 * sha256 the L1 Inbox accumulates, today's `inHash` frontier tree, and the noir `accumulate_inbox_rolling_hash` helper.
 */
export function updateInboxRollingHash(prev: Fr, leaf: Fr): Fr {
  return sha256ToField([prev.toBuffer(), leaf.toBuffer()]);
}

/**
 * Extends the Inbox rolling-hash chain by a list of message leaves, in order, returning the new rolling hash.
 * The genesis rolling hash is `Fr.ZERO`, and an empty list returns `start` unchanged.
 */
export function accumulateInboxRollingHash(start: Fr, leaves: Fr[]): Fr {
  return leaves.reduce(updateInboxRollingHash, start);
}
