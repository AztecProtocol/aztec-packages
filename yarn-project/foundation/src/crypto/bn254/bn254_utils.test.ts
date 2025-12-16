import { Fq, Fr } from '../../fields/fields.js';
import { deriveBlsKeyFromMnemonic } from '../bls/index.js';
import { computeBn254G1PublicKey, computeBn254G1PublicKeyCompressed, computeBn254G2PublicKey } from './bn254_utils.js';
import { Bn254G1Point } from './index.js';

describe('BN254 Point Operations', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const path = 'm/12381/3600/0/0/0';

  describe('computeBn254G1PublicKey', () => {
    it('generates valid G1 public keys from private keys', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeBn254G1PublicKey(sk);

      // Should be valid coordinates
      expect(pk.x).toBeGreaterThan(0n);
      expect(pk.y).toBeGreaterThan(0n);

      // Should be on curve
      const point = new Bn254G1Point(new Fq(pk.x), new Fq(pk.y));
      expect(await point.isOnCurve()).toBe(true);
    });

    it('generates consistent keys across multiple calls', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk1 = await computeBn254G1PublicKey(sk);
      const pk2 = await computeBn254G1PublicKey(sk);

      // Same private key should produce same public key
      expect(pk1.x).toBe(pk2.x);
      expect(pk1.y).toBe(pk2.y);
    });

    it('generates different keys for different inputs', async () => {
      const sk1 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/0/0/0', '');
      const sk2 = deriveBlsKeyFromMnemonic(mnemonic, 'm/12381/3600/1/0/0', '');

      const pk1 = await computeBn254G1PublicKey(sk1);
      const pk2 = await computeBn254G1PublicKey(sk2);

      expect(pk1.x).not.toBe(pk2.x);
      expect(pk1.y).not.toBe(pk2.y);
    });
  });

  describe('computeBn254G2PublicKey', () => {
    it('generates valid G2 public keys', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeBn254G2PublicKey(sk);

      // Should have valid coordinates
      expect(pk.x.c0).toBeGreaterThan(0n);
      expect(pk.x.c1).toBeGreaterThan(0n);
      expect(pk.y.c0).toBeGreaterThan(0n);
      expect(pk.y.c1).toBeGreaterThan(0n);
    });

    it('generates consistent keys across multiple calls', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk1 = await computeBn254G2PublicKey(sk);
      const pk2 = await computeBn254G2PublicKey(sk);

      // Same private key should produce same public key
      expect(pk1.x.c0).toBe(pk2.x.c0);
      expect(pk1.x.c1).toBe(pk2.x.c1);
      expect(pk1.y.c0).toBe(pk2.y.c0);
      expect(pk1.y.c1).toBe(pk2.y.c1);
    });
  });

  describe('Point Compression and Decompression', () => {
    it('compresses a G1 point to 32 bytes', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const compressed = await computeBn254G1PublicKeyCompressed(sk);

      // Should be 0x + 64 hex chars = 32 bytes
      expect(compressed).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('round-trips compression and decompression', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const original = await computeBn254G1PublicKey(sk);

      // Compress and decompress
      const originalPoint = new Bn254G1Point(new Fq(original.x), new Fq(original.y));
      const compressed = originalPoint.compress();
      const decompressed = await Bn254G1Point.fromCompressed(compressed);

      expect(decompressed.x.toBigInt()).toBe(original.x);
      expect(decompressed.y.toBigInt()).toBe(original.y);
    });

    it('handles multiple keys correctly', async () => {
      for (let i = 0; i < 10; i++) {
        const sk = deriveBlsKeyFromMnemonic(mnemonic, `m/12381/3600/${i}/0/0`, '');
        const original = await computeBn254G1PublicKey(sk);

        const originalPoint = new Bn254G1Point(new Fq(original.x), new Fq(original.y));
        const compressed = originalPoint.compress();
        const decompressed = await Bn254G1Point.fromCompressed(compressed);

        expect(decompressed.x.toBigInt()).toBe(original.x);
        expect(decompressed.y.toBigInt()).toBe(original.y);
        expect(await decompressed.isOnCurve()).toBe(true);
      }
    });

    it('decompressed points are on the curve', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const compressed = await computeBn254G1PublicKeyCompressed(sk);
      const decompressed = await Bn254G1Point.fromCompressed(Buffer.from(compressed.replace(/^0x/i, ''), 'hex'));

      expect(await decompressed.isOnCurve()).toBe(true);
    });

    it('correctly handles y parity in compression', async () => {
      // Test both even and odd y coordinates
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeBn254G1PublicKey(sk);
      const point = new Bn254G1Point(new Fq(pk.x), new Fq(pk.y));
      const compressed = point.compress();

      // Check if MSB is set based on y parity
      const msbSet = (compressed[0] & 0x80) !== 0;
      const yIsOdd = (pk.y & 1n) === 1n;

      expect(msbSet).toBe(yIsOdd);
    });

    it('throws on x-coordinate out of field range', async () => {
      // Create a compressed point with x >= field order
      const tooLarge = Buffer.from('ff'.repeat(32), 'hex');
      await expect(Bn254G1Point.fromCompressed(tooLarge)).rejects.toThrow();
    });
  });

  describe('isOnCurve', () => {
    it('returns true for valid points', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeBn254G1PublicKey(sk);

      const point = new Bn254G1Point(new Fq(pk.x), new Fq(pk.y));
      expect(await point.isOnCurve()).toBe(true);
    });

    it('returns true for generator point', async () => {
      const generator = new Bn254G1Point(new Fq(1n), new Fq(2n));
      expect(await generator.isOnCurve()).toBe(true);
    });

    it('returns false for invalid points', async () => {
      const invalid = new Bn254G1Point(new Fq(1n), new Fq(1n)); // Not on curve
      expect(await invalid.isOnCurve()).toBe(false);
    });

    it('returns false for random points', async () => {
      const random = new Bn254G1Point(new Fq(12345678901234567890n), new Fq(98765432109876543210n));
      // This point is almost certainly not on the curve
      expect(await random.isOnCurve()).toBe(false);
    });
  });

  describe('Integration with key derivation', () => {
    it('derives consistent keys across multiple calls', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk1 = await computeBn254G1PublicKeyCompressed(sk);
      const pk2 = await computeBn254G1PublicKeyCompressed(sk);

      expect(pk1).toBe(pk2);
    });

    it('produces valid Fr scalars', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const fr = Fr.fromHexString(sk);

      expect(fr.isZero()).toBe(false);
      expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
    });

    it('generates keys that are on the curve', async () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
      const pk = await computeBn254G1PublicKey(sk);

      // Verify the point is on the curve
      const point = new Bn254G1Point(new Fq(pk.x), new Fq(pk.y));
      expect(await point.isOnCurve()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles private key at field boundary', async () => {
      // Use a key very close to the field order
      const sk = '0x' + (Fr.MODULUS - 1n).toString(16).padStart(64, '0');
      const pk = await computeBn254G1PublicKey(sk);

      const point = new Bn254G1Point(new Fq(pk.x), new Fq(pk.y));
      expect(await point.isOnCurve()).toBe(true);
    });

    it('handles small private keys', async () => {
      const sk = '0x' + '01'.padStart(64, '0');
      const pk = await computeBn254G1PublicKey(sk);

      // Should equal the generator
      expect(pk.x).toBe(1n);
      expect(pk.y).toBe(2n);
    });

    it('compresses and decompresses the generator correctly', async () => {
      const generator = new Bn254G1Point(new Fq(1n), new Fq(2n));
      const compressed = generator.compress();
      const decompressed = await Bn254G1Point.fromCompressed(compressed);

      expect(decompressed.x.toBigInt()).toBe(1n);
      expect(decompressed.y.toBigInt()).toBe(2n);
    });
  });
});
