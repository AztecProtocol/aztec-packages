import { type GrumpkinScalar, type PublicKey } from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';

import { deriveAESSecret } from './shared_secret_derivation.js';

/**
 * Encrypts the plaintext using the secret key and public key
 *
 * @param plaintext - The plaintext buffer
 * @param secret - The secret key used to derive the AES secret
 * @param publicKey - Public key used to derived the AES secret
 * @param deriveSecret - Function to derive the AES secret from the ephemeral secret key and public key
 * @returns The ciphertext
 */
export function encrypt(
  plaintext: Buffer,
  secret: GrumpkinScalar,
  publicKey: PublicKey,
  deriveSecret: (secret: GrumpkinScalar, publicKey: PublicKey) => Buffer = deriveAESSecret,
): Buffer {
  const aesSecret = deriveSecret(secret, publicKey);
  const key = aesSecret.subarray(0, 16);
  const iv = aesSecret.subarray(16, 32);

  const aes128 = new Aes128();
  return aes128.encryptBufferCBC(plaintext, iv, key);
}

/**
 * Decrypts the ciphertext using the secret key and public key
 * @param ciphertext - The ciphertext buffer
 * @param secret - The secret key used to derive the AES secret
 * @param publicKey - The public key used to derive the AES secret
 * @param deriveSecret - Function to derive the AES secret from the ephemeral secret key and public key
 * @returns
 */
export function decrypt(
  ciphertext: Buffer,
  secret: GrumpkinScalar,
  publicKey: PublicKey,
  deriveSecret: (secret: GrumpkinScalar, publicKey: PublicKey) => Buffer = deriveAESSecret,
): Buffer {
  const aesSecret = deriveSecret(secret, publicKey);
  const key = aesSecret.subarray(0, 16);
  const iv = aesSecret.subarray(16, 32);

  const aes128 = new Aes128();
  return aes128.decryptBufferCBC(ciphertext, iv, key);
}
