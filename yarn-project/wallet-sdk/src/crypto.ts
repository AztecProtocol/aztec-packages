/**
 * Cryptographic utilities for secure wallet communication.
 *
 * This module provides ECDH key exchange and AES-GCM encryption primitives
 * for establishing secure communication channels between dApps and wallet extensions.
 *
 * The crypto flow:
 * 1. Both parties generate ECDH key pairs using {@link generateKeyPair}
 * 2. Public keys are exchanged (exported via {@link exportPublicKey}, imported via {@link importPublicKey})
 * 3. Both parties derive the same shared secret using {@link deriveSharedKey}
 * 4. Messages are encrypted/decrypted using {@link encrypt} and {@link decrypt}
 *
 * @example
 * ```typescript
 * // Party A
 * const keyPairA = await generateKeyPair();
 * const publicKeyA = await exportPublicKey(keyPairA.publicKey);
 *
 * // Party B
 * const keyPairB = await generateKeyPair();
 * const publicKeyB = await exportPublicKey(keyPairB.publicKey);
 *
 * // Exchange public keys, then derive shared secret
 * const importedB = await importPublicKey(publicKeyB);
 * const sharedKeyA = await deriveSharedKey(keyPairA.privateKey, importedB);
 *
 * // Encrypt and decrypt
 * const encrypted = await encrypt(sharedKeyA, { message: 'hello' });
 * const decrypted = await decrypt(sharedKeyB, encrypted);
 * ```
 *
 * @packageDocumentation
 */
import { jsonStringify } from '@aztec/foundation/json-rpc';

/**
 * Exported public key in JWK format for transmission over untrusted channels.
 *
 * Contains only the public components of an ECDH P-256 key, safe to share.
 */
export interface ExportedPublicKey {
  /** Key type - always "EC" for elliptic curve */
  kty: string;
  /** Curve name - always "P-256" */
  crv: string;
  /** X coordinate (base64url encoded) */
  x: string;
  /** Y coordinate (base64url encoded) */
  y: string;
}

/**
 * Encrypted message payload containing ciphertext and initialization vector.
 *
 * Both fields are base64-encoded for safe transmission as JSON.
 */
export interface EncryptedPayload {
  /** Initialization vector (base64 encoded, 12 bytes) */
  iv: string;
  /** Ciphertext (base64 encoded) */
  ciphertext: string;
}

/**
 * ECDH key pair for secure communication.
 *
 * The private key should never be exported or transmitted.
 * The public key can be exported via {@link exportPublicKey} for exchange.
 */
export interface SecureKeyPair {
  /** Public key - safe to share */
  publicKey: CryptoKey;
  /** Private key - keep secret, used for key derivation */
  privateKey: CryptoKey;
}

/**
 * Generates an ECDH P-256 key pair for key exchange.
 *
 * The generated key pair can be used to derive a shared secret with another
 * party's public key using {@link deriveSharedKey}.
 *
 * @returns A new ECDH key pair
 *
 * @example
 * ```typescript
 * const keyPair = await generateKeyPair();
 * const publicKey = await exportPublicKey(keyPair.publicKey);
 * // Send publicKey to the other party
 * ```
 */
export async function generateKeyPair(): Promise<SecureKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable (needed to export public key)
    ['deriveKey'],
  );
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Exports a public key to JWK format for transmission.
 *
 * The exported key contains only public components and is safe to transmit
 * over untrusted channels.
 *
 * @param publicKey - The CryptoKey public key to export
 * @returns The public key in JWK format
 *
 * @example
 * ```typescript
 * const keyPair = await generateKeyPair();
 * const exported = await exportPublicKey(keyPair.publicKey);
 * // exported can be JSON serialized and sent to another party
 * ```
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<ExportedPublicKey> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return {
    kty: jwk.kty!,
    crv: jwk.crv!,
    x: jwk.x!,
    y: jwk.y!,
  };
}

/**
 * Imports a public key from JWK format.
 *
 * Used to import the other party's public key for deriving a shared secret.
 *
 * @param exported - The public key in JWK format
 * @returns A CryptoKey that can be used with {@link deriveSharedKey}
 *
 * @example
 * ```typescript
 * // Receive exported public key from other party
 * const theirPublicKey = await importPublicKey(receivedPublicKey);
 * const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);
 * ```
 */
export function importPublicKey(exported: ExportedPublicKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: exported.kty,
      crv: exported.crv,
      x: exported.x,
      y: exported.y,
    },
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    [],
  );
}

/**
 * Derives a shared AES-256-GCM key from ECDH key exchange.
 *
 * Both parties will derive the same shared key when using their own private key
 * and the other party's public key. This is the core of ECDH key agreement.
 *
 * @param privateKey - Your ECDH private key
 * @param publicKey - The other party's ECDH public key
 * @returns An AES-256-GCM key for encryption/decryption
 *
 * @example
 * ```typescript
 * // Both parties derive the same key
 * const sharedKeyA = await deriveSharedKey(privateKeyA, publicKeyB);
 * const sharedKeyB = await deriveSharedKey(privateKeyB, publicKeyA);
 * // sharedKeyA and sharedKeyB are equivalent
 * ```
 */
export function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable - needed for hashing
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts data using AES-256-GCM.
 *
 * The data is JSON serialized before encryption. A random 12-byte IV is
 * generated for each encryption operation.
 *
 * AES-GCM provides both confidentiality and authenticity - any tampering
 * with the ciphertext will cause decryption to fail.
 *
 * @param key - The AES-GCM key (from {@link deriveSharedKey})
 * @param data - The data to encrypt (will be JSON serialized)
 * @returns The encrypted payload with IV and ciphertext
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt(sharedKey, { action: 'transfer', amount: 100 });
 * // encrypted.iv and encrypted.ciphertext are base64 strings
 * ```
 */
export async function encrypt(key: CryptoKey, data: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(jsonStringify(data));

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

/**
 * Decrypts data using AES-256-GCM.
 *
 * The decrypted data is JSON parsed before returning.
 *
 * @typeParam T - The expected type of the decrypted data
 * @param key - The AES-GCM key (from {@link deriveSharedKey})
 * @param payload - The encrypted payload from {@link encrypt}
 * @returns The decrypted and parsed data
 *
 * @throws Error if decryption fails (wrong key or tampered ciphertext)
 *
 * @example
 * ```typescript
 * const decrypted = await decrypt<{ action: string; amount: number }>(sharedKey, encrypted);
 * console.log(decrypted.action); // 'transfer'
 * ```
 */
export async function decrypt<T = unknown>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const iv = base64ToArrayBuffer(payload.iv);
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded) as T;
}

/**
 * Converts ArrayBuffer to base64 string.
 * @internal
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts base64 string to ArrayBuffer.
 * @internal
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Emoji alphabet for visual verification of shared secrets.
 * 32 distinct, easily recognizable emojis for anti-spoofing verification.
 * @internal
 */
const EMOJI_ALPHABET = [
  '🔵',
  '🟢',
  '🔴',
  '🟡',
  '🟣',
  '🟠',
  '⚫',
  '⚪',
  '🌟',
  '🌙',
  '☀️',
  '🌈',
  '🔥',
  '💧',
  '🌸',
  '🍀',
  '🦋',
  '🐬',
  '🦊',
  '🐼',
  '🦁',
  '🐯',
  '🐸',
  '🦉',
  '🎵',
  '🎨',
  '🎯',
  '🎲',
  '🔔',
  '💎',
  '🔑',
  '🏆',
];

/**
 * Hashes a shared AES key to a hex string for verification.
 *
 * This extracts the raw key material and hashes it with SHA-256,
 * returning the first 16 bytes as a hex string.
 *
 * @param sharedKey - The AES-GCM shared key (must be extractable)
 * @returns A hex string representation of the hash
 *
 * @example
 * ```typescript
 * const hash = await hashSharedSecret(sharedKey);
 * const emoji = hashToEmoji(hash);
 * ```
 */
export async function hashSharedSecret(sharedKey: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', sharedKey);
  const hash = await crypto.subtle.digest('SHA-256', rawKey);
  const bytes = new Uint8Array(hash.slice(0, 16));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex hash to an emoji sequence for visual verification.
 *
 * This is used for anti-MITM verification - both the dApp and wallet
 * independently compute the same emoji sequence from the shared secret.
 * Users can visually compare the sequences to detect interception.
 *
 * Similar to SAS (Short Authentication String) in ZRTP/Signal.
 *
 * @param hash - Hex string from {@link hashSharedSecret}
 * @param length - Number of emojis to generate (default: 4)
 * @returns A string of emojis representing the hash
 *
 * @example
 * ```typescript
 * const hash = await hashSharedSecret(sharedKey);
 * const emoji = hashToEmoji(hash); // e.g., "🔵🦋🎯🐼"
 * // Display to user for verification
 * ```
 */
export function hashToEmoji(hash: string, length: number = 4): string {
  const bytes: number[] = [];
  for (let i = 0; i < hash.length && bytes.length < length; i += 2) {
    bytes.push(parseInt(hash.slice(i, i + 2), 16));
  }
  return bytes.map(b => EMOJI_ALPHABET[b % EMOJI_ALPHABET.length]).join('');
}
