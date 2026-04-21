/**
 * Value-level encryption for the SQLite-OPFS kv-store backend.
 *
 * The store stays in SQL-land for keys/containers/metadata so SQLite's indexes and
 * range queries keep working; only the `value` BLOB column passes through `encrypt`.
 * Multi-map dedup uses `digest` (a keyed HMAC in the real cipher, so an on-disk
 * observer can't brute-force low-entropy plaintexts from the hash column). For the
 * handful of PXE containers whose *keys* are also sensitive (nullifiers, watched
 * contract addresses, user aliases), `keyDigest` HMACs the key — destroying range
 * ordering, so only point lookups remain; those containers opt in via `opaqueKeys`.
 *
 * A null-object `IdentityCipher` implements the same interface with passthroughs so
 * "encryption off" is literally "plug in a different cipher" — no conditional code
 * in the container classes.
 *
 * ===========================================================================
 * Security considerations and known limitations (audit findings)
 * ===========================================================================
 *
 * Threat model: an attacker with read (and possibly write) access to the OPFS
 * files on disk, outside the browser origin. Not defended against: same-origin
 * XSS, running JS in the PXE context, or compromise of the live `CryptoKey`
 * handles in memory.
 *
 * --- What IS defended ---
 *
 * * **Value confidentiality**: AES-GCM-256 with a fresh IV per write. Ciphertext
 *   is non-deterministic — identical plaintexts produce different bytes on disk.
 * * **Dictionary attacks on the hash/key HMAC**: HMAC-SHA-256 with an HKDF-derived
 *   sub-key. The key never touches disk (unextractable `CryptoKey`), so an attacker
 *   cannot precompute HMAC(candidate) to test against stored digests.
 * * **Row-rebinding (F1)**: every ciphertext is bound to its SQL slot via AES-GCM
 *   AAD. Moving a ciphertext to a different slot breaks the auth tag on decrypt.
 * * **Key recovery from a weak-entropy source**: provided the caller supplies a
 *   strong master seed (see KeyProvider caveat below).
 *
 * --- Known limitations ---
 *
 * **F2 — Equivalence-class leak via deterministic digest.** Two rows with identical
 *   plaintext values produce identical `hash` column entries. A disk observer learns
 *   which rows are equal, even without knowing what. Combined with on-chain side
 *   channels, this can narrow plaintext candidates. Fundamental to multi-map dedup;
 *   callers storing low-cardinality values in a multi-map should be aware.
 *
 * **F3 — No forward secrecy / no key rotation.** Master compromise retroactively
 *   unseals all data. A key-rotation mechanism (re-encrypt on rotate) is a future
 *   enhancement.
 *
 * **F4 — `KeyProvider` gives no entropy discipline.** The interface is satisfiable
 *   by a trivially-weak provider (e.g., unsalted `sha256(passphrase)`). If a future
 *   `PassphraseKeyProvider` is added, it MUST use a memory-hard KDF (Argon2id /
 *   scrypt / PBKDF2 with high iterations + unique salt). Otherwise the HMAC columns
 *   become an offline dictionary oracle on the passphrase, bypassing the protection
 *   HMAC was meant to provide. `RawKeyProvider` with 32 random bytes is safe.
 *
 * **F5 — Row deletion is not detected.** An attacker with disk-write access can
 *   delete rows; decryption of remaining rows still works, but we don't notice
 *   missing ones. Consumers that care (e.g., the PXE note cache) already have
 *   chain-based resync paths, which paper over this.
 *
 * **F6 — Metadata leaks (accepted).** Row count per container (COUNT(*)), container
 *   names, OPFS file size, and modification timestamps are all visible on disk by
 *   design.
 *
 * **F7 — Phase-1 hash column format break.** This PR changes the `hash` column
 *   format (ohash-of-value → sha256/hmac of msgpack-packed-bytes). Multi-map dedup
 *   for pre-existing phase-1 rows will no longer match fresh inserts of the same
 *   pair — one extra row instead of dedup. Phase-1 DBs only live in developer
 *   setups; no production data is affected. Dropping and recreating dev DBs is
 *   the migration path.
 */

/** Implemented by cipher backends. The null implementation (`IdentityCipher`) stores
 *  bytes unchanged and is indistinguishable on-disk from phase-1 pre-encryption data. */
export interface ValueCipher {
  /** Encrypt a packed value. Non-deterministic: the real cipher draws a fresh IV each call.
   *
   *  `aad` (Additional Authenticated Data) is not stored in the ciphertext but is
   *  cryptographically bound to it — `decrypt` must be called with identical AAD or
   *  the auth tag fails. Containers pass the row's `slot` as AAD so that moving a
   *  ciphertext to a different row (a row-rebinding attack) is detected. */
  encrypt(plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;

  /** Decrypt a previously-encrypted value. Throws on auth-tag failure or framing errors.
   *  `aad` must match what was passed at encrypt time. */
  decrypt(ciphertext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;

  /** Deterministic tag used by multi-map for hash-dedup. Same plaintext → same tag.
   *  Real ciphers use HMAC so the tag is unguessable without the key. Returned as
   *  base64 to fit the existing TEXT column. */
  digest(plaintext: Uint8Array): Promise<string>;

  /** Deterministic HMAC of an already-encoded key, for opaque-keys containers.
   *  Returned as raw bytes (stored in the existing `key BLOB` column). The identity
   *  cipher refuses this call — opaque-keys mode requires a real cipher. */
  keyDigest(encodedKey: Uint8Array): Promise<Uint8Array>;

  /** True for the null cipher. Lets the store fail fast when a caller requests
   *  `opaqueKeys: true` on an unencrypted store. */
  readonly isNullCipher: boolean;
}

/** Supplies the master keying material from which the cipher derives its sub-keys.
 *  Kept as a separate abstraction so future key sources (IndexedDB unextractable,
 *  WebAuthn PRF, passphrase-derived) slot in without changing the cipher. */
export interface KeyProvider {
  /** Return an HKDF-imported `CryptoKey` usable for `deriveKey`. Called once at
   *  cipher construction time. */
  getMasterKey(): Promise<CryptoKey>;
}

/** Simplest key source: 32 bytes, provided directly. Suitable for tests and for
 *  programmatic use where the caller manages the seed's lifetime. Not for
 *  persistent production use — those want `IndexedDBKeyProvider` (future). */
export class RawKeyProvider implements KeyProvider {
  readonly #seed: Uint8Array;

  constructor(seed: Uint8Array) {
    if (seed.byteLength !== 32) {
      throw new Error(`RawKeyProvider: seed must be 32 bytes, got ${seed.byteLength}`);
    }
    this.#seed = new Uint8Array(seed);
  }

  getMasterKey(): Promise<CryptoKey> {
    return globalThis.crypto.subtle.importKey('raw', this.#seed as BufferSource, { name: 'HKDF' }, false, [
      'deriveKey',
    ]);
  }
}

const CIPHER_VERSION_AES_GCM = 0x01;
const IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

const HKDF_INFO_ENC = 'aztec-kv/enc/v1';
const HKDF_INFO_VALUE_HMAC = 'aztec-kv/value-hmac/v1';
const HKDF_INFO_KEY_HMAC = 'aztec-kv/key-hmac/v1';

const textEncoder = new TextEncoder();
// HKDF with a constant empty salt is the standard pattern when `info` already
// provides domain separation. Explicit ArrayBuffer backing keeps TS happy about
// the BufferSource-with-SharedArrayBuffer distinction in lib.dom.d.ts.
const EMPTY_SALT = new Uint8Array(new ArrayBuffer(0));

/** Passthrough cipher — use when encryption is disabled. Keeps on-disk format
 *  byte-compatible with phase-1 plaintext data so existing DBs open unchanged. */
export class IdentityCipher implements ValueCipher {
  readonly isNullCipher = true;

  encrypt(plaintext: Uint8Array, _aad?: Uint8Array): Promise<Uint8Array> {
    // IdentityCipher ignores AAD — there's no auth tag to bind it to. Callers that
    // care about row-binding integrity must use a real cipher.
    return Promise.resolve(plaintext);
  }

  decrypt(ciphertext: Uint8Array, _aad?: Uint8Array): Promise<Uint8Array> {
    return Promise.resolve(ciphertext);
  }

  async digest(plaintext: Uint8Array): Promise<string> {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', plaintext as BufferSource);
    return bytesToBase64(new Uint8Array(buf));
  }

  keyDigest(_encodedKey: Uint8Array): Promise<Uint8Array> {
    return Promise.reject(new Error('IdentityCipher does not support opaque-keys containers; provide a real cipher'));
  }
}

/** AES-GCM-256 for values, HMAC-SHA-256 for deterministic digests. Three sub-keys
 *  are derived from the master via HKDF-SHA-256 with distinct `info` strings: one
 *  for AES, one for value-HMAC (multi-map dedup), one for key-HMAC (opaque keys).
 *  Separate sub-keys give cross-context independence — a collision/weakness in one
 *  purpose cannot leak into another. */
export class AesGcmCipher implements ValueCipher {
  readonly isNullCipher = false;

  readonly #encKey: CryptoKey;
  readonly #valueHmacKey: CryptoKey;
  readonly #keyHmacKey: CryptoKey;

  private constructor(encKey: CryptoKey, valueHmacKey: CryptoKey, keyHmacKey: CryptoKey) {
    this.#encKey = encKey;
    this.#valueHmacKey = valueHmacKey;
    this.#keyHmacKey = keyHmacKey;
  }

  static async create(provider: KeyProvider): Promise<AesGcmCipher> {
    const master = await provider.getMasterKey();
    const [encKey, valueHmacKey, keyHmacKey] = await Promise.all([
      deriveAesKey(master, HKDF_INFO_ENC),
      deriveHmacKey(master, HKDF_INFO_VALUE_HMAC),
      deriveHmacKey(master, HKDF_INFO_KEY_HMAC),
    ]);
    return new AesGcmCipher(encKey, valueHmacKey, keyHmacKey);
  }

  /** Frame: [0x01][IV(12)][AES-GCM ciphertext + 16-byte auth tag]. AAD (when
   *  provided) is bound by AES-GCM's auth tag but not written to disk — callers
   *  must supply the same AAD on decrypt. */
  async encrypt(plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const params: AesGcmParams = { name: 'AES-GCM', iv };
    if (aad !== undefined) {
      params.additionalData = aad as BufferSource;
    }
    const ctBuf = await globalThis.crypto.subtle.encrypt(params, this.#encKey, plaintext as BufferSource);
    const ct = new Uint8Array(ctBuf);
    const out = new Uint8Array(1 + IV_BYTES + ct.byteLength);
    out[0] = CIPHER_VERSION_AES_GCM;
    out.set(iv, 1);
    out.set(ct, 1 + IV_BYTES);
    return out;
  }

  async decrypt(framed: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    if (framed.byteLength < 1 + IV_BYTES + AES_GCM_TAG_BYTES) {
      throw new Error('AesGcmCipher: ciphertext too short to contain version + IV + auth tag');
    }
    if (framed[0] !== CIPHER_VERSION_AES_GCM) {
      throw new Error(`AesGcmCipher: unexpected version byte 0x${framed[0].toString(16).padStart(2, '0')}`);
    }
    const iv = framed.subarray(1, 1 + IV_BYTES);
    const ct = framed.subarray(1 + IV_BYTES);
    const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
    if (aad !== undefined) {
      params.additionalData = aad as BufferSource;
    }
    const ptBuf = await globalThis.crypto.subtle.decrypt(params, this.#encKey, ct as BufferSource);
    return new Uint8Array(ptBuf);
  }

  async digest(plaintext: Uint8Array): Promise<string> {
    const sig = await globalThis.crypto.subtle.sign('HMAC', this.#valueHmacKey, plaintext as BufferSource);
    return bytesToBase64(new Uint8Array(sig));
  }

  async keyDigest(encodedKey: Uint8Array): Promise<Uint8Array> {
    const sig = await globalThis.crypto.subtle.sign('HMAC', this.#keyHmacKey, encodedKey as BufferSource);
    return new Uint8Array(sig);
  }
}

function deriveAesKey(master: CryptoKey, info: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY_SALT, info: textEncoder.encode(info) },
    master,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function deriveHmacKey(master: CryptoKey, info: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY_SALT, info: textEncoder.encode(info) },
    master,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s);
}
