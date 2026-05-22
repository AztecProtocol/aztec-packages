import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';

/**
 * Hashes a public key.
 *
 * Mirrors Noir's `hash_public_key` in `noir-protocol-circuits/crates/types/src/public_keys.nr`:
 * `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, [pk.x, pk.y])`.
 *
 * This is distinct from Noir's generic `Hash` impl for `EmbeddedCurvePoint` (`noir_stdlib/src/embedded_curve_ops.nr`),
 * which simply absorbs `x` then `y` into a `Hasher` state with no domain separator. That generic impl is unsuitable
 * for hashing keys at the protocol boundary, where the domain separator is required to prevent collisions with hashes
 * of other Grumpkin points (e.g. note commitments, nullifiers).
 */
export function hashPublicKey(pk: PublicKey): Promise<Fr> {
  return poseidon2HashWithSeparator([pk.x, pk.y], DomainSeparator.SINGLE_PUBLIC_KEY_HASH);
}

/**
 * Represents a user public key.
 *
 * Structurally identical to a Grumpkin `Point`; exposed as a distinct name so call sites read as "public key" where
 * that's the domain meaning.
 */
export type PublicKey = Point;
export const PublicKey = Point;
