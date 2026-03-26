/**
 * Cryptographic utilities for secure wallet communication.
 *
 * This module provides ECDH key exchange and AES-GCM encryption primitives
 * for establishing secure communication channels between dApps and wallet extensions.
 *
 * ## Security Model
 *
 * The crypto flow uses HKDF for key derivation with domain separation:
 *
 * 1. Both parties generate ECDH key pairs using {@link generateKeyPair}
 * 2. Public keys are exchanged (exported via {@link exportPublicKey}, imported via {@link importPublicKey})
 * 3. Both parties derive keys using {@link deriveSessionKeys}:
 *    - ECDH produces raw shared secret
 *    - HKDF expands the secret into 512 bits using concatenated public keys as salt
 *    - The 512 bits are split: first 256 bits for AES-GCM, second 256 bits for HMAC
 * 4. Fingerprint is computed as HMAC(HMAC_KEY, "aztec-wallet-verification-verificationHash")
 * 5. Messages are encrypted/decrypted using {@link encrypt} and {@link decrypt}
 *
 * This design ensures:
 * - The encryption key is never exposed (verificationHash uses separate HMAC key)
 * - Public keys are bound to the derived keys via HKDF salt
 * - Single HKDF derivation with domain-separated output splitting
 *
 * ## Curve Choice
 *
 * We use P-256 (secp256r1) because it's the only ECDH curve with broad Web Crypto API
 * support across all browsers. X25519 would be preferable for its simplicity and
 * resistance to implementation errors, but it lacks universal browser support.
 *
 * @example
 * ```typescript
 * // Party A (dApp)
 * const keyPairA = await generateKeyPair();
 * const publicKeyA = await exportPublicKey(keyPairA.publicKey);
 *
 * // Party B (wallet)
 * const keyPairB = await generateKeyPair();
 * const publicKeyB = await exportPublicKey(keyPairB.publicKey);
 *
 * // Exchange public keys, then derive session keys
 * // App side: isApp = true
 * const importedB = await importPublicKey(publicKeyB);
 * const sessionA = await deriveSessionKeys(keyPairA, importedB, true);
 *
 * // Wallet side: isApp = false
 * const importedA = await importPublicKey(publicKeyA);
 * const sessionB = await deriveSessionKeys(keyPairB, importedA, false);
 *
 * // Both parties compute the same verificationHash for verification
 * const verificationHashA = sessionA.verificationHash;
 * const emojiA = hashToEmoji(verificationHashA);
 *
 * // Encrypt and decrypt
 * const encrypted = await encrypt(sessionA.encryptionKey, JSON.stringify({ message: 'hello' }));
 * const decrypted = await decrypt(sessionB.encryptionKey, encrypted);
 * ```
 *
 * @packageDocumentation
 */
import { EMOJI_ALPHABET, EMOJI_ALPHABET_SIZE } from './emoji_alphabet.js';

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
 * Session keys derived from ECDH key exchange.
 *
 * Contains both the encryption key and the verification hash (verificationHash)
 * computed from a separate HMAC key.
 */
export interface SessionKeys {
  /** AES-256-GCM key for message encryption/decryption */
  encryptionKey: CryptoKey;
  /** Hex-encoded verificationHash for verification */
  verificationHash: string;
}

/** P-256 coordinate size in bytes */
const P256_COORDINATE_SIZE = 32;

// HKDF info string for key derivation
const HKDF_INFO = new TextEncoder().encode('Aztec Wallet DAPP Key derivation');
const FINGERPRINT_DATA = new TextEncoder().encode('aztec-wallet-verification-verificationHash');

/**
 * Generates an ECDH P-256 key pair for key exchange.
 *
 * The generated key pair can be used to derive session keys with another
 * party's public key using {@link deriveSessionKeys}.
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
    true, // extractable (needed to export public key and derive bits)
    ['deriveBits'],
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
 * Used to import the other party's public key for deriving session keys.
 *
 * @param exported - The public key in JWK format
 * @returns A CryptoKey that can be used with {@link deriveSessionKeys}
 *
 * @example
 * ```typescript
 * // App side: receive wallet's public key and derive session
 * const walletPublicKey = await importPublicKey(receivedWalletKey);
 * const session = await deriveSessionKeys(appKeyPair, walletPublicKey, true);
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
    true, // extractable - needed for deriveSessionKeys to export for salt. Safe for public keys.
    [],
  );
}

/**
 * Decodes a base64url-encoded coordinate to fixed-size bytes.
 *
 * For P-256, coordinates are always 32 bytes. This function ensures
 * consistent serialization regardless of leading zeros.
 *
 * @param base64url - Base64url-encoded coordinate
 * @param size - Expected size in bytes (32 for P-256)
 * @returns Fixed-size Uint8Array, left-padded with zeros if needed
 */
function decodeCoordinateFixedSize(base64url: string, size: number): Uint8Array {
  const decoded = base64UrlToBytes(base64url);
  if (decoded.length === size) {
    return decoded;
  }
  if (decoded.length > size) {
    throw new Error(`Invalid P-256 coordinate: expected ${size} bytes, got ${decoded.length}`);
  }
  // Left-pad with zeros
  const padded = new Uint8Array(size);
  padded.set(decoded, size - decoded.length);
  return padded;
}

/**
 * Creates HKDF salt from public keys with fixed ordering by party role.
 *
 * The app's public key always comes first, followed by the wallet's public key.
 * This ensures both parties produce the same salt.
 *
 * @param appKey - The app's public key in exported format
 * @param walletKey - The wallet's public key in exported format
 * @returns Concatenated bytes: app_x || app_y || wallet_x || wallet_y (128 bytes for P-256)
 */
function createSaltFromPublicKeys(appKey: ExportedPublicKey, walletKey: ExportedPublicKey): ArrayBuffer {
  // Fixed ordering: app first, then wallet
  // Each coordinate is fixed at 32 bytes for P-256
  const appX = decodeCoordinateFixedSize(appKey.x, P256_COORDINATE_SIZE);
  const appY = decodeCoordinateFixedSize(appKey.y, P256_COORDINATE_SIZE);
  const walletX = decodeCoordinateFixedSize(walletKey.x, P256_COORDINATE_SIZE);
  const walletY = decodeCoordinateFixedSize(walletKey.y, P256_COORDINATE_SIZE);

  // Total: 4 * 32 = 128 bytes
  const salt = new Uint8Array(4 * P256_COORDINATE_SIZE);
  salt.set(appX, 0);
  salt.set(appY, P256_COORDINATE_SIZE);
  salt.set(walletX, 2 * P256_COORDINATE_SIZE);
  salt.set(walletY, 3 * P256_COORDINATE_SIZE);

  return salt.buffer as ArrayBuffer;
}

/**
 * Derives session keys from ECDH key exchange using HKDF.
 *
 * This is the main key derivation function that produces:
 * 1. An AES-256-GCM encryption key (first 256 bits)
 * 2. An HMAC key for verificationHash computation (second 256 bits)
 * 3. A verificationHash computed as HMAC(hmacKey, "aztec-wallet-verification-verificationHash")
 *
 * The keys are derived using a single HKDF call that produces 512 bits,
 * then split into the two keys.
 *
 * @param ownKeyPair - The caller's ECDH key pair (private for ECDH, public for salt)
 * @param peerPublicKey - The peer's ECDH public key (for ECDH and salt)
 * @param isApp - true if caller is the app, false if caller is the wallet
 * @returns Session keys containing encryption key and verificationHash
 *
 * @example
 * ```typescript
 * // App side
 * const sessionA = await deriveSessionKeys(appKeyPair, walletPublicKey, true);
 * // Wallet side
 * const sessionB = await deriveSessionKeys(walletKeyPair, appPublicKey, false);
 * // sessionA.verificationHash === sessionB.verificationHash
 * ```
 */
export async function deriveSessionKeys(
  ownKeyPair: SecureKeyPair,
  peerPublicKey: CryptoKey,
  isApp: boolean,
): Promise<SessionKeys> {
  // Step 1: ECDH to get raw shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    ownKeyPair.privateKey,
    256,
  );

  // Step 2: Import shared secret as HKDF key material
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecretBits, { name: 'HKDF' }, false, ['deriveBits']);

  // Step 3: Export public keys and create salt (app first, wallet second)
  const ownExportedKey = await exportPublicKey(ownKeyPair.publicKey);
  const peerExportedKey = await exportPublicKey(peerPublicKey);
  const appPublicKey = isApp ? ownExportedKey : peerExportedKey;
  const walletPublicKey = isApp ? peerExportedKey : ownExportedKey;
  const salt = createSaltFromPublicKeys(appPublicKey, walletPublicKey);

  // Step 4: Derive 512 bits in a single HKDF call
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: HKDF_INFO,
    },
    hkdfKey,
    512, // 256 bits for GCM + 256 bits for HMAC
  );

  // Step 5: Split into GCM key (first 256 bits) and HMAC key (second 256 bits)
  const gcmKeyBits = derivedBits.slice(0, 32);
  const hmacKeyBits = derivedBits.slice(32, 64);

  // Step 6: Import GCM key
  const encryptionKey = await crypto.subtle.importKey('raw', gcmKeyBits, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  // Step 7: Import HMAC key
  const hmacKey = await crypto.subtle.importKey('raw', hmacKeyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Step 8: Compute verificationHash as HMAC of fixed string
  const verificationHashBytes = await crypto.subtle.sign('HMAC', hmacKey, FINGERPRINT_DATA);

  // Convert to hex string
  const verificationHash = arrayBufferToHex(verificationHashBytes);

  return {
    encryptionKey,
    verificationHash,
  };
}

/**
 * Encrypts data using AES-256-GCM.
 *
 * A random 12-byte IV is generated for each encryption operation.
 *
 * AES-GCM provides both confidentiality and authenticity - any tampering
 * with the ciphertext will cause decryption to fail.
 *
 * @param key - The AES-GCM key (from {@link deriveSessionKeys})
 * @param data - The string data to encrypt (caller is responsible for serialization)
 * @returns The encrypted payload with IV and ciphertext
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt(session.encryptionKey, JSON.stringify({ action: 'transfer', amount: 100 }));
 * // encrypted.iv and encrypted.ciphertext are base64 strings
 * ```
 */
export async function encrypt(key: CryptoKey, data: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

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
 * @param key - The AES-GCM key (from {@link deriveSessionKeys})
 * @param payload - The encrypted payload from {@link encrypt}
 * @returns The decrypted and parsed data
 *
 * @throws Error if decryption fails (wrong key or tampered ciphertext)
 *
 * @example
 * ```typescript
 * const decrypted = await decrypt<{ action: string; amount: number }>(session.encryptionKey, encrypted);
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
 * Converts base64url string to Uint8Array.
 * @internal
 */
function base64UrlToBytes(base64url: string): Uint8Array {
  // Convert base64url to base64
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts ArrayBuffer to hex string.
 * @internal
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Default grid size for emoji verification display.
 * 3x3 grid = 9 emojis = 72 bits of security.
 */
export const DEFAULT_EMOJI_GRID_SIZE = 9;

/**
 * Converts a hex hash to an emoji sequence for visual verification.
 *
 * This is used for verification - both the dApp and wallet
 * independently compute the same emoji sequence from the derived keys.
 * Users can visually compare the sequences to detect interception.
 *
 * With a 256-emoji alphabet and 9 emojis (3x3 grid), this provides
 * 72 bits of security (9 * 8 = 72 bits), making brute-force attacks
 * computationally infeasible.
 *
 * @param hash - Hex string from verification hash (64 chars = 32 bytes)
 * @param count - Number of emojis to generate (default: 9 for 3x3 grid)
 * @returns A string of emojis representing the hash
 *
 * @example
 * ```typescript
 * const session = await deriveSessionKeys(...);
 * const emoji = hashToEmoji(session.verificationHash); // e.g., "🔵🦋🎯🐼🌟🎲🦊🐸💎"
 * // Display as 3x3 grid to user for verification
 * ```
 */
export function hashToEmoji(hash: string, count: number = DEFAULT_EMOJI_GRID_SIZE): string {
  const emojis: string[] = [];
  for (let i = 0; i < hash.length && emojis.length < count; i += 2) {
    const byteValue = parseInt(hash.slice(i, i + 2), 16);
    emojis.push(EMOJI_ALPHABET[byteValue % EMOJI_ALPHABET_SIZE]);
  }
  return emojis.join('');
}

// ─── Passphrase-based encryption (PBKDF2 + AES-256-GCM) ───────────────────

/** Default PBKDF2 iteration count. High to compensate for short PINs (~1-2s on modern hardware). */
const DEFAULT_PBKDF2_ITERATIONS = 2_000_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_IV_BYTES = 12;

/**
 * Derives an AES-256-GCM key from a passphrase using PBKDF2-SHA256.
 *
 * @param passphrase - The user-provided passphrase or PIN
 * @param salt - Random salt bytes
 * @param iterations - PBKDF2 iteration count (default: 2,000,000)
 * @returns An AES-256-GCM CryptoKey
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts arbitrary bytes with a passphrase using PBKDF2 + AES-256-GCM.
 *
 * Output layout: `[salt (16)] [iv (12)] [ciphertext (...)]`
 *
 * @param plaintext - Data to encrypt
 * @param passphrase - User passphrase or PIN
 * @param iterations - PBKDF2 iteration count (default: 2,000,000)
 * @returns A Uint8Array containing salt + iv + ciphertext
 */
export async function encryptWithPassphrase(
  plaintext: Uint8Array,
  passphrase: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(PBKDF2_IV_BYTES));
  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource),
  );
  const result = new Uint8Array(PBKDF2_SALT_BYTES + PBKDF2_IV_BYTES + ciphertext.length);
  result.set(salt, 0);
  result.set(iv, PBKDF2_SALT_BYTES);
  result.set(ciphertext, PBKDF2_SALT_BYTES + PBKDF2_IV_BYTES);
  return result;
}

/**
 * Decrypts data produced by {@link encryptWithPassphrase}.
 *
 * @param data - The encrypted blob (salt + iv + ciphertext)
 * @param passphrase - The passphrase used during encryption
 * @param iterations - PBKDF2 iteration count (must match encryption)
 * @returns The decrypted plaintext bytes
 * @throws On wrong passphrase (AES-GCM auth tag mismatch)
 */
export async function decryptWithPassphrase(
  data: Uint8Array,
  passphrase: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  const salt = data.slice(0, PBKDF2_SALT_BYTES);
  const iv = data.slice(PBKDF2_SALT_BYTES, PBKDF2_SALT_BYTES + PBKDF2_IV_BYTES);
  const ciphertext = data.slice(PBKDF2_SALT_BYTES + PBKDF2_IV_BYTES);
  const key = await deriveKeyFromPassphrase(passphrase, salt, iterations);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource));
}

/**
 * Converts a Uint8Array to a base64 string.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to a Uint8Array.
 */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
