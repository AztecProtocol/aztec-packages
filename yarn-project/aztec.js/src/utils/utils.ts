import { CircuitsWasm, Fr } from '@aztec/circuits.js';
import { computeSecretMessageHash } from '@aztec/circuits.js/abis';

/**
 * Given a secret, it computes its pederson hash - used to send l1 to l2 messages
 * @param secret - the secret to hash (defaults to a random field element)
 * @returns secret and its pederson hash (in hex).
 */
export async function createMessageSecretAndHash(secret = Fr.random()) {
  const wasm = await CircuitsWasm.get();
  const secretHash = computeSecretMessageHash(wasm, secret);
  const secretHashHex = `0x${secretHash.toBuffer().toString('hex')}` as `0x${string}`;
  return secretHashHex;
}
