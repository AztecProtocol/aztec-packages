import { type PublicKey } from '@aztec/circuits.js/keys';
import { Grumpkin } from '@aztec/foundation/crypto';
import { type GrumpkinScalar } from '@aztec/foundation/fields';

/**
 * Method for generating a public grumpkin key from a private key.
 * @param privateKey - The private key.
 * @returns The generated public key.
 */
export function generatePublicKey(privateKey: GrumpkinScalar): Promise<PublicKey> {
  const grumpkin = new Grumpkin();
  return grumpkin.mul(grumpkin.generator(), privateKey);
}
