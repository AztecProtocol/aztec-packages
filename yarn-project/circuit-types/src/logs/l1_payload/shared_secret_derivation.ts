import { GeneratorIndex, type GrumpkinScalar, type PublicKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { poseidon2HashWithSeparator, sha256 } from '@aztec/foundation/crypto';
import { numToUInt8 } from '@aztec/foundation/serialize';

/**
 * Derive an AES secret key using Elliptic Curve Diffie-Hellman (ECDH) and SHA-256.
 * The function takes in an ECDH public key, a private key, and a Grumpkin instance to compute
 * the shared secret. The shared secret is then hashed using SHA-256 to produce the final
 * AES secret key.
 *
 * @param secretKey - The secret key used to derive shared secret.
 * @param publicKey - The public key used to derive shared secret.
 * @returns A derived AES secret key.
 * @throws If the public key is zero.
 * TODO(#5726): This function is called point_to_symmetric_key in Noir. I don't like that name much since point is not
 * the only input of the function. Unify naming once we have a better name.
 */
export function deriveDiffieHellmanAESSecret(secretKey: GrumpkinScalar, publicKey: PublicKey): Buffer {
  if (publicKey.isZero()) {
    throw new Error(
      `Attempting to derive AES secret with a zero public key. You have probably passed a zero public key in your Noir code somewhere thinking that the note won't broadcasted... but it was.`,
    );
  }
  const curve = new Grumpkin();
  const sharedSecret = curve.mul(publicKey, secretKey);
  const secretBuffer = Buffer.concat([sharedSecret.toCompressedBuffer(), numToUInt8(GeneratorIndex.SYMMETRIC_KEY)]);
  const hash = sha256(secretBuffer);
  return hash;
}

/**
 * Derives an AES symmetric key from the app siloed outgoing viewing secret key
 * and the ephemeral public key using poseidon.
 *
 * @param ovskApp - The app siloed outgoing viewing secret key
 * @param ephPk - The ephemeral public key
 * @returns The derived AES symmetric key
 */
export function derivePoseidonAESSecret(ovskApp: GrumpkinScalar, ephPk: PublicKey) {
  // For performance reasons, we do NOT use the usual `deriveAESSecret` function here and instead we compute it using
  // poseidon. Note that we can afford to use poseidon here instead of deriving shared secret using Diffie-Hellman
  // because for outgoing we are encrypting for ourselves and hence we don't need to perform a key exchange.
  return poseidon2HashWithSeparator(
    [ovskApp.hi, ovskApp.lo, ephPk.x, ephPk.y],
    GeneratorIndex.SYMMETRIC_KEY,
  ).toBuffer();
}
