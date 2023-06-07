import { CircuitsWasm, Fr } from '@aztec/circuits.js';
import { computeSecretMessageHash } from '@aztec/circuits.js/abis';

/**
 * Given a secret, it computes its pederson hash - used to send l1 to l2 messages
 * @param secret - the secret to hash (defaults to a random field element)
 * @returns the hash
 */
export async function computeMessageSecretHash(secret = Fr.random()): Promise<Fr> {
  const wasm = await CircuitsWasm.get();
  return computeSecretMessageHash(wasm, secret);
}
