import { bn254 } from '@noble/curves/bn254';

import { Fr } from '../../fields/fields.js';
import {
  compressG1Point,
  computeG1PublicKey,
  computeG2PublicKey,
  decompressG1Point,
  isOnCurve,
} from '../bn254/index.js';
import { deriveBlsKeyFromMnemonic } from './index.js';

describe('BN254 Point Operations', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const path = 'm/12381/3600/0/0/0';

  describe('computeBn254G1PublicKey', () => {
    it('generates valid G1 public keys from private keys', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);

      // Should be valid coordinates
      expect(pk.x).toBeGreaterThan(0n);
      expect(pk.y).toBeGreaterThan(0n);

      // Should be on curve
      expect(await isOnCurve(pk)).toBe(true);
    });

    it('matches noble/curves library output', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);

      // Verify using noble/curves
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;
      const expected = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      expect(pk.x).toBe(expected.x);
      expect(pk.y).toBe(expected.y);
    });

    it('generates different keys for different inputs', async () => {
      const sk1 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/0/0/0', '');
      const sk2 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/1/0/0', '');

      const pk1 = await computeG1PublicKey(sk1);
      const pk2 = await computeG1PublicKey(sk2);

      expect(pk1.x).not.toBe(pk2.x);
      expect(pk1.y).not.toBe(pk2.y);
    });
  });

  describe('computeBn254G2PublicKey', () => {
    it('generates valid G2 public keys', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG2PublicKey(sk);

      // Should have valid coordinates
      expect(pk.x.c0).toBeGreaterThan(0n);
      expect(pk.x.c1).toBeGreaterThan(0n);
      expect(pk.y.c0).toBeGreaterThan(0n);
      expect(pk.y.c1).toBeGreaterThan(0n);
    });

    it('matches noble/curves library output', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG2PublicKey(sk);

      // Verify using noble/curves
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;
      const expected = bn254.G2.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      expect(pk.x.c0).toBe(expected.x.c0);
      expect(pk.x.c1).toBe(expected.x.c1);
      expect(pk.y.c0).toBe(expected.y.c0);
      expect(pk.y.c1).toBe(expected.y.c1);
    });
  });

  describe('Point Compression and Decompression', () => {
    it('compresses a G1 point to 32 bytes', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);
      const compressed = compressG1Point(pk);

      // Should be 0x + 64 hex chars = 32 bytes
      expect(compressed).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('round-trips compression and decompression', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const original = await computeG1PublicKey(sk);

      // Compress and decompress
      const compressed = compressG1Point(original);
      const decompressed = decompressG1Point(compressed);

      expect(decompressed.x).toBe(original.x);
      expect(decompressed.y).toBe(original.y);
    });

    it('handles multiple keys correctly', async () => {
      for (let i = 0; i < 10; i++) {
        const sk = deriveBlsKeyFromMnemonic(mnemonic, `m/12381/3600/${i}/0/0`, '');
        const original = await computeG1PublicKey(sk);

        const compressed = compressG1Point(original);
        const decompressed = decompressG1Point(compressed);

        expect(decompressed.x).toBe(original.x);
        expect(decompressed.y).toBe(original.y);
        expect(await isOnCurve(decompressed)).toBe(true);
      }
    });

    it('decompressed points are on the curve', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);
      const compressed = compressG1Point(pk);
      const decompressed = decompressG1Point(compressed);

      expect(await isOnCurve(decompressed)).toBe(true);
    });

    it('correctly handles y parity in compression', async () => {
      // Test both even and odd y coordinates
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);
      const compressed = compressG1Point(pk);

      // Check if MSB is set based on y parity
      const bytes = Buffer.from(compressed.replace(/^0x/i, ''), 'hex');
      const msbSet = (bytes[0] & 0x80) !== 0;
      const yIsOdd = (pk.y & 1n) === 1n;

      expect(msbSet).toBe(yIsOdd);
    });

    it('throws on invalid compressed input length', () => {
      expect(() => decompressG1Point('0x1234')).toThrow('must be 32 bytes');
      expect(() => decompressG1Point('0x' + '00'.repeat(31))).toThrow('must be 32 bytes');
      expect(() => decompressG1Point('0x' + '00'.repeat(33))).toThrow('must be 32 bytes');
    });

    it('throws on x-coordinate out of field range', () => {
      // Create a compressed point with x >= field order
      const tooLarge = '0x' + 'ff'.repeat(32);
      expect(() => decompressG1Point(tooLarge)).toThrow('out of field range');
    });
  });

  describe('isOnBn254Curve', () => {
    it('returns true for valid points', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeG1PublicKey(sk);

      expect(await isOnCurve(pk)).toBe(true);
    });

    it('returns true for generator point', async () => {
      const generator = { x: 1n, y: 2n };
      expect(await isOnCurve(generator)).toBe(true);
    });

    it('returns false for invalid points', async () => {
      const invalid = { x: 1n, y: 1n }; // Not on curve
      expect(await isOnCurve(invalid)).toBe(false);
    });

    it('returns false for random points', async () => {
      const random = {
        x: 12345678901234567890n,
        y: 98765432109876543210n,
      };
      // This point is almost certainly not on the curve
      expect(await isOnCurve(random)).toBe(false);
    });
  });

  describe('Integration with key derivation', () => {
    it('derives consistent keys across multiple calls', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk1 = await computeG1PublicKey(sk);
      const pk2 = await computeG1PublicKey(sk);
      const compressed1 = compressG1Point(pk1);
      const compressed2 = compressG1Point(pk2);

      expect(compressed1).toBe(compressed2);
    });

    it('produces valid Fr scalars', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const fr = Fr.fromHexString(sk);

      expect(fr.isZero()).toBe(false);
      expect(fr.toBigInt()).toBeLessThan(bn254.fields.Fr.ORDER);
    });

    it('generates keys that work with noble/curves', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const ourPk = await computeG1PublicKey(sk);

      // Verify with noble/curves
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;
      const noblePk = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      expect(ourPk.x).toBe(noblePk.x);
      expect(ourPk.y).toBe(noblePk.y);
    });
  });

  describe('Edge Cases', () => {
    it('handles private key at field boundary', async () => {
      // Use a key very close to the field order
      const sk = '0x' + (bn254.fields.Fr.ORDER - 1n).toString(16).padStart(64, '0');
      const pk = await computeG1PublicKey(sk);

      expect(await isOnCurve(pk)).toBe(true);
    });

    it('handles small private keys', async () => {
      const sk = '0x' + '01'.padStart(64, '0');
      const pk = await computeG1PublicKey(sk);

      // Should equal the generator
      expect(pk.x).toBe(1n);
      expect(pk.y).toBe(2n);
    });

    it('compresses and decompresses the generator correctly', () => {
      const generator = { x: 1n, y: 2n };
      const compressed = compressG1Point(generator);
      const decompressed = decompressG1Point(compressed);

      expect(decompressed.x).toBe(1n);
      expect(decompressed.y).toBe(2n);
    });
  });
});
