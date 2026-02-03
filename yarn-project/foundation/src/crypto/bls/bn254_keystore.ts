import { randomBytes } from '@aztec/foundation/crypto/random';

import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { z } from 'zod';

/**
 * BN254 Keystore Format
 *
 * Implements encryption and decryption of keystores for BN254 BLS private keys
 * using PBKDF2 and AES-128-CTR. This format is inspired by EIP-2335 but adapted
 * for BN254 keys rather than BLS12-381.
 *
 * @see https://eips.ethereum.org/EIPS/eip-2335
 */

/**
 * Zod schema for validating BN254 keystore structure
 */
const bn254KeystoreSchema = z.object({
  crypto: z.object({
    kdf: z.object({
      function: z.literal('pbkdf2'),
      params: z.object({
        dklen: z.number(),
        c: z.number(),
        prf: z.string(),
        salt: z.string(),
      }),
      message: z.string(),
    }),
    checksum: z.object({
      function: z.literal('sha256'),
      params: z.object({}),
      message: z.string(),
    }),
    cipher: z.object({
      function: z.literal('aes-128-ctr'),
      params: z.object({
        iv: z.string(),
      }),
      message: z.string(),
    }),
  }),
  description: z.string().optional(),
  pubkey: z.string(),
  path: z.string(),
  uuid: z.string(),
  version: z.number(),
});

/**
 * Error thrown when BN254 keystore operations fail
 */
export class Bn254KeystoreError extends Error {
  constructor(
    message: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'Bn254KeystoreError';
  }
}

export type Bn254Keystore = z.infer<typeof bn254KeystoreSchema>;

/**
 * The JSON structure of a BN254 keystore file.
 * @deprecated Use the inferred type from bn254KeystoreSchema instead
 */
export interface Bn254KeystoreInterface {
  crypto: {
    kdf: {
      function: 'pbkdf2';
      params: {
        dklen: number;
        c: number;
        prf: string;
        salt: string;
      };
      message: string;
    };
    checksum: {
      function: 'sha256';
      params: Record<string, never>;
      message: string;
    };
    cipher: {
      function: 'aes-128-ctr';
      params: {
        iv: string;
      };
      message: string;
    };
  };
  description: string;
  pubkey: string;
  path: string;
  uuid: string;
  version: number;
}

/**
 * Creates a BN254 keystore object for a BN254 BLS private key.
 *
 * Uses PBKDF2 with SHA-256 for key derivation and AES-128-CTR for encryption,
 * following the EIP-2335 specification format.
 *
 * @param password - Password for encrypting the private key
 * @param privateKeyHex - Private key as 0x-prefixed hex string (32 bytes)
 * @param pubkeyHex - Public key as hex string (compressed or uncompressed)
 * @param derivationPath - BIP-44 style derivation path (e.g., "m/12381/3600/0/0/0")
 * @returns BN254 keystore object ready to be serialized to JSON
 * @throws Error if private key is not 32-byte hex
 */
export function createBn254Keystore(
  password: string,
  privateKeyHex: string,
  pubkeyHex: string,
  derivationPath: string,
): Bn254Keystore {
  const ensureHex = (hex: string) => hex.replace(/^0x/i, '');
  const privHex = ensureHex(privateKeyHex);
  if (!/^[0-9a-fA-F]{64}$/.test(privHex)) {
    throw new Error('BLS private key must be 32-byte hex');
  }

  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const dk = pbkdf2Sync(Buffer.from(password.normalize('NFKD'), 'utf8'), salt, 262144, 32, 'sha256');
  const cipherKey = dk.subarray(0, 16);

  const cipher = createCipheriv('aes-128-ctr', cipherKey, iv);
  const plaintext = Buffer.from(privHex, 'hex');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const checksum = createHash('sha256')
    .update(Buffer.concat([dk.subarray(16, 32), ciphertext]))
    .digest();

  const uuid = randomUUID();

  return {
    crypto: {
      kdf: {
        function: 'pbkdf2',
        params: { dklen: 32, c: 262144, prf: 'hmac-sha256', salt: salt.toString('hex') },
        message: '',
      },
      checksum: {
        function: 'sha256',
        params: {},
        message: checksum.toString('hex'),
      },
      cipher: {
        function: 'aes-128-ctr',
        params: { iv: iv.toString('hex') },
        message: ciphertext.toString('hex'),
      },
    },
    description: ensureHex(pubkeyHex),
    pubkey: pubkeyHex,
    path: derivationPath ?? '',
    uuid,
    version: 4,
  };
}

/**
 * Loads and validates a BN254 keystore file.
 *
 * @param filePath - Path to the BN254 keystore JSON file
 * @returns Validated keystore object
 * @throws Bn254KeystoreError if file cannot be read or validated
 */
export function loadBn254Keystore(filePath: string): Bn254Keystore {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    return bn254KeystoreSchema.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Bn254KeystoreError(`Invalid JSON in keystore file: ${filePath}`, error);
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as any).issues ?? [];
      const message = issues.map((e: any) => `${e.message} at ${e.path?.join('.') ?? 'root'}`).join('; ');
      throw new Bn254KeystoreError(`Invalid BN254 keystore format: ${message}`);
    }
    throw new Bn254KeystoreError(`Failed to load keystore from ${filePath}: ${String(error)}`, error as Error);
  }
}

/**
 * Decrypts a BN254 BLS private key from a keystore file.
 *
 * @param filePath - Path to the BN254 keystore JSON file
 * @param password - Password to decrypt the keystore
 * @returns Decrypted private key as 0x-prefixed hex string (32 bytes)
 * @throws Bn254KeystoreError if decryption fails or checksum is invalid
 */
export function decryptBn254Keystore(filePath: string, password: string): string {
  const keystore = loadBn254Keystore(filePath);
  return decryptBn254KeystoreFromObject(keystore, password);
}

/**
 * Decrypts a BN254 BLS private key from a keystore object.
 *
 * @param keystore - BN254 keystore object
 * @param password - Password to decrypt the keystore
 * @returns Decrypted private key as 0x-prefixed hex string (32 bytes)
 * @throws Bn254KeystoreError if decryption fails or checksum is invalid
 */
export function decryptBn254KeystoreFromObject(keystore: Bn254Keystore, password: string): string {
  try {
    const { crypto } = keystore;

    // Only support PBKDF2 + AES-128-CTR (as per our implementation)
    if (crypto.kdf.function !== 'pbkdf2') {
      throw new Bn254KeystoreError(`Unsupported KDF function: ${crypto.kdf.function}`);
    }
    if (crypto.cipher.function !== 'aes-128-ctr') {
      throw new Bn254KeystoreError(`Unsupported cipher function: ${crypto.cipher.function}`);
    }

    // Derive decryption key using PBKDF2
    const salt = Buffer.from(crypto.kdf.params.salt, 'hex');
    const dk = pbkdf2Sync(
      Buffer.from(password.normalize('NFKD'), 'utf8'),
      salt,
      crypto.kdf.params.c,
      crypto.kdf.params.dklen,
      'sha256',
    );

    const cipherKey = dk.subarray(0, 16);
    const checksumKey = dk.subarray(16, 32);

    // Decrypt the ciphertext
    const iv = Buffer.from(crypto.cipher.params.iv, 'hex');
    const ciphertext = Buffer.from(crypto.cipher.message, 'hex');
    const decipher = createDecipheriv('aes-128-ctr', cipherKey, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Verify checksum
    const computedChecksum = createHash('sha256')
      .update(Buffer.concat([checksumKey, ciphertext]))
      .digest();
    const expectedChecksum = Buffer.from(crypto.checksum.message, 'hex');

    if (!computedChecksum.equals(expectedChecksum)) {
      throw new Bn254KeystoreError('Checksum verification failed - incorrect password or corrupted keystore');
    }

    // Return as 0x-prefixed hex
    return '0x' + decrypted.toString('hex');
  } catch (error) {
    if (error instanceof Bn254KeystoreError) {
      throw error;
    }
    throw new Bn254KeystoreError(`Failed to decrypt keystore: ${String(error)}`, error as Error);
  }
}

/**
 * Validates that a decrypted private key matches the public key in the keystore.
 *
 * @param privateKeyHex - Decrypted private key (0x-prefixed)
 * @param expectedPubkey - Expected public key from keystore
 * @param computePublicKey - Function to compute public key from private key
 * @returns true if keys match, false otherwise
 */
export function verifyBn254Keypair(
  privateKeyHex: string,
  expectedPubkey: string,
  computePublicKey: (privateKey: string) => string,
): boolean {
  try {
    const computedPubkey = computePublicKey(privateKeyHex);
    const normalizedExpected = expectedPubkey.toLowerCase().replace(/^0x/i, '');
    const normalizedComputed = computedPubkey.toLowerCase().replace(/^0x/i, '');
    return normalizedExpected === normalizedComputed;
  } catch {
    return false;
  }
}
