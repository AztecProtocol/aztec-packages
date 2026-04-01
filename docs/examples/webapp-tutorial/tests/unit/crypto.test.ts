import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSessionKeys,
  encrypt,
  decrypt,
  hashToEmoji,
  DEFAULT_EMOJI_GRID_SIZE,
} from '@aztec/wallet-sdk/crypto';

describe('crypto', () => {
  describe('ECDH key pair generation + export/import roundtrip', () => {
    it('generates a key pair with public and private keys', async () => {
      const keyPair = await generateKeyPair();
      expect(keyPair.publicKey).toBeInstanceOf(CryptoKey);
      expect(keyPair.privateKey).toBeInstanceOf(CryptoKey);
    });

    it('exports and re-imports a public key', async () => {
      const keyPair = await generateKeyPair();
      const exported = await exportPublicKey(keyPair.publicKey);

      expect(exported.kty).toBe('EC');
      expect(exported.crv).toBe('P-256');
      expect(typeof exported.x).toBe('string');
      expect(typeof exported.y).toBe('string');

      const imported = await importPublicKey(exported);
      expect(imported).toBeInstanceOf(CryptoKey);

      // Re-export should produce same JWK
      const reExported = await exportPublicKey(imported);
      expect(reExported).toEqual(exported);
    });
  });

  describe('deriveSessionKeys — matching verificationHash', () => {
    it('both parties derive matching verificationHash', async () => {
      const appKeyPair = await generateKeyPair();
      const walletKeyPair = await generateKeyPair();

      const appSession = await deriveSessionKeys(
        appKeyPair,
        walletKeyPair.publicKey,
        true, // isApp
      );
      const walletSession = await deriveSessionKeys(
        walletKeyPair,
        appKeyPair.publicKey,
        false, // isApp (wallet side)
      );

      expect(appSession.verificationHash).toBe(walletSession.verificationHash);
      expect(typeof appSession.verificationHash).toBe('string');
      expect(appSession.verificationHash.length).toBeGreaterThan(0);
    });

    it('different key pairs produce different verificationHashes', async () => {
      const a = await generateKeyPair();
      const b = await generateKeyPair();
      const c = await generateKeyPair();

      const sessionAB = await deriveSessionKeys(a, b.publicKey, true);
      const sessionAC = await deriveSessionKeys(a, c.publicKey, true);

      expect(sessionAB.verificationHash).not.toBe(sessionAC.verificationHash);
    });
  });

  describe('AES-GCM encrypt/decrypt roundtrip', () => {
    it('encrypts and decrypts data correctly', async () => {
      const appKeyPair = await generateKeyPair();
      const walletKeyPair = await generateKeyPair();

      const appSession = await deriveSessionKeys(
        appKeyPair,
        walletKeyPair.publicKey,
        true,
      );
      const walletSession = await deriveSessionKeys(
        walletKeyPair,
        appKeyPair.publicKey,
        false,
      );

      const message = { hello: 'world', count: 42 };
      const encrypted = await encrypt(appSession.encryptionKey, JSON.stringify(message));

      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.ciphertext).toBe('string');

      // Decrypt with the other party's key
      const decrypted = await decrypt<typeof message>(walletSession.encryptionKey, encrypted);
      expect(decrypted).toEqual(message);
    });

    it('decrypt with wrong key throws', async () => {
      const appKeyPair = await generateKeyPair();
      const walletKeyPair = await generateKeyPair();
      const wrongKeyPair = await generateKeyPair();

      const appSession = await deriveSessionKeys(
        appKeyPair,
        walletKeyPair.publicKey,
        true,
      );
      // Derive keys with wrong peer
      const wrongSession = await deriveSessionKeys(
        wrongKeyPair,
        appKeyPair.publicKey,
        false,
      );

      const encrypted = await encrypt(appSession.encryptionKey, JSON.stringify({ secret: true }));

      await expect(decrypt(wrongSession.encryptionKey, encrypted)).rejects.toThrow();
    });
  });

  describe('hashToEmoji', () => {
    it('returns a string of emojis with default count', () => {
      const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const emojis = hashToEmoji(hash);
      // Default count is 9 emojis
      expect(emojis.length).toBeGreaterThan(0);
    });

    it('is deterministic — same hash produces same emojis', () => {
      const hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const first = hashToEmoji(hash);
      const second = hashToEmoji(hash);
      expect(first).toBe(second);
    });

    it('different hashes produce different emojis', () => {
      const hash1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const hash2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const emojis1 = hashToEmoji(hash1);
      const emojis2 = hashToEmoji(hash2);
      expect(emojis1).not.toBe(emojis2);
    });

    it('respects custom count parameter', () => {
      const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const emojis4 = hashToEmoji(hash, 4);
      const emojis9 = hashToEmoji(hash, DEFAULT_EMOJI_GRID_SIZE);
      // The 4-emoji version should be a prefix of the 9-emoji version
      // (each emoji is picked from successive bytes)
      expect(emojis4.length).toBeLessThan(emojis9.length);
    });
  });
});
