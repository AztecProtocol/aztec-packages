import { type GrumpkinScalar, type PublicKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/foundation/crypto';

/**
 * Method for generating a public grumpkin key from a private key.
 * @param privateKey - The private key.
 * @returns The generated public key.
 */
export function generatePublicKey(privateKey: GrumpkinScalar): Promise<PublicKey> {
  const grumpkin = new Grumpkin();
  return grumpkin.mul(grumpkin.generator(), privateKey);
}
