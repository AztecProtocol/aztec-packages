import { Grumpkin } from '@aztec/foundation/crypto';
import type { GrumpkinScalar } from '@aztec/foundation/fields';
import type { PublicKey } from '@aztec/stdlib/keys';

/**
 * Method for generating a public grumpkin key from a private key.
 * @param privateKey - The private key.
 * @returns The generated public key.
 */
export function generatePublicKey(privateKey: GrumpkinScalar): Promise<PublicKey> {
  return Grumpkin.mul(Grumpkin.generator, privateKey);
}
