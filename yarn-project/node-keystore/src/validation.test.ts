/**
 * Tests for keystore duplication check logic and validation integration
 */
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { describe, expect, it } from '@jest/globals';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

import { KeystoreError, KeystoreManager } from '../src/keystore_manager.js';
import { KeyStoreLoadError, loadKeystoreFile, mergeKeystores } from '../src/loader.js';
import type { KeyStore, ProverKeyStoreWithId } from '../src/types.js';
import { keystoreSchema } from './schemas.js';

describe('Keystore Duplication Validation', () => {
  let logger: Logger;

  beforeAll(() => {
    logger = createLogger('node-keystore:validation-test');
  });
  it('should reject duplicate attester addresses across keystores', () => {
    logger.info('Testing duplicate attester validation');

    const privateKey = generatePrivateKey();
    const address = privateKeyToAddress(privateKey).toString();

    const keystore1 = keystoreSchema.parse({
      schemaVersion: 1,
      validators: [
        {
          attester: privateKey,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      ],
    });

    const keystore2 = keystoreSchema.parse({
      schemaVersion: 1,
      validators: [
        {
          attester: address,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      ],
    });

    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(/Duplicate attester address/);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(address.toLowerCase());
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(privateKey);
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

    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(/Multiple prover configurations found/);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(keystore1.prover!);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(keystore2.prover!);
  });

  it('should reject duplicate ETH attester across keystores even if BLS differs', () => {
    const eth = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as any;
    const bls1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as any;
    const bls2 = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as any;

    const keystore1: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: { eth, bls: bls1 } as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    const keystore2: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: { eth, bls: bls2 } as any, // same eth, different bls
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).toThrow(/Duplicate attester address/);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(eth);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(bls1);
    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow(bls2);
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

    expect(() => mergeKeystores([keystore1, keystore2], logger)).not.toThrow();

    const merged = mergeKeystores([keystore1, keystore2], logger);
    logger.info('Successfully merged keystores with unique attesters');
    expect(merged.validators).toHaveLength(2);
  });

  it('should merge multiple slasher configurations', () => {
    const keystore1: KeyStore = {
      schemaVersion: 1,
      slasher: '0x1111111111111111111111111111111111111111111111111111111111111111' as any,
    };

    const keystore2: KeyStore = {
      schemaVersion: 1,
      slasher: [
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333333333333333333333333333',
      ] as any,
    };

    const merged = mergeKeystores([keystore1, keystore2], logger);

    // Expect merged.slasher to be an array of all entries
    expect(Array.isArray(merged.slasher)).toBe(true);
    const slashers = merged.slasher as unknown[];
    expect(slashers).toHaveLength(3);
    expect(slashers).toEqual([
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
    ]);

    // Ensure manager expands all slasher accounts into signers
    const manager = new KeystoreManager(merged);
    const signers = manager.createSlasherSigners();
    expect(signers).toHaveLength(3);
  });

  it('should merge multiple top-level publisher configurations', () => {
    const pub1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const pub2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
    const pub3 = '0x3333333333333333333333333333333333333333333333333333333333333333';
    const feeRecipient = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const attester1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const attester2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const keystore1: KeyStore = {
      schemaVersion: 2,
      publisher: pub1 as any,
      feeRecipient: feeRecipient as any,
      validators: [
        {
          attester: attester1 as any,
        },
      ],
    };

    const keystore2: KeyStore = {
      schemaVersion: 2,
      publisher: [pub2, pub3] as any,
      feeRecipient: feeRecipient as any,
      validators: [
        {
          attester: attester2 as any,
        },
      ],
    };

    const merged = mergeKeystores([keystore1, keystore2], logger);

    // Expect merged.publisher to be an array of all entries
    expect(Array.isArray(merged.publisher)).toBe(true);
    const publishers = merged.publisher as unknown[];
    expect(publishers).toHaveLength(3);
    expect(publishers).toEqual([pub1, pub2, pub3]);
  });

  it('should throw an error when merging v1 and v2 keystores', () => {
    const v1Keystore: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    const v2Keystore: KeyStore = {
      schemaVersion: 2,
      feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
      publisher: '0x1111111111111111111111111111111111111111111111111111111111111111' as any,
      validators: [
        {
          attester: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as any,
        },
      ],
    };

    expect(() => mergeKeystores([v1Keystore, v2Keystore], logger)).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([v1Keystore, v2Keystore], logger)).toThrow(
      /Cannot merge keystores with different schema versions/,
    );
    expect(() => mergeKeystores([v1Keystore, v2Keystore], logger)).toThrow(/keystores\[0\].schemaVersion/);
  });

  it('should use last-one-wins for top-level publisher when mnemonics are involved', () => {
    const publisherKey = '0x2222222222222222222222222222222222222222222222222222222222222222';
    const keystore1: KeyStore = {
      schemaVersion: 2,
      publisher: {
        mnemonic: 'test test test test test test test test test test test junk',
        addressCount: 2,
      } as any,
      feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
      validators: [
        {
          attester: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as any,
        },
      ],
    };

    const keystore2: KeyStore = {
      schemaVersion: 2,
      publisher: publisherKey as any,
      feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
      validators: [
        {
          attester: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as any,
        },
      ],
    };

    const merged = mergeKeystores([keystore1, keystore2], logger);

    // Should use the second one (last-one-wins when mnemonic is involved)
    expect(merged.publisher).toBe(publisherKey);
  });

  it('should detect duplicate attester addresses across JSON V3 and private key after resolution', async () => {
    // Create a temp directory with one JSON V3 keystore whose address matches a given private key
    const { Wallet } = await import('@ethersproject/wallet');
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    const password = 'dup-pass';
    const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const wallet = new Wallet(privateKey);
    const keystoreJson = await wallet.encrypt(password);

    const dir = mkdtempSync(join(tmpdir(), 'jsonv3-dup-'));
    const file = join(dir, 'a.json');
    writeFileSync(file, keystoreJson);

    const keystore: KeyStore = {
      schemaVersion: 1,
      validators: [
        {
          attester: privateKey as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
        {
          attester: { path: dir, password } as any,
          feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as any,
        },
      ],
    };

    const manager = new KeystoreManager(keystore);
    expect(() => manager.validateResolvedUniqueAttesterAddresses()).toThrow(KeystoreError);
    expect(() => manager.validateResolvedUniqueAttesterAddresses()).toThrow(/Duplicate attester address/);
    expect(() => manager.validateResolvedUniqueAttesterAddresses()).not.toThrow(privateKey);
  });

  // Integration tests moved from examples.integration.test.ts
  describe('Examples integration (schema validation)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const examplesDir = join(__dirname, '../examples');

    const v1ExampleFiles = [
      'simple-validator.json',
      'multiple-validators-remote.json',
      'simple-prover.json',
      'prover-with-single-publisher.json',
      'prover-with-mnemonic-publisher.json',
      'validator-null.json',
      'prover-with-publishers-and-funding-account.json',
      'everything.json',
    ];

    const v2ExampleFiles = ['validator-with-top-level-defaults.json'];

    for (const file of v1ExampleFiles) {
      it(`should load and validate v1/${file}`, () => {
        const path = join(examplesDir, 'v1', file);
        expect(() => loadKeystoreFile(path)).not.toThrow();
        const ks = loadKeystoreFile(path);
        expect(ks.schemaVersion).toBe(1);
      });
    }

    for (const file of v2ExampleFiles) {
      it(`should load and validate v2/${file}`, () => {
        const path = join(examplesDir, 'v2', file);
        expect(() => loadKeystoreFile(path)).not.toThrow();
        const ks = loadKeystoreFile(path);
        expect(ks.schemaVersion).toBe(2);
      });
    }
  });

  it('should initialize every type from everything.json', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const examplesDir = join(__dirname, '../examples');
    const path = join(examplesDir, 'v1', 'everything.json');

    const ks = loadKeystoreFile(path);

    // File-level remote signer
    expect(ks.remoteSigner).toBeDefined();

    // File-level funding account
    expect(ks.fundingAccount).toBeDefined();
    expect(ks.fundingAccount).toBe('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');

    // Slasher: array with mixed account types (private key, address, remote signer account, mnemonic)
    expect(ks.slasher).toBeDefined();
    expect(Array.isArray(ks.slasher)).toBe(true);
    const slasher = ks.slasher as any[];
    expect(slasher.length).toBeGreaterThanOrEqual(4);

    // Validators present
    expect(ks.validators).toBeDefined();
    expect(ks.validators!.length).toBeGreaterThanOrEqual(2);

    // Validator[0] checks
    const v0 = ks.validators![0] as any;
    expect(v0.attester).toBeDefined(); // mnemonic config
    expect(v0.coinbase).toBeDefined();
    expect(v0.publisher).toBeDefined(); // array including private key, address, remote signer account, json v3 dir
    expect(
      (v0.feeRecipient as AztecAddress).equals(
        AztecAddress.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
      ),
    ).toBeTruthy();
    expect(typeof v0.remoteSigner === 'string').toBe(true);

    // Validator[1] checks
    const v1 = ks.validators![1] as any;
    expect(Array.isArray(v1.attester)).toBe(true);
    expect(v1.publisher).toBeDefined(); // mnemonic config
    expect(
      (v1.feeRecipient as AztecAddress).equals(
        AztecAddress.fromString('0x0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcd'),
      ),
    ).toBeTruthy();
    expect(v1.fundingAccount).toBeDefined();
    expect(v1.fundingAccount).toBe('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');

    // Prover complex type
    expect(ks.prover).toBeDefined();
    const prover = ks.prover as ProverKeyStoreWithId;
    expect(prover.id.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();
    expect(Array.isArray(prover.publisher)).toBe(true);
  });
});
