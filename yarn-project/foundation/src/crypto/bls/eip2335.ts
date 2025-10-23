import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { z } from 'zod';

/**
 * EIP-2335 Keystore Format for BLS Keys
 *
 * Implements encryption and decryption of EIP-2335-compatible keystores for BN254 BLS private keys
 * using PBKDF2 and AES-128-CTR. This format is compatible with standard Ethereum 2.0 validator
 * key management tools.
 *
 * @see https://eips.ethereum.org/EIPS/eip-2335
 */

/**
 * Zod schema for validating EIP-2335 keystore structure
 */
const eip2335Schema = z.object({
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
 * Error thrown when EIP-2335 keystore operations fail
 */
export class Eip2335Error extends Error {
  constructor(
    message: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'Eip2335Error';
  }
}

export type Eip2335Keystore = z.infer<typeof eip2335Schema>;

/**
 * The JSON structure of an EIP-2335 keystore file.
 * @deprecated Use the inferred type from eip2335Schema instead
 */
export interface Eip2335KeystoreInterface {
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
 * Creates an EIP-2335-compatible keystore object for a BN254 BLS private key.
 *
 * Uses PBKDF2 with SHA-256 for key derivation and AES-128-CTR for encryption,
 * following the EIP-2335 specification.
 *
 * @param password - Password for encrypting the private key
 * @param privateKeyHex - Private key as 0x-prefixed hex string (32 bytes)
 * @param pubkeyHex - Public key as hex string (compressed or uncompressed)
 * @param derivationPath - BIP-44 style derivation path (e.g., "m/12381/3600/0/0/0")
 * @returns EIP-2335 keystore object ready to be serialized to JSON
 * @throws Error if private key is not 32-byte hex
 */
export function createEip2335Keystore(
  password: string,
  privateKeyHex: string,
  pubkeyHex: string,
  derivationPath: string,
): Eip2335Keystore {
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
 * Loads and validates an EIP-2335 keystore file.
 *
 * @param filePath - Path to the EIP-2335 keystore JSON file
 * @returns Validated keystore object
 * @throws Eip2335Error if file cannot be read or validated
 */
export function loadEip2335Keystore(filePath: string): Eip2335Keystore {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    return eip2335Schema.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Eip2335Error(`Invalid JSON in keystore file: ${filePath}`, error);
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as any).issues ?? [];
      const message = issues.map((e: any) => `${e.message} at ${e.path?.join('.') ?? 'root'}`).join('; ');
      throw new Eip2335Error(`Invalid EIP-2335 keystore format: ${message}`);
    }
    throw new Eip2335Error(`Failed to load keystore from ${filePath}: ${String(error)}`, error as Error);
  }
}

/**
 * Decrypts an EIP-2335 BLS private key from a keystore file.
 *
 * @param filePath - Path to the EIP-2335 keystore JSON file
 * @param password - Password to decrypt the keystore
 * @returns Decrypted private key as 0x-prefixed hex string (32 bytes)
 * @throws Eip2335Error if decryption fails or checksum is invalid
 */
export function decryptEip2335Keystore(filePath: string, password: string): string {
  const keystore = loadEip2335Keystore(filePath);
  return decryptEip2335KeystoreFromObject(keystore, password);
}

/**
 * Decrypts an EIP-2335 BLS private key from a keystore object.
 *
 * @param keystore - EIP-2335 keystore object
 * @param password - Password to decrypt the keystore
 * @returns Decrypted private key as 0x-prefixed hex string (32 bytes)
 * @throws Eip2335Error if decryption fails or checksum is invalid
 */
export function decryptEip2335KeystoreFromObject(keystore: Eip2335Keystore, password: string): string {
  try {
    const { crypto } = keystore;

    // Only support PBKDF2 + AES-128-CTR (as per our implementation)
    if (crypto.kdf.function !== 'pbkdf2') {
      throw new Eip2335Error(`Unsupported KDF function: ${crypto.kdf.function}`);
    }
    if (crypto.cipher.function !== 'aes-128-ctr') {
      throw new Eip2335Error(`Unsupported cipher function: ${crypto.cipher.function}`);
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
      throw new Eip2335Error('Checksum verification failed - incorrect password or corrupted keystore');
    }

    // Return as 0x-prefixed hex
    return '0x' + decrypted.toString('hex');
  } catch (error) {
    if (error instanceof Eip2335Error) {
      throw error;
    }
    throw new Eip2335Error(`Failed to decrypt keystore: ${String(error)}`, error as Error);
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
export function verifyEip2335Keypair(
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
