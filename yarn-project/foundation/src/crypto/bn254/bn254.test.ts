import { BBApiException, BarretenbergSync } from '@aztec/bb.js';

import { Fq, Fr } from '../../fields/fields.js';
import { Bn254G1Point, Bn254G2Point } from './index.js';

describe('Bn254 Point Classes', () => {
  const testScalar = Fr.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

  describe('Bn254G1Point', () => {
    it('should get generator point with correct coordinates', async () => {
      const generator = await Bn254G1Point.generator();

      expect(generator.x.toBigInt()).toBe(1n);
      expect(generator.y.toBigInt()).toBe(2n);
    });

    it('should verify point is on curve', async () => {
      const point = await Bn254G1Point.generator(testScalar);
      const onCurve = await point.isOnCurve();

      expect(onCurve).toBe(true);
    });

    it('should throw error when multiplying invalid point not on curve', async () => {
      await BarretenbergSync.initSingleton();
      const api = BarretenbergSync.getSingleton();

      // Create an invalid point (coordinates not on the BN254 curve)
      const invalidPoint = {
        x: new Fq(1n).toBuffer(),
        y: new Fq(1n).toBuffer(), // (1, 1) is not on the BN254 curve
      };

      // First verify the point is not on the curve
      const testPoint = new Bn254G1Point(new Fq(1n), new Fq(1n));
      const onCurve = await testPoint.isOnCurve();
      expect(onCurve).toBe(false);

      // Attempt to multiply the invalid point should throw BBApiException
      expect(() => {
        api.bn254G1Mul({
          point: invalidPoint,
          scalar: new Fr(5n).toBuffer(),
        });
      }).toThrow(BBApiException);

      // Verify the error message
      try {
        api.bn254G1Mul({
          point: invalidPoint,
          scalar: new Fr(5n).toBuffer(),
        });
        fail('Should have thrown BBApiException');
      } catch (e) {
        expect(e).toBeInstanceOf(BBApiException);
        expect((e as BBApiException).message).toMatch(/Input point must be on the curve/);
      }
    });

    it('should check equality correctly', async () => {
      const point1 = await Bn254G1Point.generator(testScalar);
      const point2 = await Bn254G1Point.generator(testScalar);
      const point3 = await Bn254G1Point.generator(Fr.fromString('0x42'));

      expect(point1.equals(point2)).toBe(true);
      expect(point1.equals(point3)).toBe(false);
    });

    it('should compress and decompress generator point correctly', async () => {
      const generator = await Bn254G1Point.generator();

      // Compress the generator point
      const compressed = generator.compress();
      expect(compressed.length).toBe(32);

      // Decompress it back
      const decompressed = await Bn254G1Point.fromCompressed(compressed);

      // Should get the same point back
      expect(decompressed.equals(generator)).toBe(true);
      expect(decompressed.x.toBigInt()).toBe(1n);
      expect(decompressed.y.toBigInt()).toBe(2n);
    });

    it('should compress and decompress scalar multiple of generator correctly', async () => {
      const scalar = Fr.fromString('0x123456789abcdef');
      const point = await Bn254G1Point.generator(scalar);

      // Compress the point
      const compressed = point.compress();
      expect(compressed.length).toBe(32);

      // Decompress it back
      const decompressed = await Bn254G1Point.fromCompressed(compressed);

      // Should get the same point back
      expect(decompressed.equals(point)).toBe(true);
      expect(decompressed.x.equals(point.x)).toBe(true);
      expect(decompressed.y.equals(point.y)).toBe(true);
    });

    it('should decompress point and verify it is on curve', async () => {
      const scalar = Fr.fromString('0x42');
      const point = await Bn254G1Point.generator(scalar);

      // Compress and decompress
      const compressed = point.compress();
      const decompressed = await Bn254G1Point.fromCompressed(compressed);

      // Verify the decompressed point is on the curve
      const onCurve = await decompressed.isOnCurve();
      expect(onCurve).toBe(true);
    });

    it('should throw error when decompressing invalid compressed data', async () => {
      // Create invalid compressed data (random bytes that don't represent a valid point)
      const invalidCompressed = Buffer.alloc(32);
      // Set some arbitrary invalid values
      invalidCompressed.writeUInt32BE(0x12345678, 0);
      invalidCompressed.writeUInt32BE(0x9abcdef0, 4);

      // Attempting to decompress invalid data should throw BBApiException
      await expect(Bn254G1Point.fromCompressed(invalidCompressed)).rejects.toThrow(BBApiException);
      await expect(Bn254G1Point.fromCompressed(invalidCompressed)).rejects.toThrow(
        /Decompressed point is not on the curve/,
      );
    });
  });

  describe('Bn254G2Point', () => {
    it('should produce different points for different scalars', async () => {
      const point1 = await Bn254G2Point.generator(Fr.fromString('0x01'));
      const point2 = await Bn254G2Point.generator(Fr.fromString('0x02'));

      expect(point1.equals(point2)).toBe(false);
    });

    it('should throw error when multiplying invalid point not on curve', async () => {
      await BarretenbergSync.initSingleton();
      const api = BarretenbergSync.getSingleton();

      // Create an invalid G2 point (coordinates not on the BN254 G2 curve)
      const invalidPoint = {
        x: [new Fq(1n).toBuffer(), new Fq(1n).toBuffer()] as [Buffer, Buffer],
        y: [new Fq(1n).toBuffer(), new Fq(1n).toBuffer()] as [Buffer, Buffer], // Not on the curve
      };

      // Attempt to multiply the invalid point should throw BBApiException
      expect(() => {
        api.bn254G2Mul({
          point: invalidPoint,
          scalar: new Fr(5n).toBuffer(),
        });
      }).toThrow(BBApiException);
    });

    it('should check equality correctly', async () => {
      const point1 = await Bn254G2Point.generator(testScalar);
      const point2 = await Bn254G2Point.generator(testScalar);
      const point3 = await Bn254G2Point.generator(Fr.fromString('0x42'));

      expect(point1.equals(point2)).toBe(true);
      expect(point1.equals(point3)).toBe(false);
    });
  });
});
