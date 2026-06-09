/**
 * Typed error surface for sqlite3mc-backed page-level encryption failures.
 *
 * Three concrete failure modes are surfaced:
 *
 *   - `invalid_key_length`: caller-side pre-flight (key not 32 bytes).
 *   - `encryption_not_supported_for_ephemeral`: caller-side pre-flight (encryption was requested on an ephemeral
 *     `:memory:` store, which sqlite3mc does not support).
 *   - `decrypt_failed`: runtime failure raised when sqlite3mc cannot decode page 1 of an existing database. Covers
 *     both "wrong key supplied" and "no key supplied to an encrypted DB".
 */
export type SqliteEncryptionErrorCode =
  | 'invalid_key_length'
  | 'encryption_not_supported_for_ephemeral'
  | 'decrypt_failed';

/**
 * Error thrown by sqlite-opfs when an encryption operation fails.
 **/
export class SqliteEncryptionError extends Error {
  readonly code: SqliteEncryptionErrorCode;

  constructor(code: SqliteEncryptionErrorCode, message: string, opts?: { cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'SqliteEncryptionError';
    this.code = code;
  }
}

/**
 * Strings raised by sqlite3mc when page 1 cannot be decoded.
 **/
const SQLITE3MC_DECRYPT_ERROR_PATTERNS: readonly RegExp[] = [
  /file is not a database/i,
  /file is encrypted or is not a database/i,
];

/**
 * Returns `true` if `message` matches one of the known sqlite3mc decrypt-failure
 * strings.
 **/
export function isDecryptFailureMessage(message: string): boolean {
  return SQLITE3MC_DECRYPT_ERROR_PATTERNS.some(p => p.test(message));
}
