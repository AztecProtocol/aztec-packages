/**
 * Typed error surface for sqlite3mc-backed page-level encryption failures.
 *
 * Three concrete failure modes are surfaced:
 *
 *   - `invalid_key_length`: caller-side pre-flight (key not 32 bytes).
 *   - `encryption_not_supported_for_ephemeral`: caller-side pre-flight (encryption
 *     was requested on an ephemeral `:memory:` store, which sqlite3mc does not
 *     support).
 *   - `decrypt_failed`: runtime failure raised when sqlite3mc cannot decode page 1
 *     of an existing database. Covers both "wrong key supplied" and "no key
 *     supplied to an encrypted DB"; sqlite3mc does not distinguish them on the
 *     wire, so neither do we. If a future sqlite3mc release exposes finer-grained
 *     codes, splitting `decrypt_failed` is a non-breaking change: existing
 *     consumers matching `'decrypt_failed'` keep working, new consumers can match
 *     finer codes.
 */
export type SqliteEncryptionErrorCode =
  | 'invalid_key_length'
  | 'encryption_not_supported_for_ephemeral'
  | 'decrypt_failed';

/**
 * Error thrown by sqlite-opfs when an encryption operation fails. Replaces the
 * previous pattern of consumers having to string-match sqlite3mc's "file is not
 * a database" family of messages — match on `code` instead.
 */
export class SqliteEncryptionError extends Error {
  readonly code: SqliteEncryptionErrorCode;

  constructor(code: SqliteEncryptionErrorCode, message: string, opts?: { cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SqliteEncryptionError';
    this.code = code;
  }
}

/**
 * Strings raised by sqlite3mc when page 1 cannot be decoded. Pinned by tests in
 * encrypted_store.test.ts — if a future sqlite3mc bump changes them, those
 * tests fail loudly rather than letting decrypt failures silently regress to a
 * generic `Error`.
 */
const SQLITE3MC_DECRYPT_ERROR_PATTERNS: readonly RegExp[] = [
  /file is not a database/i,
  /file is encrypted or is not a database/i,
];

/**
 * Returns `true` if `message` matches one of the known sqlite3mc decrypt-failure
 * strings. Used by the SQLite worker to tag err responses so the main thread can
 * re-hydrate them as {@link SqliteEncryptionError} with code `'decrypt_failed'`.
 */
export function isDecryptFailureMessage(message: string): boolean {
  return SQLITE3MC_DECRYPT_ERROR_PATTERNS.some(p => p.test(message));
}
