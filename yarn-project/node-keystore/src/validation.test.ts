/**
 * Tests for keystore duplication check logic and validation integration
 */
import { createLogger } from '@aztec/foundation/log';

import { describe, expect, it } from '@jest/globals';

import { KeyStoreLoadError, mergeKeystores } from './loader.js';
import type { KeyStore } from './types.js';

// Enable logger output in tests by setting LOG_LEVEL
const logger = createLogger('node-keystore:validation-test');

describe('Keystore Duplication Validation', () => {
  it('should reject duplicate attester addresses across keystores', () => {
    logger.info('Testing duplicate attester validation');

    const keystore1: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890' as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    const keystore2: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890' as any, // Duplicate!
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(/Duplicate attester address/);
  });

  it('should reject multiple prover configurations across keystores', () => {
    logger.info('Testing multiple prover validation');

    const keystore1: KeyStore = {
      schemaVersion: 1,
      prover: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
    };

    const keystore2: KeyStore = {
      schemaVersion: 1,
      prover: '0x9999999999999999999999999999999999999999999999999999999999999999' as any,
    };

    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(/Multiple prover configurations found/);
  });

  it('should allow unique attester addresses across keystores', () => {
    logger.info('Testing unique attester addresses');

    const keystore1: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x1111111111111111111111111111111111111111' as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    const keystore2: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x2222222222222222222222222222222222222222' as any, // Different!
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    expect(() => mergeKeystores([keystore1, keystore2])).not.toThrow();

    const merged = mergeKeystores([keystore1, keystore2]);
    logger.info('Successfully merged keystores with unique attesters');
    expect(merged.validators).toHaveLength(2);
  });
});
