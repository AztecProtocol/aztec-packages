import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';

/** Represents a user public key. */
export type PublicKey = Point;

/**
 * Hashes a public key under the canonical single-public-key domain separator.
 *
 * `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, [pk.x, pk.y])` per AZIP-8. Only the affine
 * coordinates are hashed; `is_infinite` is intentionally excluded.
 */
export function hashPublicKey(pk: PublicKey): Promise<Fr> {
  return poseidon2HashWithSeparator([pk.x, pk.y], DomainSeparator.SINGLE_PUBLIC_KEY_HASH);
}
