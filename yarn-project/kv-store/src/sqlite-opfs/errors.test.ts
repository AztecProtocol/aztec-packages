import { describe, expect, it } from 'vitest';

import { isCorruptionMessage, isDecryptFailureMessage, isHeldFileError } from './errors.js';

/**
 * The two classifiers must stay disjoint: a decrypt failure (wrong/missing key)
 * is recoverable by re-keying, whereas a corrupt image is not. Mixing them would
 * make the worker mis-tag failures and consumers take the wrong recovery path.
 */
describe('sqlite-opfs error classification', () => {
  it('classifies SQLITE_CORRUPT / malformed-image messages as corruption', () => {
    expect(isCorruptionMessage('SQLITE_CORRUPT: sqlite3 result code 11: database disk image is malformed')).toBe(true);
    expect(isCorruptionMessage('database disk image is malformed')).toBe(true);
  });

  it('does not classify decrypt-failure messages as corruption', () => {
    expect(isCorruptionMessage('file is not a database')).toBe(false);
    expect(isCorruptionMessage('file is encrypted or is not a database')).toBe(false);
  });

  it('classifies sqlite3mc decrypt-failure messages as decrypt failures', () => {
    expect(isDecryptFailureMessage('file is not a database')).toBe(true);
    expect(isDecryptFailureMessage('file is encrypted or is not a database')).toBe(true);
  });

  it('does not classify corruption messages as decrypt failures', () => {
    expect(isDecryptFailureMessage('database disk image is malformed')).toBe(false);
    expect(isDecryptFailureMessage('SQLITE_CORRUPT: sqlite3 result code 11')).toBe(false);
  });

  it('classifies the WebKit and Chromium errors for a file another context holds open', () => {
    expect(isHeldFileError(new DOMException('The object is in an invalid state.', 'InvalidStateError'))).toBe(true);
    expect(isHeldFileError(new DOMException('Access Handles', 'NoModificationAllowedError'))).toBe(true);
  });

  it('does not classify other access handle failures as a held file', () => {
    expect(isHeldFileError(new DOMException('Failed to read at offset', 'InvalidStateError'))).toBe(false);
    expect(isHeldFileError(new DOMException('AccessHandle is closed', 'InvalidStateError'))).toBe(false);
    expect(isHeldFileError(new Error('The object is in an invalid state.'))).toBe(false);
  });
});
