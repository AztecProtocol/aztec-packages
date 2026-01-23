import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  Bn254KeystoreError,
  createBn254Keystore,
  decryptBn254Keystore,
  decryptBn254KeystoreFromObject,
  loadBn254Keystore,
} from './bn254_keystore.js';

describe('BN254 Keystore', () => {
  const testPrivateKey = '0x' + '42'.repeat(32); // 32-byte test private key
  const testPublicKey = '0x' + 'ab'.repeat(33); // Compressed public key
  const testPath = 'm/12381/3600/0/0/0';
  const testPassword = 'test-password-123';

  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bn254-keystore-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createBn254Keystore', () => {
    it('creates a valid BN254 keystore structure', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);

      expect(keystore.version).toBe(4);
      expect(keystore.path).toBe(testPath);
      expect(keystore.pubkey).toBe(testPublicKey);
      expect(keystore.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      expect(keystore.crypto.kdf.function).toBe('pbkdf2');
      expect(keystore.crypto.kdf.params.dklen).toBe(32);
      expect(keystore.crypto.kdf.params.c).toBe(262144);
      expect(keystore.crypto.kdf.params.prf).toBe('hmac-sha256');
      expect(keystore.crypto.kdf.params.salt).toMatch(/^[0-9a-f]{64}$/);

      expect(keystore.crypto.cipher.function).toBe('aes-128-ctr');
      expect(keystore.crypto.cipher.params.iv).toMatch(/^[0-9a-f]{32}$/);
      expect(keystore.crypto.cipher.message).toMatch(/^[0-9a-f]{64}$/);

      expect(keystore.crypto.checksum.function).toBe('sha256');
      expect(keystore.crypto.checksum.message).toMatch(/^[0-9a-f]{64}$/);
    });

    it('encrypts the private key so it can be decrypted', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);

      // Derive the decryption key using the same KDF
      const salt = Buffer.from(keystore.crypto.kdf.params.salt, 'hex');
      const dk = pbkdf2Sync(
        Buffer.from(testPassword.normalize('NFKD'), 'utf8'),
        salt,
        keystore.crypto.kdf.params.c,
        keystore.crypto.kdf.params.dklen,
        'sha256',
      );
      const cipherKey = dk.subarray(0, 16);

      // Decrypt the ciphertext
      const iv = Buffer.from(keystore.crypto.cipher.params.iv, 'hex');
      const ciphertext = Buffer.from(keystore.crypto.cipher.message, 'hex');
      const decipher = createDecipheriv('aes-128-ctr', cipherKey, iv);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      // Verify it matches the original private key (without 0x prefix)
      expect('0x' + decrypted.toString('hex')).toBe(testPrivateKey);
    });

    it('produces different ciphertexts for the same key with different passwords', () => {
      const keystore1 = createBn254Keystore('password1', testPrivateKey, testPublicKey, testPath);
      const keystore2 = createBn254Keystore('password2', testPrivateKey, testPublicKey, testPath);

      expect(keystore1.crypto.cipher.message).not.toBe(keystore2.crypto.cipher.message);
      expect(keystore1.crypto.checksum.message).not.toBe(keystore2.crypto.checksum.message);
    });

    it('produces different ciphertexts on each call due to random salt and IV', () => {
      const keystore1 = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      const keystore2 = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);

      expect(keystore1.crypto.kdf.params.salt).not.toBe(keystore2.crypto.kdf.params.salt);
      expect(keystore1.crypto.cipher.params.iv).not.toBe(keystore2.crypto.cipher.params.iv);
      expect(keystore1.crypto.cipher.message).not.toBe(keystore2.crypto.cipher.message);
    });

    it('accepts private keys with or without 0x prefix', () => {
      const withPrefix = createBn254Keystore(testPassword, '0x' + '42'.repeat(32), testPublicKey, testPath);
      const withoutPrefix = createBn254Keystore(testPassword, '42'.repeat(32), testPublicKey, testPath);

      // Both should produce valid keystores with same length ciphertext
      expect(withPrefix.crypto.cipher.message.length).toBe(64);
      expect(withoutPrefix.crypto.cipher.message.length).toBe(64);
    });

    it('stores public key without 0x prefix in description field', () => {
      const pubkeyWithPrefix = '0x' + 'ab'.repeat(33);
      const keystore = createBn254Keystore(testPassword, testPrivateKey, pubkeyWithPrefix, testPath);

      expect(keystore.description).toBe('ab'.repeat(33));
      expect(keystore.pubkey).toBe(pubkeyWithPrefix);
    });

    it('throws error for invalid private key length', () => {
      const shortKey = '0x1234';
      expect(() => createBn254Keystore(testPassword, shortKey, testPublicKey, testPath)).toThrow(
        'BLS private key must be 32-byte hex',
      );

      const longKey = '0x' + '42'.repeat(33);
      expect(() => createBn254Keystore(testPassword, longKey, testPublicKey, testPath)).toThrow(
        'BLS private key must be 32-byte hex',
      );
    });

    it('throws error for non-hex private key', () => {
      const invalidKey = '0xGGGG' + '42'.repeat(30);
      expect(() => createBn254Keystore(testPassword, invalidKey, testPublicKey, testPath)).toThrow(
        'BLS private key must be 32-byte hex',
      );
    });

    it('normalizes password using NFKD', () => {
      // Password with combining characters
      const password = 'café'; // é can be represented as single char or e + combining accent
      const keystore = createBn254Keystore(password, testPrivateKey, testPublicKey, testPath);

      // Should successfully create keystore (normalization happens internally)
      expect(keystore).toBeDefined();
      expect(keystore.version).toBe(4);
    });

    it('handles empty password', () => {
      const keystore = createBn254Keystore('', testPrivateKey, testPublicKey, testPath);

      expect(keystore).toBeDefined();
      expect(keystore.crypto.cipher.message).toMatch(/^[0-9a-f]{64}$/);
    });

    it('preserves derivation path exactly as provided', () => {
      const customPath = 'm/12381/3600/99/88/77';
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, customPath);

      expect(keystore.path).toBe(customPath);
    });
  });

  describe('loadBn254Keystore', () => {
    it('loads and validates a valid BN254 keystore file', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      const filePath = join(tempDir, 'valid-keystore.json');
      writeFileSync(filePath, JSON.stringify(keystore));

      const loaded = loadBn254Keystore(filePath);

      expect(loaded.version).toBe(4);
      expect(loaded.path).toBe(testPath);
      expect(loaded.pubkey).toBe(testPublicKey);
      expect(loaded.crypto.kdf.function).toBe('pbkdf2');
      expect(loaded.crypto.cipher.function).toBe('aes-128-ctr');
    });

    it('throws on invalid JSON', () => {
      const filePath = join(tempDir, 'invalid-json.json');
      writeFileSync(filePath, 'not valid json {{{');

      expect(() => loadBn254Keystore(filePath)).toThrow(Bn254KeystoreError);
      expect(() => loadBn254Keystore(filePath)).toThrow(/Invalid JSON/);
    });

    it('throws on invalid keystore structure', () => {
      const filePath = join(tempDir, 'invalid-structure.json');
      writeFileSync(filePath, JSON.stringify({ foo: 'bar' }));

      expect(() => loadBn254Keystore(filePath)).toThrow(Bn254KeystoreError);
      expect(() => loadBn254Keystore(filePath)).toThrow(/Invalid BN254 keystore format/);
    });

    it('throws on missing file', () => {
      const nonExistentPath = join(tempDir, 'does-not-exist.json');

      expect(() => loadBn254Keystore(nonExistentPath)).toThrow(Bn254KeystoreError);
    });
  });

  describe('decryptBn254Keystore', () => {
    it('successfully decrypts a keystore with correct password', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      const filePath = join(tempDir, 'decrypt-test.json');
      writeFileSync(filePath, JSON.stringify(keystore));

      const decrypted = decryptBn254Keystore(filePath, testPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('throws on incorrect password', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      const filePath = join(tempDir, 'wrong-password-test.json');
      writeFileSync(filePath, JSON.stringify(keystore));

      expect(() => decryptBn254Keystore(filePath, 'wrong-password')).toThrow(Bn254KeystoreError);
      expect(() => decryptBn254Keystore(filePath, 'wrong-password')).toThrow(/Checksum verification failed/);
    });

    it('works with empty password if keystore was created with empty password', () => {
      const emptyPassword = '';
      const keystore = createBn254Keystore(emptyPassword, testPrivateKey, testPublicKey, testPath);
      const filePath = join(tempDir, 'empty-password-test.json');
      writeFileSync(filePath, JSON.stringify(keystore));

      const decrypted = decryptBn254Keystore(filePath, emptyPassword);

      expect(decrypted).toBe(testPrivateKey);
    });
  });

  describe('decryptBn254KeystoreFromObject', () => {
    it('decrypts from an in-memory keystore object', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);

      const decrypted = decryptBn254KeystoreFromObject(keystore, testPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('throws on unsupported KDF function', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      // Manually modify to unsupported KDF
      (keystore.crypto.kdf as any).function = 'scrypt';

      expect(() => decryptBn254KeystoreFromObject(keystore, testPassword)).toThrow(Bn254KeystoreError);
      expect(() => decryptBn254KeystoreFromObject(keystore, testPassword)).toThrow(/Unsupported KDF function/);
    });

    it('throws on unsupported cipher function', () => {
      const keystore = createBn254Keystore(testPassword, testPrivateKey, testPublicKey, testPath);
      // Manually modify to unsupported cipher
      (keystore.crypto.cipher as any).function = 'aes-256-gcm';

      expect(() => decryptBn254KeystoreFromObject(keystore, testPassword)).toThrow(Bn254KeystoreError);
      expect(() => decryptBn254KeystoreFromObject(keystore, testPassword)).toThrow(/Unsupported cipher function/);
    });
  });

  describe('round-trip encryption and decryption', () => {
    it('encrypts and then decrypts to get original key', () => {
      const originalKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const password = 'super-secret';
      const pubkey = '0x' + 'ff'.repeat(33);
      const path = 'm/12381/3600/5/0/0';

      // Create encrypted keystore
      const encrypted = createBn254Keystore(password, originalKey, pubkey, path);

      // Decrypt it
      const decrypted = decryptBn254KeystoreFromObject(encrypted, password);

      expect(decrypted).toBe(originalKey);
    });

    it('round-trips multiple different keys', () => {
      const testCases = [
        { key: '0x' + '11'.repeat(32), password: 'pass1' },
        { key: '0x' + '22'.repeat(32), password: 'pass2' },
        { key: '0x' + 'ab'.repeat(32), password: 'pass3' },
      ];

      for (const { key, password } of testCases) {
        const encrypted = createBn254Keystore(password, key, testPublicKey, testPath);
        const decrypted = decryptBn254KeystoreFromObject(encrypted, password);
        expect(decrypted).toBe(key);
      }
    });
  });
});
