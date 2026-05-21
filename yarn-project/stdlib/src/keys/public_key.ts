import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { BufferReader, FieldReader } from '@aztec/foundation/serialize';


export function hashPublicKey(pk: PublicKey): Promise<Fr> {
  return poseidon2HashWithSeparator([pk.x, pk.y], DomainSeparator.SINGLE_PUBLIC_KEY_HASH);
}

/** Represents a user public key. */
export class PublicKey extends Point {
  // TODO(MW): We cannot define an empty class via Point from_() (since input of [0, 0] creates (0, 0, true)), but
  // forcing (x, y, false) is incorrect (x = y = 0 <==> is_inf = true).
  // This is awkward for classes using points which need empty impls e.g. KeyValidationRequest.
  // Below is temporary solution for public keys which cannot be inf.
  static override fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    // TODO(MW): Check below now empty == inf
    return new this(reader.readField(), reader.readField());
  }

  static override fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  /**
 * Hashes a public key under the canonical single-public-key domain separator.
 *
 * `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, [pk.x, pk.y])`.
 */
  override hash(): Promise<Fr> {
    return poseidon2HashWithSeparator([this.x, this.y], DomainSeparator.SINGLE_PUBLIC_KEY_HASH);
}
}
