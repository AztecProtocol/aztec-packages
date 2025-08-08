/**
 * Tests for account resolution functionality
 */
import { createLogger } from '@aztec/foundation/log';

import { describe, expect, it } from '@jest/globals';

import { AccountResolutionError, AccountResolver } from './resolver.js';
import type { KeyStore } from './types.js';

const logger = createLogger('node-keystore:resolver-test');

describe('AccountResolver', () => {
  let resolver: AccountResolver;

  beforeEach(() => {
    resolver = new AccountResolver();
  });

  describe('resolveKeyStore', () => {
    it('should throw for empty keystore', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
      };

      // This should be validated by Zod schema before reaching resolver
      // but testing error handling
      await expect(resolver.resolveKeyStore(keystore)).rejects.toThrow();
    });

    it('should handle keystore with validators (not yet implemented)', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890' as any,
            feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
          },
        ],
      };

      // Since implementation is not complete, this should throw
      await expect(resolver.resolveKeyStore(keystore)).rejects.toThrow(AccountResolutionError);
    });

    it('should handle keystore with simple prover (not yet implemented)', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
      };

      // Since implementation is not complete, this should throw
      await expect(resolver.resolveKeyStore(keystore)).rejects.toThrow(AccountResolutionError);
    });
  });

  describe('type guards', () => {
    it('should correctly identify private keys', () => {
      // Access private methods for testing (not ideal but for skeleton testing)
      const privateResolver = resolver as any;

      expect(privateResolver.isPrivateKey('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(
        true,
      );
      expect(privateResolver.isPrivateKey('0x1234567890123456789012345678901234567890')).toBe(false); // too short
      expect(privateResolver.isPrivateKey('invalid')).toBe(false);
    });

    it('should correctly identify JSON keystore files', () => {
      const privateResolver = resolver as any;

      expect(privateResolver.isJsonKeyFile({ path: '/path/to/keystore.json', password: 'secret' })).toBe(true);
      expect(privateResolver.isJsonKeyFile({ path: '/path/to/keystore.json' })).toBe(true);
      expect(privateResolver.isJsonKeyFile({ address: '0x1234567890123456789012345678901234567890' })).toBe(false);
    });

    it('should correctly identify remote signer accounts', () => {
      const privateResolver = resolver as any;

      // Address string
      expect(privateResolver.isRemoteSignerAccount('0x1234567890123456789012345678901234567890')).toBe(true);
      // Private key should not be identified as remote signer
      expect(
        privateResolver.isRemoteSignerAccount('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
      ).toBe(false);
      // Remote signer object
      expect(privateResolver.isRemoteSignerAccount({ address: '0x1234567890123456789012345678901234567890' })).toBe(
        true,
      );
    });

    it('should correctly identify mnemonic configs', () => {
      const privateResolver = resolver as any;

      expect(privateResolver.isMnemonicConfig({ mnemonic: 'test phrase' })).toBe(true);
      expect(privateResolver.isMnemonicConfig({ mnemonic: 'test phrase', addressIndex: 0 })).toBe(true);
      expect(privateResolver.isMnemonicConfig({ address: '0x1234567890123456789012345678901234567890' })).toBe(false);
    });
  });

  describe('resolver options', () => {
    it('should accept custom options', () => {
      const customResolver = new AccountResolver({
        defaultRemoteSigner: 'https://custom-signer.example.com',
        validateAddresses: false,
        mnemonicDerivationPrefix: "m/44'/60'/1'/0",
      });

      expect(customResolver).toBeInstanceOf(AccountResolver);
    });

    it('should handle remote signer configuration merging', () => {
      const resolverWithDefaults = new AccountResolver({
        defaultRemoteSigner: {
          remoteSignerUrl: 'https://default-signer.example.com',
          certPath: '/default/cert.pem',
        },
      });

      expect(resolverWithDefaults).toBeInstanceOf(AccountResolver);
    });
  });
});
