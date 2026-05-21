import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';

// TODO(MW): Still using hashPublicKey() rather than key.hash() because ts constructs a Point
// from inherited static methods e.g.
//  const npkM = await PublicKey.random(); <-- npkM is actually a Point...
// ... so npkM.hash() uses Point.hash(). This is a massive footgun and breaks address derivation.
// Can either:
//   - redefine all of the static Point methods below as overrides to return PublicKeys
//   - continue to use hashPublicKey() explicitly
export function hashPublicKey(pk: PublicKey): Promise<Fr> {
  return poseidon2HashWithSeparator([pk.x, pk.y], DomainSeparator.SINGLE_PUBLIC_KEY_HASH);
}

/** Represents a user public key. */
export class PublicKey extends Point {
  /**
   * Hashes a public key under the canonical single-public-key domain separator.
   *
   * `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, [pk.x, pk.y])`.
   */
  override hash(): Promise<Fr> {
    return hashPublicKey(this);
  }
}
