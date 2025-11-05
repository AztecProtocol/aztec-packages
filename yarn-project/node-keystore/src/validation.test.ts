/**
 * Tests for keystore duplication check logic and validation integration
 */
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { describe, expect, it } from '@jest/globals';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { KeystoreError, KeystoreManager } from '../src/keystore_manager.js';
import { KeyStoreLoadError, loadKeystoreFile, mergeKeystores } from '../src/loader.js';
import type { KeyStore, ProverKeyStoreWithId } from '../src/types.js';

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

    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(KeyStoreLoadError);
    expect(() => mergeKeystores([keystore1, keystore2])).toThrow(/Duplicate attester address/);
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

    const merged = mergeKeystores([keystore1, keystore2]);

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
  });

  // Integration tests moved from examples.integration.test.ts
  describe('Examples integration (schema validation)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const examplesDir = join(__dirname, '../examples');

    const configExampleFiles = [
      'simple-validator.json',
      'multiple-validators-remote.json',
      'simple-prover.json',
      'prover-with-single-publisher.json',
      'prover-with-mnemonic-publisher.json',
      'validator-null.json',
      'prover-with-publishers-and-funding-account.json',
      'everything.json',
    ];

    for (const file of configExampleFiles) {
      it(`should load and validate ${file}`, () => {
        const path = join(examplesDir, file);
        expect(() => loadKeystoreFile(path)).not.toThrow();
        const ks = loadKeystoreFile(path);
        expect(ks.schemaVersion).toBe(1);
      });
    }
  });

  it('should initialize every type from everything.json', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const examplesDir = join(__dirname, '../examples');
    const path = join(examplesDir, 'everything.json');

    const ks = loadKeystoreFile(path);

    // File-level remote signer
    expect(ks.remoteSigner).toBeDefined();

    // File-level funding account
    expect(ks.fundingAccount).toBeDefined();
    expect(ks.fundingAccount).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

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
        AztecAddress.fromString('0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
      ),
    ).toBeTruthy();
    expect(v1.fundingAccount).toBeDefined();
    expect(v1.fundingAccount).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    // Prover complex type
    expect(ks.prover).toBeDefined();
    const prover = ks.prover as ProverKeyStoreWithId;
    expect(prover.id.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();
    expect(Array.isArray(prover.publisher)).toBe(true);
  });
});
