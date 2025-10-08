/**
 * Tests for KeystoreManager
 */
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { describe, expect, it, jest } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

import { KeystoreError, KeystoreManager } from '../src/keystore_manager.js';
import { LocalSigner, RemoteSigner } from '../src/signer.js';
import type { KeyStore } from '../src/types.js';

describe('KeystoreManager', () => {
  describe('constructor and basic operations', () => {
    it('should create manager with simple validator keystore', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: EthAddress.random(),
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      expect(() => new KeystoreManager(keystore)).not.toThrow();
    });

    it('should get validator count', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: EthAddress.random(),
            feeRecipient: await AztecAddress.random(),
          },
          {
            attester: EthAddress.random(),
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      expect(manager.getValidatorCount()).toBe(2);
    });

    it('should get validator by index', async () => {
      const attester = EthAddress.random();
      const feeRecipient = await AztecAddress.random();
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: attester,
            feeRecipient: feeRecipient,
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const validator = manager.getValidator(0);

      const received: EthAddress = validator.attester as EthAddress;
      expect(received.equals(attester)).toBeTruthy();
      expect(validator.feeRecipient.equals(feeRecipient)).toBeTruthy();
    });

    it('should throw for out of bounds validator index', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: EthAddress.random(),
            feeRecipient: await AztecAddress.random(),
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
            attester: EthAddress.random(),
            feeRecipient: AztecAddress.fromString('0x1111111111111111111111111111111111111111111111111111111111111111'),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const feeRecipient = manager.getFeeRecipient(0);

      expect(
        feeRecipient.equals(
          AztecAddress.fromString('0x1111111111111111111111111111111111111111111111111111111111111111'),
        ),
      ).toBeTruthy();
    });
  });

  describe('signer creation', () => {
    it('should create signers from combined { eth, bls } and from mixed arrays (eth only)', async () => {
      const ethPk1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as any;
      const blsPk1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as any;

      // Single combined object
      const ks1: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { eth: ethPk1, bls: blsPk1 } as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const m1 = new KeystoreManager(ks1);
      const s1 = m1.createAttesterSigners(0);
      expect(s1).toHaveLength(1);
      const expected1 = new LocalSigner(Buffer32.fromString(ethPk1));
      expect(s1[0].address.equals(expected1.address)).toBeTruthy();

      // Mixed array: {eth, bls} and plain EthAccount
      const ethPk2 = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as any;
      const ks2: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: [{ eth: ethPk1, bls: blsPk1 } as any, ethPk2] as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const m2 = new KeystoreManager(ks2);
      const s2 = m2.createAttesterSigners(0);
      expect(s2).toHaveLength(2);
      const expected2a = new LocalSigner(Buffer32.fromString(ethPk1));
      const expected2b = new LocalSigner(Buffer32.fromString(ethPk2));
      const addrs = s2.map(x => x.address.toString()).sort();
      expect(addrs).toEqual([expected2a.address.toString(), expected2b.address.toString()].sort());
    });
    it('should create attester signers from private key', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(signers).toHaveLength(1);
      expect(signers[0].address.toString()).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('should create multiple signers from mnemonic', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: {
              mnemonic: 'test test test test test test test test test test test junk',
              addressCount: 2,
            } as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signers = manager.createAttesterSigners(0);

      expect(signers).toHaveLength(2);
      expect(signers[0].address.toString()).not.toBe(signers[1].address.toString());
    });

    it('should create publisher signers (fallback to attester)', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const attesterSigners = manager.createAttesterSigners(0);
      const publisherSigners = manager.createPublisherSigners(0);

      expect(publisherSigners).toHaveLength(1);
      expect(publisherSigners[0].address.toString()).toBe(attesterSigners[0].address.toString());
    });

    it('should create separate publisher signers when specified', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            publisher: '0x5678901234567890123456789012345678901234567890123456789012345678' as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const attesterSigners = manager.createAttesterSigners(0);
      const publisherSigners = manager.createPublisherSigners(0);

      expect(publisherSigners).toHaveLength(1);
      expect(publisherSigners[0].address.toString()).not.toBe(attesterSigners[0].address.toString());
    });

    it('should get coinbase address (fallback to attester)', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const coinbase = manager.getCoinbaseAddress(0);
      const attesterSigners = manager.createAttesterSigners(0);

      expect(coinbase.toString()).toBe(attesterSigners[0].address.toString());
    });

    it('should get explicit coinbase address', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234' as any,
            coinbase: '0x9876543210987654321098765432109876543210' as any,
            feeRecipient: await AztecAddress.random(),
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
      it("should derive correct address from mnemonic at default path (m/44'/60'/0'/0/0)", async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: testMnemonic,
                // Using defaults: accountIndex: 0, addressIndex: 0, accountCount: 1, addressCount: 1
              } as any,
              feeRecipient: await AztecAddress.random(),
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(1);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
      });

      it('should derive correct address with explicit indices', async () => {
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
              feeRecipient: await AztecAddress.random(),
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
      it('should derive multiple addresses from same account', async () => {
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
              feeRecipient: await AztecAddress.random(),
            },
          ],
        };

        const manager = new KeystoreManager(keystore);
        const signers = manager.createAttesterSigners(0);

        expect(signers).toHaveLength(2);
        expect(signers[0].address.toString()).toBe(expectedAddresses.account0Address0);
        expect(signers[1].address.toString()).toBe(expectedAddresses.account0Address1);
      });

      it('should derive addresses from different accounts', async () => {
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
      it('should reject invalid mnemonic', async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: 'invalid mnemonic phrase that is not valid',
              } as any,
              feeRecipient: await AztecAddress.random(),
            },
          ],
        };

        const manager = new KeystoreManager(keystore);

        expect(() => manager.createAttesterSigners(0)).toThrow(KeystoreError);
      });

      it('should handle mnemonic with extra whitespace', async () => {
        const keystore: KeyStore = {
          schemaVersion: 1,
          validators: [
            {
              attester: {
                mnemonic: '  ' + testMnemonic + '  ', // With leading/trailing spaces
              } as any,
              feeRecipient: await AztecAddress.random(),
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
              feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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

    it('should throw error when JSON V3 directory has no json files', async () => {
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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
            feeRecipient: await AztecAddress.random(),
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

      expect(signers).toBeDefined();
      expect(signers!.signers).toHaveLength(1);
      expect(signers!.id).toBeUndefined();
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

    it('should return prover signers via getter', () => {
      const id = EthAddress.fromString('0x1234567890123456789012345678901234567890');
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: {
          id: id,
          publisher: ['0x1234567890123456789012345678901234567890123456789012345678901234' as any],
        },
      };

      const manager = new KeystoreManager(keystore);
      const proverSigners = manager.createProverSigners();
      expect(proverSigners).toBeDefined();
      expect(Array.isArray(proverSigners!.signers)).toBe(true);
      expect(proverSigners!.signers.length).toBe(1);
      expect(proverSigners!.id).toBeDefined();
      expect(
        proverSigners!.id!.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890')),
      ).toBeTruthy();

      const expectedSigner = new LocalSigner(
        Buffer32.fromString('0x1234567890123456789012345678901234567890123456789012345678901234' as any),
      );
      expect(proverSigners!.signers[0].address.equals(expectedSigner.address)).toBeTruthy();
    });

    it('should return mnemonic prover signers via getter', () => {
      const id = EthAddress.fromString('0x1234567890123456789012345678901234567890');
      const mnemonic = 'test test test test test test test test test test test junk';
      const keystore: KeyStore = {
        schemaVersion: 1,
        prover: {
          id: id,
          publisher: {
            mnemonic: mnemonic,
            addressCount: 1,
          },
        },
      };

      const manager = new KeystoreManager(keystore);
      const proverSigners = manager.createProverSigners();
      expect(proverSigners).toBeDefined();
      expect(Array.isArray(proverSigners!.signers)).toBe(true);
      expect(proverSigners!.signers.length).toBe(1);
      expect(proverSigners!.id).toBeDefined();
      expect(
        proverSigners!.id!.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890')),
      ).toBeTruthy();

      const viemAccount = mnemonicToAccount(mnemonic, {
        accountIndex: 0,
        addressIndex: 0,
      });

      const expectedAddress = viemAccount.address;
      expect(proverSigners!.signers[0].address.equals(EthAddress.fromString(expectedAddress))).toBeTruthy();
    });
  });

  describe('getEffectiveRemoteSignerConfig precedence', () => {
    it('returns account-level override when provided (address object with remoteSignerUrl)', async () => {
      const attesterAddr = EthAddress.fromString('0x1111111111111111111111111111111111111111');
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
            feeRecipient: await AztecAddress.random(),
            remoteSigner: 'https://validator-default',
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, attesterAddr);

      expect(cfg).toEqual({
        remoteSignerUrl: 'https://acct-override',
        certPath: '/path/to/cert',
        certPass: 'secret',
      });
    });

    it('falls back to validator-level remoteSigner for address-only attester', async () => {
      const attesterAddr = EthAddress.fromString('0x2222222222222222222222222222222222222222');
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesterAddr, // address-only remote signer account
            feeRecipient: await AztecAddress.random(),
            remoteSigner: 'https://validator-default',
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, attesterAddr);
      expect(cfg).toBe('https://validator-default');
    });

    it('falls back to file-level remoteSigner when validator-level is absent', async () => {
      const attesterAddr = EthAddress.fromString('0x3333333333333333333333333333333333333333');
      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: 'https://file-default',
        validators: [
          {
            attester: attesterAddr,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, attesterAddr);
      expect(cfg).toBe('https://file-default');
    });

    it('returns undefined when no defaults exist for address-only attester', async () => {
      const attesterAddr = '0x4444444444444444444444444444444444444444' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: attesterAddr as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const cfg = manager.getEffectiveRemoteSignerConfig(0, EthAddress.fromString(attesterAddr));
      expect(cfg).toBeUndefined();
    });

    it('returns undefined for local signer from private key', async () => {
      const privateKey = '0x1234567890123456789012345678901234567890123456789012345678901234' as any;
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: privateKey,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signerAddr = manager.createAttesterSigners(0)[0].address; // derived local signer
      const cfg = manager.getEffectiveRemoteSignerConfig(0, signerAddr);
      expect(cfg).toBeUndefined();
    });

    it('returns undefined for local signer derived from mnemonic', async () => {
      const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { mnemonic: testMnemonic } as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      const signerAddr = manager.createAttesterSigners(0)[0].address; // derived local signer
      const cfg = manager.getEffectiveRemoteSignerConfig(0, signerAddr);
      expect(cfg).toBeUndefined();
    });
  });

  describe('validateSigners', () => {
    it('should not validate when there are no remote signers', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();
    });

    it('should validate remote signers for validators', async () => {
      const testAddress = EthAddress.random();
      const testUrl = 'http://test-signer:9000';

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { address: testAddress, remoteSignerUrl: testUrl },
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using _ = jest.spyOn(RemoteSigner, 'validateAccess').mockImplementation(() => Promise.resolve());

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();
    });

    it('should batch validate multiple addresses for the same remote signer URL', async () => {
      const testUrl = 'http://test-signer:9000';
      const address1 = EthAddress.random();
      const address2 = EthAddress.random();
      const address3 = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: [
              { address: address1, remoteSignerUrl: testUrl },
              { address: address2, remoteSignerUrl: testUrl },
            ],
            publisher: { address: address3, remoteSignerUrl: testUrl },
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess').mockImplementation(() => Promise.resolve());

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      // Should batch all three addresses into one call
      expect(validateAccessSpy).toHaveBeenCalledTimes(1);
      expect(validateAccessSpy).toHaveBeenCalledWith(
        testUrl,
        expect.arrayContaining([address1.toString(), address2.toString(), address3.toString()]),
      );
    });

    it('should validate remote signers from default config', async () => {
      const defaultUrl = 'http://default-signer:9000';
      const address = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: defaultUrl,
        validators: [
          {
            attester: address, // Just address, uses default remote signer
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');
      validateAccessSpy.mockResolvedValueOnce(undefined);

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      expect(validateAccessSpy).toHaveBeenCalledWith(defaultUrl, [address.toString()]);
    });

    it('should validate slasher remote signers', async () => {
      const testUrl = 'http://slasher-signer:9000';
      const slasherAddress = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        slasher: { address: slasherAddress, remoteSignerUrl: testUrl },
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');
      validateAccessSpy.mockResolvedValueOnce(undefined);

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      expect(validateAccessSpy).toHaveBeenCalledWith(testUrl, [slasherAddress.toString()]);
    });

    it('should validate prover remote signers', async () => {
      const testUrl = 'http://prover-signer:9000';
      const publisherAddress = EthAddress.random();
      const proverId = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        remoteSigner: testUrl,
        prover: {
          id: proverId,
          publisher: [publisherAddress],
        },
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');
      validateAccessSpy.mockResolvedValueOnce(undefined);

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      expect(validateAccessSpy).toHaveBeenCalledWith(testUrl, [publisherAddress.toString()]);
    });

    it('should handle validation errors', async () => {
      const testUrl = 'http://test-signer:9000';
      const address = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { address, remoteSignerUrl: testUrl },
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');
      validateAccessSpy.mockRejectedValueOnce(new Error('Connection refused'));

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).rejects.toThrow('Connection refused');
    });

    it('should skip validation for mnemonic and JSON V3 configs', async () => {
      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { mnemonic: 'test test test test test test test test test test test junk' } as any,
            feeRecipient: await AztecAddress.random(),
          },
          {
            attester: { path: '/some/path.json', password: 'test' } as any,
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      // Should not call validateAccess for mnemonic or JSON configs
      expect(validateAccessSpy).not.toHaveBeenCalled();
    });

    it('should validate multiple remote signer URLs separately', async () => {
      const url1 = 'http://signer1:9000';
      const url2 = 'http://signer2:9000';
      const address1 = EthAddress.random();
      const address2 = EthAddress.random();

      const keystore: KeyStore = {
        schemaVersion: 1,
        validators: [
          {
            attester: { address: address1, remoteSignerUrl: url1 },
            feeRecipient: await AztecAddress.random(),
          },
          {
            attester: { address: address2, remoteSignerUrl: url2 },
            feeRecipient: await AztecAddress.random(),
          },
        ],
      };

      using validateAccessSpy = jest.spyOn(RemoteSigner, 'validateAccess');
      validateAccessSpy.mockResolvedValue(undefined);

      const manager = new KeystoreManager(keystore);
      await expect(manager.validateSigners()).resolves.not.toThrow();

      // Should call validateAccess twice, once for each URL
      expect(validateAccessSpy).toHaveBeenCalledTimes(2);
      expect(validateAccessSpy).toHaveBeenCalledWith(url1, [address1.toString()]);
      expect(validateAccessSpy).toHaveBeenCalledWith(url2, [address2.toString()]);
    });
  });
});
