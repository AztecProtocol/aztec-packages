import { deriveBlsPrivateKey } from '@aztec/foundation/crypto';
import { decryptBn254Keystore } from '@aztec/foundation/crypto/bls/bn254_keystore';
import { loadKeystoreFile } from '@aztec/node-keystore/loader';
import type { KeyStore } from '@aztec/node-keystore/types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mnemonicToAccount } from 'viem/accounts';

import { addValidatorKeys } from './add.js';
import { generateBlsKeypair } from './generate_bls_keypair.js';
import { newValidatorKeystore } from './new.js';
import {
  buildValidatorEntries,
  computeBlsPublicKeyCompressed,
  deriveEthAttester,
  logValidatorSummaries,
  resolveKeystoreOutputPath,
  withValidatorIndex,
  writeBlsBn254ToFile,
  writeEthJsonV3ToFile,
  writeKeystoreFile,
} from './shared.js';
import { validatePublisherOptions } from './utils.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('validator keys utilities', () => {
  let tmp: string;
  let feeRecipient: AztecAddress;

  beforeAll(async () => {
    feeRecipient = await AztecAddress.random();
    tmp = mkdtempSync(join(tmpdir(), 'aztec-valkeys-'));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('withValidatorIndex', () => {
    it('replaces both account and address indices for matching paths', () => {
      const out = withValidatorIndex('m/12381/3600/0/0/0', 5, 3);
      expect(out).toBe('m/12381/3600/5/0/3');
    });

    it('only replaces address / account indices when path is the default path', () => {
      const out = withValidatorIndex('m/12381/3600/0/0/0', 5, 3);
      expect(out).toBe('m/12381/3600/5/0/3');

      const out2 = withValidatorIndex('m/12381/3600/33/0/33', 5, 3);
      expect(out2).toBe('m/12381/3600/33/0/33');
    });

    it('returns the path unchanged for non-matching paths', () => {
      const original = 'm/44/60/0/0/0';
      const out = withValidatorIndex(original, 9, 5);
      expect(out).toBe(original);
    });

    it('returns the path unchanged for BLS paths with different length', () => {
      const shortPath = 'm/12381/3600/0/0';
      const out = withValidatorIndex(shortPath, 5, 3);
      expect(out).toBe(shortPath);
    });
  });

  describe('deriveBlsPrivateKey and computeBlsPublicKeyCompressed', () => {
    it('derives from ikm when provided', () => {
      const ikm = '0x11223344556677889900aabbccddeeff';
      const path = 'm/12381/3600/0/0/0';
      const priv = deriveBlsPrivateKey(undefined, ikm, path);
      expect(typeof priv).toBe('string');
      expect(priv.startsWith('0x')).toBe(true);
    });

    it('derives from mnemonic when ikm is not provided', () => {
      const path = 'm/12381/3600/0/0/0';
      const priv = deriveBlsPrivateKey(TEST_MNEMONIC, undefined, path);
      expect(typeof priv).toBe('string');
      expect(priv.startsWith('0x')).toBe(true);
    });

    it('throws when neither mnemonic nor ikm provided', () => {
      expect(() => deriveBlsPrivateKey(undefined as any, undefined as any, 'm/12381/3600/0/0/0')).toThrow();
    });

    it('computes a compressed public key from a private scalar', async () => {
      const path = 'm/12381/3600/0/0/0';
      const priv = deriveBlsPrivateKey(TEST_MNEMONIC, undefined, path);
      const pub = await computeBlsPublicKeyCompressed(priv);
      expect(pub.startsWith('0x')).toBe(true);
      // Should be a non-trivial hex string
      expect(pub.length).toBeGreaterThan(10);
    });
  });

  describe('deriveEthAttester', () => {
    it('returns a raw private key string when remote signer is not provided', () => {
      const out = deriveEthAttester(TEST_MNEMONIC, 0, 0);
      expect(typeof out).toBe('string');
      expect((out as string).startsWith('0x')).toBe(true);
    });

    it('returns an account object when remote signer is provided', () => {
      const remote = 'http://localhost:8546';
      const expected = mnemonicToAccount(TEST_MNEMONIC, { accountIndex: 0, addressIndex: 1 }).address;
      const out = deriveEthAttester(TEST_MNEMONIC, 0, 1, remote) as any;
      expect(out).toMatchObject({ address: expected, remoteSignerUrl: remote });
    });
  });

  describe('buildValidatorEntries', () => {
    it('builds entries and summaries for mixed eth+bls attesters', async () => {
      const { validators, summaries } = await buildValidatorEntries({
        validatorCount: 2,
        publisherCount: 1,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      expect(validators.length).toBe(2);
      expect(summaries.length).toBe(2);
      // attester field should contain eth and bls when mnemonic present
      const att0 = validators[0].attester as any;
      expect(att0.eth || att0.remoteSignerUrl).toBeDefined();
      expect(att0.bls).toBeDefined();
      // summaries contain addresses
      expect(typeof summaries[0].attesterEth).toBe('string');
      expect(typeof summaries[0].attesterBls).toBe('string');
      expect(Array.isArray(summaries[0].publisherEth)).toBe(true);
      expect(summaries[0].publisherEth!.length).toBe(1);
    });

    it('creates multiple publishers when requested', async () => {
      const { validators, summaries } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 3,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const v = validators[0] as any;
      expect(Array.isArray(v.publisher)).toBe(true);
      expect(v.publisher.length).toBe(3);
      expect(summaries[0].publisherEth!.length).toBe(3);
    });

    it('derives different BLS and ETH keys when account index changes', async () => {
      // Build with account index 0
      const { validators: v1, summaries: s1 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });

      // Build with account index 1, same address index
      const { validators: v2, summaries: s2 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 1,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });

      // Extract attesters
      const att1 = v1[0].attester as any;
      const att2 = v2[0].attester as any;

      // Assert ETH addresses are different
      expect(att1.eth).not.toEqual(att2.eth);
      expect(s1[0].attesterEth).not.toEqual(s2[0].attesterEth);

      // Assert BLS keys are different
      expect(att1.bls).toBeDefined();
      expect(att2.bls).toBeDefined();
      expect(att1.bls).not.toBe(att2.bls);
      expect(s1[0].attesterBls).not.toBe(s2[0].attesterBls);
    });

    it('derives different BLS and ETH keys when address index changes', async () => {
      // Build with address index 0
      const { validators: v1, summaries: s1 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });

      // Build with address index 1, same account index
      const { validators: v2, summaries: s2 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 1,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });

      // Extract attesters
      const att1 = v1[0].attester as any;
      const att2 = v2[0].attester as any;

      // Assert ETH addresses are different
      expect(att1.eth).not.toEqual(att2.eth);
      expect(s1[0].attesterEth).not.toEqual(s2[0].attesterEth);

      // Assert BLS keys are different
      expect(att1.bls).toBeDefined();
      expect(att2.bls).toBeDefined();
      expect(att1.bls).not.toEqual(att2.bls);
      expect(s1[0].attesterBls).not.toEqual(s2[0].attesterBls);
    });

    it('uses attester address as coinbase when coinbase is not provided', async () => {
      const { validators, summaries } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
        // coinbase not provided
      });

      expect(validators.length).toBe(1);
      expect(summaries.length).toBe(1);

      const validator = validators[0];
      const summary = summaries[0];

      // Coinbase should equal the attester ETH address
      expect(validator.coinbase).toBe(summary.attesterEth);
      expect(validator.coinbase).toBeDefined();
    });

    it('uses provided coinbase when explicitly set', async () => {
      const customCoinbase = '0x1234567890123456789012345678901234567890' as any;
      const { validators, summaries } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
        coinbase: customCoinbase,
      });

      expect(validators.length).toBe(1);
      const validator = validators[0];

      // Coinbase should be the custom value, not the attester address
      expect(validator.coinbase).toBe(customCoinbase);
      expect(validator.coinbase).not.toBe(summaries[0].attesterEth);
    });
  });

  describe('keystore output path resolution and writing', () => {
    it('resolves explicit file path relative to provided dataDir', async () => {
      const { outputPath, resolvedDir } = await resolveKeystoreOutputPath(tmp, 'keys.json');
      expect(outputPath).toBe(join(tmp, 'keys.json'));
      expect(resolvedDir).toBe(tmp);
    });

    it('finds the next available keyN.json when file is omitted', async () => {
      // pre-create key1.json to force selection of key2.json
      const first = join(tmp, 'key1.json');
      writeFileSync(first, '{}', { encoding: 'utf-8' });
      const { outputPath } = await resolveKeystoreOutputPath(tmp);
      expect(outputPath.endsWith('key2.json')).toBe(true);
    });

    it('writes a keystore file with pretty JSON', async () => {
      const path = join(tmp, 'out.json');
      const obj = { schemaVersion: 1, validators: [] };
      await writeKeystoreFile(path, obj);
      const raw = readFileSync(path, 'utf-8');
      expect(JSON.parse(raw)).toEqual(obj);
    });
  });

  describe('summary and json logging helpers', () => {
    it('prints summaries with expected structure', () => {
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      const summaries = [
        {
          attesterEth: '0xaaaa',
          attesterBls: '0x1111',
          publisherEth: ['0xpub1', '0xpub2'],
        },
      ];
      logValidatorSummaries(log, summaries);
      expect(logs.length).toBe(1);
      const out = logs[0];
      expect(out).toContain('acc1:');
      expect(out).toContain('attester:');
      expect(out).toContain('eth: 0xaaaa');
      expect(out).toContain('bls: 0x1111');
      expect(out).toContain('- 0xpub1');
      expect(out).toContain('- 0xpub2');
    });
  });

  describe('validatePublisherOptions', () => {
    const validPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const validPrivateKeyWith0x = '0x' + validPrivateKey;

    it('accepts valid publisher private key with 0x prefix', () => {
      const options = { publishers: [validPrivateKeyWith0x] };
      expect(() => validatePublisherOptions(options)).not.toThrow();
      expect(options.publishers).toEqual([validPrivateKeyWith0x]);
    });

    it('accepts valid publisher private key without 0x prefix and normalizes it', () => {
      const options = { publishers: [validPrivateKey] };
      expect(() => validatePublisherOptions(options)).not.toThrow();
      expect(options.publishers).toEqual([validPrivateKeyWith0x]);
    });

    it('throws when publisher private key is too short', () => {
      const options = { publishers: ['0x1234'] };
      expect(() => validatePublisherOptions(options)).toThrow(/Invalid publisher private key/);
    });

    it('throws when publisher private key is too long', () => {
      const options = { publishers: ['0x' + validPrivateKey + 'ff'] };
      expect(() => validatePublisherOptions(options)).toThrow(/Invalid publisher private key/);
    });

    it('throws when publisher private key contains invalid characters', () => {
      const options = { publishers: ['0x' + validPrivateKey.slice(0, -2) + 'zz'] };
      expect(() => validatePublisherOptions(options)).toThrow(/Invalid publisher private key/);
    });

    it('throws when both publishers and publisherCount are provided', () => {
      const options = { publishers: [validPrivateKeyWith0x], publisherCount: 2 };
      expect(() => validatePublisherOptions(options)).toThrow(
        /--publishers and --publisher-count cannot be used together/,
      );
    });

    it('allows publisherCount without publishers', () => {
      const options = { publisherCount: 2 };
      expect(() => validatePublisherOptions(options)).not.toThrow();
    });

    it('allows neither publishers nor publisherCount', () => {
      const options = {};
      expect(() => validatePublisherOptions(options)).not.toThrow();
    });

    it('accepts multiple publishers and normalizes them', () => {
      const validPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const validPrivateKeyWith0x = '0x' + validPrivateKey;
      const anotherKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const anotherKeyWith0x = '0x' + anotherKey;
      const options = { publishers: [validPrivateKey, anotherKey] };
      expect(() => validatePublisherOptions(options)).not.toThrow();
      expect(options.publishers).toEqual([validPrivateKeyWith0x, anotherKeyWith0x]);
    });
  });

  describe('newValidatorKeystore', () => {
    it('creates a keystore file and logs a summary', async () => {
      const path = join(tmp, 'created.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'created.json',
          count: 2,
          publisherCount: 1,
          mnemonic: TEST_MNEMONIC,
          feeRecipient: ('0x' + '44'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );
      expect(existsSync(path)).toBe(true);
      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.schemaVersion).toBe(1);
      expect(Array.isArray(keystore.validators)).toBe(true);
      expect(keystore.validators?.length).toBe(2);
      // Should log a summary and a write message
      expect(logs.some(l => l.includes('Wrote validator keystore'))).toBe(true);
      expect(logs.some(l => l.includes('acc1:'))).toBe(true);
    });

    it('requires mnemonic when using a remote signer', async () => {
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await expect(
        newValidatorKeystore(
          {
            dataDir: tmp,
            file: 'no-mnemonic.json',
            count: 1,
            publisherCount: 0,
            // no mnemonic on purpose
            remoteSigner: 'http://localhost:9000',
            feeRecipient: ('0x' + '55'.repeat(32)) as unknown as AztecAddress,
          },
          log,
        ),
      ).rejects.toThrow(/Using --remote-signer requires a deterministic key source/);
    });

    it('writes keys to files when password is provided', async () => {
      const path = join(tmp, 'created-files.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'created-files.json',
          count: 1,
          publisherCount: 1,
          mnemonic: TEST_MNEMONIC,
          password: '',
          encryptedKeystoreDir: tmp,
          feeRecipient: ('0x' + '77'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );
      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.validators).toBeDefined();
      const v = keystore.validators![0];
      // attester may be plain object or contain eth+bls
      const att = typeof v.attester === 'object' && 'eth' in v.attester ? v.attester : { eth: v.attester };
      expect(typeof (att.eth as any).path).toBe('string');
      if ('bls' in att && att.bls) {
        expect(typeof (att.bls as any).path).toBe('string');
      }
    });

    it('creates BN254 encrypted keystores that can be loaded and decrypted', async () => {
      const path = join(tmp, 'bn254-keystore-integration.json');
      const password = 'test-password-123';
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);

      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'bn254-keystore-integration.json',
          count: 1,
          publisherCount: 0,
          mnemonic: TEST_MNEMONIC,
          password,
          encryptedKeystoreDir: tmp,
          feeRecipient: ('0x' + 'ee'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );

      // Load the keystore with schema validation
      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.validators).toBeDefined();
      expect(keystore.validators!.length).toBe(1);

      const validator = keystore.validators![0];
      expect(validator.attester).toBeDefined();

      // Should have ETH and BLS keys as encrypted file references
      const att = typeof validator.attester === 'object' && 'eth' in validator.attester ? validator.attester : null;
      expect(att).not.toBeNull();
      expect(att!.eth).toBeDefined();
      expect(att!.bls).toBeDefined();

      // Verify BLS key is a BN254 keystore reference
      const blsConfig = att!.bls as any;
      expect(blsConfig.path).toBeDefined();
      expect(blsConfig.password).toBe(password);

      // Actually decrypt the BLS keystore using node-keystore's BN254 keystore decryption
      const decryptedBlsKey = decryptBn254Keystore(blsConfig.path, password);
      expect(decryptedBlsKey).toBeDefined();
      expect(decryptedBlsKey).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify we can compute the public key from the decrypted private key
      const pubkey = await computeBlsPublicKeyCompressed(decryptedBlsKey);
      expect(pubkey).toBeDefined();
      expect(pubkey).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it('accepts publishers option with 0x prefix', async () => {
      const path = join(tmp, 'with-publisher.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      const publisherKey: string = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'with-publisher.json',
          count: 1,
          publishers: [publisherKey],
          mnemonic: TEST_MNEMONIC,
          feeRecipient: ('0x' + 'ff'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );

      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.validators).toBeDefined();
      expect(keystore.validators!.length).toBe(1);
      const validator = keystore.validators![0];
      expect(validator.publisher).toBe(publisherKey);
    });

    it('accepts publishers option without 0x prefix and normalizes it', async () => {
      const path = join(tmp, 'with-publisher-no-prefix.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      const publisherKeyNoPrefix: string = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const expectedKey = '0x' + publisherKeyNoPrefix;

      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'with-publisher-no-prefix.json',
          count: 2,
          publishers: [publisherKeyNoPrefix],
          mnemonic: TEST_MNEMONIC,
          feeRecipient: ('0x' + 'dd'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );

      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.validators).toBeDefined();
      expect(keystore.validators!.length).toBe(2);
      // Both validators should have the same normalized publisher
      expect(keystore.validators![0].publisher).toBe(expectedKey);
      expect(keystore.validators![1].publisher).toBe(expectedKey);
    });

    it('rejects invalid publisher private key', async () => {
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      const invalidPublisherKey: string = '0x123'; // Too short

      await expect(
        newValidatorKeystore(
          {
            dataDir: tmp,
            file: 'invalid-publisher.json',
            count: 1,
            publishers: [invalidPublisherKey],
            mnemonic: TEST_MNEMONIC,
            feeRecipient: ('0x' + 'cc'.repeat(32)) as unknown as AztecAddress,
          },
          log,
        ),
      ).rejects.toThrow(/Invalid publisher private key/);
    });

    it('creates keystore with multiple publishers for all validators', async () => {
      const path = join(tmp, 'with-multiple-publishers.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      const publisherKey1: string = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const publisherKey2: string = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      await newValidatorKeystore(
        {
          dataDir: tmp,
          file: 'with-multiple-publishers.json',
          count: 1,
          publishers: [publisherKey1, publisherKey2],
          mnemonic: TEST_MNEMONIC,
          feeRecipient: ('0x' + 'ee'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );

      const keystore: KeyStore = loadKeystoreFile(path);
      expect(keystore.validators).toBeDefined();
      expect(keystore.validators!.length).toBe(1);
      const validator = keystore.validators![0];
      expect(Array.isArray(validator.publisher)).toBe(true);
      expect(validator.publisher).toEqual([publisherKey1, publisherKey2]);
    });
  });

  describe('materialization helpers (invoked directly)', () => {
    it('replaces plaintext keys with file references', async () => {
      const validators = [
        { attester: '0x' + 'aa'.repeat(32), feeRecipient: ('0x' + '99'.repeat(32)) as unknown as AztecAddress },
        {
          attester: { eth: '0x' + 'bb'.repeat(32), bls: '0x' + 'cc'.repeat(32) },
          feeRecipient: ('0x' + '88'.repeat(32)) as unknown as AztecAddress,
        },
      ] as any;
      const dirA = mkdtempSync(join(tmpdir(), 'aztec-mat-a-'));
      await writeEthJsonV3ToFile(validators, { outDir: dirA, password: '' });
      await writeBlsBn254ToFile(validators, { outDir: dirA, password: '' });
      const a0 = validators[0] as any;
      const a1 = validators[1] as any;
      expect(typeof a0.attester.path === 'string' || typeof a0.attester.eth?.path === 'string').toBeTruthy();
      expect(typeof a1.attester.eth.path).toBe('string');
      expect(typeof a1.attester.bls.path).toBe('string');
      rmSync(dirA, { recursive: true, force: true });
    });
  });

  describe('addValidatorKeys', () => {
    it('appends validators to an existing keystore', async () => {
      const existing = join(tmp, 'existing.json');
      const baseKeystore = {
        schemaVersion: 1,
        validators: [
          {
            attester: '0x' + 'aa'.repeat(32),
            feeRecipient: ('0x' + '66'.repeat(32)) as unknown as AztecAddress,
          },
        ],
      } as any;
      writeFileSync(existing, JSON.stringify(baseKeystore, null, 2), 'utf-8');

      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await addValidatorKeys(
        existing,
        {
          dataDir: tmp,
          count: 2,
          mnemonic: TEST_MNEMONIC,
          feeRecipient: ('0x' + '66'.repeat(32)) as unknown as AztecAddress,
        },
        log,
      );

      const updated: KeyStore = loadKeystoreFile(existing);
      expect(updated.validators?.length).toBe(3);
      expect(logs.some(l => l.includes('Updated keystore'))).toBe(true);
      expect(logs.some(l => l.includes('acc1:'))).toBe(true);
    });

    it('throws if keystore schema validation fails', async () => {
      const missing = join(tmp, 'missing-fee.json');
      const badKeystore = { schemaVersion: 1, validators: [{}] } as any;
      writeFileSync(missing, JSON.stringify(badKeystore, null, 2), 'utf-8');
      await expect(
        addValidatorKeys(
          missing,
          {
            dataDir: tmp,
            count: 1,
            mnemonic: TEST_MNEMONIC,
            // no feeRecipient provided and none in file
          } as any,
          () => {},
        ),
      ).rejects.toThrow('Schema validation failed');
    });
  });

  describe('generateBlsKeypair', () => {
    it('writes to file and logs a write message when out is provided', async () => {
      const out = join(tmp, 'bls.json');
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await generateBlsKeypair({ mnemonic: TEST_MNEMONIC, out }, log);
      expect(existsSync(out)).toBe(true);
      expect(logs.some(l => l.includes('Wrote BLS keypair to'))).toBe(true);
      const obj = JSON.parse(readFileSync(out, 'utf-8')) as any;
      expect(obj).toHaveProperty('privateKey');
      expect(obj).toHaveProperty('publicKey');
      expect(obj.path).toBe('m/12381/3600/0/0/0');
    });

    it('logs JSON output when no out path is provided', async () => {
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await generateBlsKeypair({ mnemonic: TEST_MNEMONIC }, log);
      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed).toHaveProperty('privateKey');
      expect(parsed).toHaveProperty('publicKey');
    });
  });

  describe('newValidatorKeystore with staker-output', () => {
    it('requires gse-address when staker-output is enabled', async () => {
      const logs: string[] = [];
      const log = (s: string) => logs.push(s);
      await expect(
        newValidatorKeystore(
          {
            dataDir: tmp,
            file: 'staker-test.json',
            count: 1,
            mnemonic: TEST_MNEMONIC,
            feeRecipient: ('0x' + '44'.repeat(32)) as unknown as AztecAddress,
            stakerOutput: true,
            // Missing gseAddress
            l1RpcUrls: ['http://localhost:8545'],
            l1ChainId: 31337,
          },
          log,
        ),
      ).rejects.toThrow(/--gse-address is required/);
    });
  });
});
