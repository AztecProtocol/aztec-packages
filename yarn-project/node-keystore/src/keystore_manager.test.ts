/**
 * Tests for KeystoreManager
 */
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';

import { describe, expect, it } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { KeystoreError, KeystoreManager } from '../src/keystore_manager.js';
import type { KeyStore } from '../src/types.js';

describe('KeystoreManager', () => {
  describe('constructor and basic operations', () => {
    it('should create manager with simple validator keystore', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      expect(() => new KeystoreManager(keystore)).not.toThrow();
    });

    it('should get validator count', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
          {
            attester: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      expect(manager.getValidatorCount()).toBe(2);
    });

    it('should get validator by index', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const validator = manager.getValidator(0);

      expect(validator.attester).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
      expect(validator.feeRecipient).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
    });

    it('should throw for out of bounds validator index', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);

      expect(() => manager.getValidator(1)).toThrow(KeystoreError);
      expect(() => manager.getValidator(1)).toThrow('out of bounds');
    });

    it('should get fee recipient', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1111111111111111111111111111111111111111111111111111111111111111' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const feeRecipient = manager.getFeeRecipient(0);

      expect(feeRecipient).toBe('0x1111111111111111111111111111111111111111111111111111111111111111');
    });
  });

  describe('signer creation', () => {
    it('should create attester signers from private key', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(signers).toHaveLength(1);
      expect(signers[0].address.toString()).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should create multiple signers from mnemonic', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              mnemonic: 'test test test test test test test test test test test junk',
              addressCount: 2,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(signers).toHaveLength(2);
      expect(signers[0].address.toString()).not.toBe(signers[1].address.toString());
    });

    it('should create publisher signers (fallback to attester)', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const attesterSigners = manager.createAttesterSigners(0);
      const publisherSigners = manager.createPublisherSigners(0);

      expect(publisherSigners).toHaveLength(1);
      expect(publisherSigners[0].address.toString()).toBe(attesterSigners[0].address.toString());
    });

    it('should create separate publisher signers when specified', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            publisher: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const attesterSigners = manager.createAttesterSigners(0);
      const publisherSigners = manager.createPublisherSigners(0);

      expect(publisherSigners).toHaveLength(1);
      expect(publisherSigners[0].address.toString()).not.toBe(attesterSigners[0].address.toString());
    });

    it('should get coinbase address (fallback to attester)', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const coinbase = manager.getCoinbaseAddress(0);
      const attesterSigners = manager.createAttesterSigners(0);

      expect(coinbase.toString()).toBe(attesterSigners[0].address.toString());
    });

    it('should get explicit coinbase address', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            coinbase: '0x9876543210987654321098765432109876543210' as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const coinbase = manager.getCoinbaseAddress(0);

      expect(coinbase.toString()).toBe('0x9876543210987654321098765432109876543210');
    });
  });

  describe('mnemonic signer creation', () => {
    const testMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    // Pre-computed expected addresses for the test mnemonic
    const expectedAddresses = {
      account0Address0: '0x9858effd232b4033e47d90003d41ec34ecaeda94',
      account0Address1: '0x6fac4d18c912343bf86fa7049364dd4e424ab9c0',
      account1Address0: '0x78839f6054d7ed13918bae0473ba31b1ca9d7265',
    };

    describe('Single account/address derivation', () => {
      it("should derive correct address from mnemonic at default path (m/44'/60'/0'/0/0)", () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                // Using defaults: accountIndex: 0, addressIndex: 0, accountCount: 1, addressCount: 1
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(1);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
      });

      it('should derive correct address with explicit indices', () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 0,
                addressIndex: 1,
                accountCount: 1,
                addressCount: 1,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(1);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address1);
      });
    });

    describe('Multiple account/address derivation', () => {
      it('should derive multiple addresses from same account', () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 0,
                addressIndex: 0,
                accountCount: 1,
                addressCount: 2, // Derive 2 addresses
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(2);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
        expect(signers[1].address.toString()).toBe(expectedAddresses.account0Address1);
      });

      it('should derive addresses from different accounts', () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 0,
                addressIndex: 0,
                accountCount: 2, // Derive from 2 accounts
                addressCount: 1,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(2);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
        expect(signers[1].address.toString()).toBe(expectedAddresses.account1Address0);
      });
    });

    describe('Derivation spec matrix', () => {
      const deriveAddresses = async (
        mnemonic: string,
        accountIndexStart: number | undefined,
        accountCount: number | undefined,
        addressIndexStart: number | undefined,
        addressCount: number | undefined,
      ): Promise<string[]> => {
        const { Wallet } = await import('@ethersproject/wallet');
        const accStart = accountIndexStart ?? 0;
        const accCount = accountCount ?? 1;
        const addrStart = addressIndexStart ?? 0;
        const addrCount = addressCount ?? 1;

        const result: string[] = [];
        for (let a = 0; a < accCount; a++) {
          const account = accStart + a;
          for (let i = 0; i < addrCount; i++) {
            const idx = addrStart + i;
            const path = `m/44'/60'/${account}'/0/${idx}`;
            const wallet = Wallet.fromMnemonic(mnemonic, path);
            result.push(wallet.address.toLowerCase());
          }
        }
        return result;
      };

      it("default indices -> m/44'/60'/0'/0/0", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, undefined, undefined, undefined, undefined);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });

      it("address index 3 -> m/44'/60'/0'/0/3", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                addressIndex: 3,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, 0, 1, 3, 1);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });

      it("account index 5 -> m/44'/60'/5'/0/0", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 5,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, 5, 1, 0, 1);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });

      it("address index 3 & account index 5 -> m/44'/60'/5'/0/3", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 5,
                addressIndex: 3,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, 5, 1, 3, 1);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });

      it("address index 3, address count 2, account index 5 -> m/44'/60'/5'/0/3 and /4", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 5,
                addressIndex: 3,
                addressCount: 2,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, 5, 1, 3, 2);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });

      it('address index 3, address count 2, account index 5, account count 2 -> four paths', async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                accountIndex: 5,
                accountCount: 2,
                addressIndex: 3,
                addressCount: 2,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);
        const expected = await deriveAddresses(testMnemonic, 5, 2, 3, 2);
        expect(signers.map(s => s.address.toString())).toEqual(expected);
      });
    });

    describe('Mnemonic validation', () => {
      it('should reject invalid mnemonic', () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: 'invalid mnemonic phrase that is not valid',
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);

        expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
      });

      it('should handle mnemonic with extra whitespace', () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: '  ' + testMnemonic + '  ', // With leading/trailing spaces
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(1);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
      });
    });

    describe('Signing functionality', () => {
      it('should be able to sign messages with derived keys', async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
              } as any,
              feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        const message = Buffer32.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

        // Should be able to sign without throwing
        const signature = await signers[0].signMessage(message);
        expect(signature).toBeDefined();
        expect(signature.toString()).toMatch(/^0x[0-9a-f]+$/i); // Valid hex signature
      });
    });
  });

  describe('JSON V3 keystore support', () => {
    // Note: These tests create actual keystore files and test the full encryption/decryption flow
    const testPassword = 'super-secure-password-123';
    const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const createTempJsonKeystoreFile = async (): Promise<string> => {
      const { Wallet } = await import('@ethersproject/wallet');
      const tempDir = tmpdir();
      const tempFile = join(tempDir, `json-keystore-test-${Date.now()}.json`);

      // Create a wallet and encrypt it
      const wallet = new Wallet(testPrivateKey);
      const keystoreJson = await wallet.encrypt(testPassword);
      writeFileSync(tempFile, keystoreJson);

      return tempFile;
    };

    it('should create signers from JSON V3 keystore file', async () => {
      const jsonKeystoreFile = await createTempJsonKeystoreFile();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: jsonKeystoreFile,
              password: testPassword,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(signers).toHaveLength(1);
      // Verify the address matches the original wallet
      const { Wallet } = await import('@ethersproject/wallet');
      const originalWallet = new Wallet(testPrivateKey);
      expect(signers[0].address.toString()).toBe(originalWallet.address.toLowerCase());
    });

    it('should handle wrong password gracefully', async () => {
      const jsonKeystoreFile = await createTempJsonKeystoreFile();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: jsonKeystoreFile,
              password: 'wrong-password',
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);

      expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
    });

    it('should be able to sign messages with JSON V3 keystore', async () => {
      const jsonKeystoreFile = await createTempJsonKeystoreFile();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: jsonKeystoreFile,
              password: testPassword,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);
      const message = Buffer32.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

      const signature = await signers[0].signMessage(message);
      expect(signature).toBeDefined();
      expect(signature.toString()).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should create multiple signers from JSON V3 keystore directory', async () => {
      // Create multiple keystore files in a temp directory
      const tempDir = join(tmpdir(), `json-keystore-dir-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const testPrivateKeys = [
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      ];
      const testPassword = 'shared-password-123';

      // Create wallets and their addresses
      const expectedAddresses: string[] = [];
      for (let i = 0; i < testPrivateKeys.length; i++) {
        const { Wallet } = await import('@ethersproject/wallet');
        const wallet = new Wallet(testPrivateKeys[i]);
        expectedAddresses.push(wallet.address.toLowerCase());

        // Encrypt and save to file
        const keystoreJson = await wallet.encrypt(testPassword);
        const fileName = `keystore-${i + 1}.json`;
        writeFileSync(join(tempDir, fileName), keystoreJson);
      }

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: tempDir,
              password: testPassword,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(Array.isArray(signers)).toBe(true);
      expect(signers).toHaveLength(2);
      const actualAddresses = signers.map(s => s.address.toString()).sort();
      expect(actualAddresses).toEqual(expectedAddresses.sort());
    });

    it('should throw error when JSON V3 directory has no json files', () => {
      const tempDir = join(tmpdir(), `json-keystore-empty-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      // Create a non-json file
      writeFileSync(join(tempDir, 'readme.txt'), 'This is not a keystore');

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: tempDir,
              password: 'some-password',
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);

      expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
      expect(() => manager.createAttesterSigners(0)).toThrow('No JSON keystore files found');
    });

    it('should handle JSON V3 directory with mixed valid and invalid files', async () => {
      const tempDir = join(tmpdir(), `json-keystore-mixed-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const testPassword = 'test-password';

      // Create a valid keystore file
      const { Wallet } = await import('@ethersproject/wallet');
      const wallet = new Wallet(testPrivateKey);
      const keystoreJson = await wallet.encrypt(testPassword);
      writeFileSync(join(tempDir, 'valid.json'), keystoreJson);

      // Create an invalid json file
      writeFileSync(join(tempDir, 'invalid.json'), '{"not": "a keystore"}');

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: tempDir,
              password: testPassword,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);

      // Should throw because one of the files is invalid
      expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
    });

    it('should throw when two JSON V3 files have the same address', async () => {
      const tempDir = join(tmpdir(), `json-keystore-dup-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const dupPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const password = 'dup-password';

      const { Wallet } = await import('@ethersproject/wallet');
      const wallet = new Wallet(dupPrivateKey);
      const keystoreJsonA = await wallet.encrypt(password);
      const keystoreJsonB = await wallet.encrypt(password);

      const fileA = 'a.json';
      const fileB = 'b.json';
      writeFileSync(join(tempDir, fileA), keystoreJsonA);
      writeFileSync(join(tempDir, fileB), keystoreJsonB);

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: tempDir,
              password,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);

      expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
      expect(() => manager.createAttesterSigners(0)).toThrow('Duplicate JSON V3 keystore address');
      expect(() => manager.createAttesterSigners(0)).toThrow(/\(files: .*a\.json and .*b\.json\)/);
    });

    it('should be able to sign with signers from JSON V3 directory', async () => {
      const tempDir = join(tmpdir(), `json-keystore-sign-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const testPassword = 'sign-password';

      const { Wallet } = await import('@ethersproject/wallet');
      const wallet = new Wallet(testPrivateKey);
      const keystoreJson = await wallet.encrypt(testPassword);
      writeFileSync(join(tempDir, 'signer.json'), keystoreJson);

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              path: tempDir,
              password: testPassword,
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);
      const message = Buffer32.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

      const signature = await signers[0].signMessage(message);
      expect(signature).toBeDefined();
      expect(signature.toString()).toMatch(/^0x[0-9a-f]+$/i);
    });
  });

  describe('slasher and prover support', () => {
    it('should create slasher signers', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        slasher: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
        validators: [
          {
            attester: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createSlasherSigners();

      expect(signers).toHaveLength(1);
    });

    it('should return empty array when no slasher', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createSlasherSigners();

      expect(signers).toHaveLength(0);
    });

    it('should create prover signers (simple case)', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createProverSigners();

      expect(signers).toHaveLength(1);
    });

    it('should return raw slasher config via getter', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        slasher: [
          '0x1234567890123456789012345678901234567890123456789012345678901234',
          '0x1111111111111111111111111111111111111111',
        ] as any,
        validators: [
          {
            attester: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const slasher = manager.getSlasherAccounts();
      expect(slasher).toBeDefined();
      expect(Array.isArray(slasher)).toBe(true);
      expect((slasher as any[]).length).toBe(2);
    });

    it('should return raw prover config via getter', () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: {
          id: '0x1234567890123456789012345678901234567890' as any,
          publisher: ['0x1234567890123456789012345678901234567890123456789012345678901234' as any],
        },
      };

      const manager = new KeystoreManager(keystore);
      const prover = manager.getProverConfig();
      expect(prover).toBeDefined();
      expect(typeof prover).toBe('object');
      expect((prover as any).id).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('getEffectiveRemoteSignerConfig precedence', () => {
    it('returns account-level override when provided (address object with remoteSignerUrl)', () => {
      const attesterAddr = '0x1111111111111111111111111111111111111111' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: 'https://file-default',
        validators: [
          {
            attester: {
              address: attesterAddr,
              remoteSignerUrl: 'https://acct-override',
              certPath: '/path/to/cert',
              certPass: 'secret',
            } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            remoteSigner: 'https://validator-default',
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, EthAddress.fromString(attesterAddr));

      expect(cfg).toEqual({
        remoteSignerUrl: 'https://acct-override',
        certPath: '/path/to/cert',
        certPass: 'secret',
      });
    });

    it('falls back to validator-level remoteSigner for address-only attester', () => {
      const attesterAddr = '0x2222222222222222222222222222222222222222' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesterAddr as any, // address-only remote signer account
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            remoteSigner: 'https://validator-default',
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, EthAddress.fromString(attesterAddr));
      expect(cfg).toBe('https://validator-default');
    });

    it('falls back to file-level remoteSigner when validator-level is absent', () => {
      const attesterAddr = '0x3333333333333333333333333333333333333333' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: 'https://file-default',
        validators: [
          {
            attester: attesterAddr as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, EthAddress.fromString(attesterAddr));
      expect(cfg).toBe('https://file-default');
    });

    it('returns undefined when no defaults exist for address-only attester', () => {
      const attesterAddr = '0x4444444444444444444444444444444444444444' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesterAddr as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, EthAddress.fromString(attesterAddr));
      expect(cfg).toBeUndefined();
    });

    it('returns undefined for local signer from private key', () => {
      const privateKey = '0x1234567890123456789012345678901234567890123456789012345678901234' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: privateKey,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signerAddr = manager.createAttesterSigners(0)[0].address; // derived local signer
      const cfg = manager.getEffectiveRemoteSignerConfig(0, signerAddr);
      expect(cfg).toBeUndefined();
    });

    it('returns undefined for local signer derived from mnemonic', () => {
      const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { mnemonic: testMnemonic } as any,
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signerAddr = manager.createAttesterSigners(0)[0].address; // derived local signer
      const cfg = manager.getEffectiveRemoteSignerConfig(0, signerAddr);
      expect(cfg).toBeUndefined();
    });
  });
});
