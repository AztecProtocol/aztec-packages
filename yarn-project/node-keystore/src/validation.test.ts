/**
 * Tests for keystore validation functionality
 */
import { describe, expect, it } from '@jest/globals';

import type { KeyStore } from './types.js';
import {
  KeyStoreValidationError,
  isValidAztecAddress,
  isValidEthAddress,
  isValidPrivateKey,
  isValidUrl,
  validateKeyStore,
} from './validation.js';

describe('Keystore Validation', () => {
  describe('Helper validators', () => {
    it('should validate private keys correctly', () => {
      expect(isValidPrivateKey('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(true);
      expect(isValidPrivateKey('0x123')).toBe(false);
      expect(isValidPrivateKey('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(false);
      expect(isValidPrivateKey('')).toBe(false);
    });

    it('should validate Ethereum addresses correctly', () => {
      expect(isValidEthAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidEthAddress('0x123')).toBe(false);
      expect(isValidEthAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidEthAddress('')).toBe(false);
    });

    it('should validate Aztec addresses correctly', () => {
      expect(isValidAztecAddress('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(true);
      expect(isValidAztecAddress('0x123')).toBe(false);
      expect(isValidAztecAddress('')).toBe(false);
    });

    it('should validate URLs correctly', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:8080')).toBe(true);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('Keystore validation', () => {
    it('should validate a simple validator keystore', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).not.toThrow();
    });

    it('should validate a keystore with mnemonic configuration', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              mnemonic: 'test test test test test test test test test test test junk',
              addressIndex: 0,
              addressCount: 2,
            },
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).not.toThrow();
    });

    it('should validate a keystore with remote signer', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: 'https://signer.example.com',
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890',
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).not.toThrow();
    });

    it('should validate a keystore with prover configuration', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: {
          id: '0x1234567890123456789012345678901234567890',
          publisher: ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'],
        },
      };

      expect(() => validateKeyStore(keystore)).not.toThrow();
    });

    it('should reject keystore with invalid schema version', () => {
      const keystore = {
        schemaVersion: 2, // Invalid
        validators: [
          {
            attester: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).toThrow(KeyStoreValidationError);
    });

    it('should reject keystore without validators or prover', () => {
      const keystore = {
        schemaVersion: 1,
      };

      expect(() => validateKeyStore(keystore)).toThrow(KeyStoreValidationError);
    });

    it('should reject validator without required fields', () => {
      const keystore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            // Missing feeRecipient
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).toThrow(KeyStoreValidationError);
    });

    it('should reject validator with invalid addresses', () => {
      const keystore = {
        schemaVersion: 1,
        validators: [
          {
            attester: 'invalid-key',
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          },
        ],
      };

      expect(() => validateKeyStore(keystore)).toThrow(KeyStoreValidationError);
    });
  });
});
