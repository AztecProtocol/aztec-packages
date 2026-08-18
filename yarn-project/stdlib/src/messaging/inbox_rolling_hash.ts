import { DomainSeparator } from '@aztec/constants';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { numToUInt32BE } from '@aztec/foundation/serialize';

/**
 * Extends the Inbox rolling-hash chain by a single message leaf, returning the new rolling hash.
 *
 * Each link is `sha256ToField(DOM_SEP__INBOX_ROLLING_HASH || prev || leaf)` over the 4-byte big-endian domain
 * separator followed by the two 32-byte big-endian values, matching the truncated-to-field sha256 the L1 Inbox
 * accumulates and the noir `accumulate_inbox_rolling_hash` helper. The separator distinguishes a chain link from the
 * untagged `outHash` merkle node hash, which absorbs the same two-field preimage shape.
 */
export function updateInboxRollingHash(prev: Fr, leaf: Fr): Fr {
  return sha256ToField([numToUInt32BE(DomainSeparator.INBOX_ROLLING_HASH), prev.toBuffer(), leaf.toBuffer()]);
}

/**
 * Extends the Inbox rolling-hash chain by a list of message leaves, in order, returning the new rolling hash.
 * The genesis rolling hash is `Fr.ZERO`, and an empty list returns `start` unchanged.
 */
export function accumulateInboxRollingHash(start: Fr, leaves: Fr[]): Fr {
  return leaves.reduce(updateInboxRollingHash, start);
}
