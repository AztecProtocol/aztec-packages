import { bn254 } from '@noble/curves/bn254';

import { Fr } from '../../fields/fields.js';
import {
  compressBn254G1Point,
  computeBn254G1PublicKey,
  computeBn254G1PublicKeyCompressed,
  computeBn254G2PublicKey,
  decompressBn254G1Point,
  deriveBlsKeyFromMnemonic,
  isOnBn254Curve,
} from './index.js';

describe('BN254 Point Operations', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const path = 'm/12381/3600/0/0/0';

  describe('computeBn254G1PublicKey', () => {
    it('generates valid G1 public keys from private keys', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G1PublicKey(sk);

      // Should be valid coordinates
      expect(pk.x).toBeGreaterThan(0n);
      expect(pk.y).toBeGreaterThan(0n);

      // Should be on curve
      expect(isOnBn254Curve(pk)).toBe(true);
    });

    it('matches noble/curves library output', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G1PublicKey(sk);

      // Verify using noble/curves
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;
      const expected = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      expect(pk.x).toBe(expected.x);
      expect(pk.y).toBe(expected.y);
    });

    it('generates different keys for different inputs', () => {
      const sk1 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/0/0/0', '');
      const sk2 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/1/0/0', '');

      const pk1 = computeBn254G1PublicKey(sk1);
      const pk2 = computeBn254G1PublicKey(sk2);

      expect(pk1.x).not.toBe(pk2.x);
      expect(pk1.y).not.toBe(pk2.y);
    });
  });

  describe('computeBn254G2PublicKey', () => {
    it('generates valid G2 public keys', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G2PublicKey(sk);

      // Should have valid coordinates
      expect(pk.x.c0).toBeGreaterThan(0n);
      expect(pk.x.c1).toBeGreaterThan(0n);
      expect(pk.y.c0).toBeGreaterThan(0n);
      expect(pk.y.c1).toBeGreaterThan(0n);
    });

    it('matches noble/curves library output', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G2PublicKey(sk);

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
    it('compresses a G1 point to 32 bytes', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const compressed = computeBn254G1PublicKeyCompressed(sk);

      // Should be 0x + 64 hex chars = 32 bytes
      expect(compressed).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('round-trips compression and decompression', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const original = computeBn254G1PublicKey(sk);

      // Compress and decompress
      const compressed = compressBn254G1Point(original);
      const decompressed = decompressBn254G1Point(compressed);

      expect(decompressed.x).toBe(original.x);
      expect(decompressed.y).toBe(original.y);
    });

    it('handles multiple keys correctly', () => {
      for (let i = 0; i < 10; i++) {
        const sk = deriveBlsKeyFromMnemonic(mnemonic, `m/12381/3600/${i}/0/0`, '');
        const original = computeBn254G1PublicKey(sk);

        const compressed = compressBn254G1Point(original);
        const decompressed = decompressBn254G1Point(compressed);

        expect(decompressed.x).toBe(original.x);
        expect(decompressed.y).toBe(original.y);
        expect(isOnBn254Curve(decompressed)).toBe(true);
      }
    });

    it('decompressed points are on the curve', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const compressed = computeBn254G1PublicKeyCompressed(sk);
      const decompressed = decompressBn254G1Point(compressed);

      expect(isOnBn254Curve(decompressed)).toBe(true);
    });

    it('correctly handles y parity in compression', () => {
      // Test both even and odd y coordinates
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G1PublicKey(sk);
      const compressed = compressBn254G1Point(pk);

      // Check if MSB is set based on y parity
      const bytes = Buffer.from(compressed.replace(/^0x/i, ''), 'hex');
      const msbSet = (bytes[0] & 0x80) !== 0;
      const yIsOdd = (pk.y & 1n) === 1n;

      expect(msbSet).toBe(yIsOdd);
    });

    it('throws on invalid compressed input length', () => {
      expect(() => decompressBn254G1Point('0x1234')).toThrow('must be 32 bytes');
      expect(() => decompressBn254G1Point('0x' + '00'.repeat(31))).toThrow('must be 32 bytes');
      expect(() => decompressBn254G1Point('0x' + '00'.repeat(33))).toThrow('must be 32 bytes');
    });

    it('throws on x-coordinate out of field range', () => {
      // Create a compressed point with x >= field order
      const tooLarge = '0x' + 'ff'.repeat(32);
      expect(() => decompressBn254G1Point(tooLarge)).toThrow('out of field range');
    });
  });

  describe('isOnBn254Curve', () => {
    it('returns true for valid points', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = computeBn254G1PublicKey(sk);

      expect(isOnBn254Curve(pk)).toBe(true);
    });

    it('returns true for generator point', () => {
      const generator = { x: 1n, y: 2n };
      expect(isOnBn254Curve(generator)).toBe(true);
    });

    it('returns false for invalid points', () => {
      const invalid = { x: 1n, y: 1n }; // Not on curve
      expect(isOnBn254Curve(invalid)).toBe(false);
    });

    it('returns false for random points', () => {
      const random = {
        x: 12345678901234567890n,
        y: 98765432109876543210n,
      };
      // This point is almost certainly not on the curve
      expect(isOnBn254Curve(random)).toBe(false);
    });
  });

  describe('Integration with key derivation', () => {
    it('derives consistent keys across multiple calls', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk1 = computeBn254G1PublicKeyCompressed(sk);
      const pk2 = computeBn254G1PublicKeyCompressed(sk);

      expect(pk1).toBe(pk2);
    });

    it('produces valid Fr scalars', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const fr = Fr.fromHexString(sk);

      expect(fr.isZero()).toBe(false);
      expect(fr.toBigInt()).toBeLessThan(bn254.fields.Fr.ORDER);
    });

    it('generates keys that work with noble/curves', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const ourPk = computeBn254G1PublicKey(sk);

      // Verify with noble/curves
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;
      const noblePk = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      expect(ourPk.x).toBe(noblePk.x);
      expect(ourPk.y).toBe(noblePk.y);
    });
  });

  describe('Edge Cases', () => {
    it('handles private key at field boundary', () => {
      // Use a key very close to the field order
      const sk = '0x' + (bn254.fields.Fr.ORDER - 1n).toString(16).padStart(64, '0');
      const pk = computeBn254G1PublicKey(sk);

      expect(isOnBn254Curve(pk)).toBe(true);
    });

    it('handles small private keys', () => {
      const sk = '0x' + '01'.padStart(64, '0');
      const pk = computeBn254G1PublicKey(sk);

      // Should equal the generator
      expect(pk.x).toBe(1n);
      expect(pk.y).toBe(2n);
    });

    it('compresses and decompresses the generator correctly', () => {
      const generator = { x: 1n, y: 2n };
      const compressed = compressBn254G1Point(generator);
      const decompressed = decompressBn254G1Point(compressed);

      expect(decompressed.x).toBe(1n);
      expect(decompressed.y).toBe(2n);
    });
  });
});
