import { GeneratorIndex, type Point } from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { sha256 } from '@aztec/foundation/crypto';
import { numToUInt8 } from '@aztec/foundation/serialize';

function extractCloseToUniformlyRandom256BitsFromEcdhSharedSecretUsingSha256(sharedSecret: Point): Buffer {
  const secretBuffer = Buffer.concat([sharedSecret.toCompressedBuffer(), numToUInt8(GeneratorIndex.SYMMETRIC_KEY)]);
  const hash = sha256(secretBuffer);
  return hash;
}

function deriveAesSymmetricKeyAndIvFromEcdhSharedSecret(
  sharedSecret: Point,
  randomnessExtractionFunction: (sharedSecret: Point) => Buffer,
): [Buffer, Buffer] {
  const random256Bits = randomnessExtractionFunction(sharedSecret);
  const symKey = random256Bits.subarray(0, 16);
  const iv = random256Bits.subarray(16, 32);
  return [symKey, iv];
}

export function deriveAesSymmetricKeyAndIvFromEcdhSharedSecretUsingSha256(sharedSecret: Point): [Buffer, Buffer] {
  return deriveAesSymmetricKeyAndIvFromEcdhSharedSecret(
    sharedSecret,
    extractCloseToUniformlyRandom256BitsFromEcdhSharedSecretUsingSha256,
  );
}

/**
 * Encrypts the plaintext using the secret key and public key
 *
 * @param plaintext - The plaintext buffer
 * @param secret - The secret key used to derive the AES secret
 * @param publicKey - Public key used to derived the AES secret
 * @param deriveSecret - Function to derive the AES secret from the ephemeral secret key and public key
 * @returns The ciphertext
 */
export function aes128Encrypt(plaintext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
  const aes128 = new Aes128();
  return aes128.encryptBufferCBC(plaintext, iv, symKey);
}

/**
 * Decrypts the ciphertext using the secret key and public key
 * @param ciphertext - The ciphertext buffer
 * @param secret - The secret key used to derive the AES secret
 * @param publicKey - The public key used to derive the AES secret
 * @param deriveSecret - Function to derive the AES secret from the ephemeral secret key and public key
 * @returns
 */
export function aes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
  const aes128 = new Aes128();
  return aes128.decryptBufferCBC(ciphertext, iv, symKey);
}
