import { describe, expect, it } from '@jest/globals';
import { secp256k1 } from '@noble/curves/secp256k1';

import { Buffer32 } from '../../buffer/buffer32.js';
import { signMessageWithCustomK } from './custom_k_signing.js';
import { KValuePool } from './k_pool.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import { recoverAddress } from './utils.js';

describe('Custom K Signing', () => {
  describe('signMessageWithCustomK', () => {
    it('should create valid signatures with custom k values', () => {
      // Test that signatures can be verified
      const privateKey = Buffer32.random();
      const message = Buffer32.random();
      const kPool = new KValuePool(10);

      const signature = signMessageWithCustomK(message, privateKey.buffer, kPool.getK(0));

      // Verify signature is valid by recovering address
      const signer = new Secp256k1Signer(privateKey);
      const recoveredAddress = recoverAddress(message, signature);

      expect(recoveredAddress.equals(signer.address)).toBe(true);
    });

    it('should create different signatures for same message with different k', () => {
      const privateKey = Buffer32.random();
      const message = Buffer32.random();
      const kPool = new KValuePool(10);

      const sig1 = signMessageWithCustomK(message, privateKey.buffer, kPool.getK(0));
      const sig2 = signMessageWithCustomK(message, privateKey.buffer, kPool.getK(1));
      const sig3 = signMessageWithCustomK(message, privateKey.buffer, kPool.getK(2));

      // All signatures should be different
      expect(sig1.equals(sig2)).toBe(false);
      expect(sig2.equals(sig3)).toBe(false);
      expect(sig1.equals(sig3)).toBe(false);

      // But all should be valid
      const signer = new Secp256k1Signer(privateKey);
      expect(recoverAddress(message, sig1).equals(signer.address)).toBe(true);
      expect(recoverAddress(message, sig2).equals(signer.address)).toBe(true);
      expect(recoverAddress(message, sig3).equals(signer.address)).toBe(true);
    });

    it('should throw on invalid k values', () => {
      const privateKey = Buffer32.random();
      const message = Buffer32.random();

      // k = 0 (invalid)
      expect(() => signMessageWithCustomK(message, privateKey.buffer, 0n)).toThrow();

      // k = n (invalid, must be < n)
      const n = secp256k1.CURVE.n;
      expect(() => signMessageWithCustomK(message, privateKey.buffer, n)).toThrow();

      // k > n (invalid)
      expect(() => signMessageWithCustomK(message, privateKey.buffer, n + 1n)).toThrow();
    });

    it('should create signatures compatible with Ethereum format', () => {
      const privateKey = Buffer32.random();
      const message = Buffer32.random();
      const kPool = new KValuePool(5);

      const signature = signMessageWithCustomK(message, privateKey.buffer, kPool.getK(0));

      // Check v is in Ethereum format (27 or 28)
      expect(signature.v === 27 || signature.v === 28).toBe(true);

      // Check r and s are 32 bytes
      expect(signature.r.buffer.length).toBe(32);
      expect(signature.s.buffer.length).toBe(32);

      // Verify it can be recovered
      expect(() => recoverAddress(message, signature)).not.toThrow();
    });
  });
});
