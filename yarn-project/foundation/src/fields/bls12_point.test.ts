import { jsonParseWithSchema, jsonStringify } from '../json-rpc/convert.js';
import { updateInlineTestData } from '../testing/files/index.js';
import { BLS12Fq, BLS12Fr } from './bls12_fields.js';
import { BLS12Point } from './bls12_point.js';

describe('BLS12Point', () => {
  describe('Random', () => {
    it('always returns a valid point', () => {
      for (let i = 0; i < 100; ++i) {
        const point = BLS12Point.random();
        expect(BLS12Point.isOnCurve(point.x, point.y)).toEqual(true);
      }
    });

    it('returns different points on each call', () => {
      const set = new Set();
      for (let i = 0; i < 100; ++i) {
        set.add(BLS12Point.random());
      }

      expect(set.size).toEqual(100);
    });
  });

  describe('Failures', () => {
    it('fails with invalid point', () => {
      // Input a point not on the curve:
      expect(() => new BLS12Point(BLS12Fq.ONE, BLS12Fq.ZERO, false)).toThrow('point is not on the BLS12-381 curve');
    });

    it('fails with invalid infinity', () => {
      // Input a valid point with incorrect isInfinite flag:
      expect(() => new BLS12Point(BLS12Fq.ZERO, new BLS12Fq(2n), true)).toThrow('is not infinite');
    });
  });

  describe('Compression', () => {
    it('converts to and from x and sign of y coordinate', () => {
      const p = BLS12Point.random();

      const [x, sign] = p.toXAndSign();
      const p2 = BLS12Point.fromXAndSign(x, sign);

      expect(p).toEqual(p2);
    });

    it('converts G to and from compressed point', () => {
      const p = BLS12Point.ONE;
      const compressedFirstByte = p.compress()[0].toString(2);
      // BLS12-381 compression contains three flags:
      // 1: is_compressed (expect true)
      const isCompressed = compressedFirstByte[0];
      expect(isCompressed).toEqual('1');
      // 2: is_infinity (expect false for G)
      const isInf = compressedFirstByte[1];
      expect(isInf).toEqual('0');
      // 3: is_greater (whether y > (p - 1)/ 2, expect false for G)
      const isGreater = compressedFirstByte[2];
      expect(isGreater).toEqual('0');
      const p2 = BLS12Point.decompress(p.compress());

      expect(p).toEqual(p2);
    });

    it('converts 0 to and from compressed point', () => {
      const p = BLS12Point.ZERO;
      const compressedFirstByte = p.compress()[0].toString(2);
      // 1: is_compressed (expect true)
      const isCompressed = compressedFirstByte[0];
      expect(isCompressed).toEqual('1');
      // 2: is_infinity (expect true for 0)
      const isInf = compressedFirstByte[1];
      expect(isInf).toEqual('1');
      // 3: is_greater (whether y > (p - 1)/ 2, expect false for 0)
      const isGreater = compressedFirstByte[2];
      expect(isGreater).toEqual('0');
      const p2 = BLS12Point.decompress(p.compress());

      expect(p).toEqual(p2);
      expect(p.compress()).toEqual(BLS12Point.COMPRESSED_ZERO);
    });

    it('converts to and from random compressed point', () => {
      const p = BLS12Point.random();
      const compressedFirstByte = p.compress()[0].toString(2);
      // 1: is_compressed (expect true)
      const isCompressed = compressedFirstByte[0];
      expect(isCompressed).toEqual('1');
      // 2: is_infinity
      const isInf = compressedFirstByte[1];
      expect(isInf).toEqual(`${+p.isInfinite}`);
      // 3: is_greater (whether y > (p - 1)/ 2))
      // equivalently, whether y > -y in the field
      const isGreater = compressedFirstByte[2];
      expect(isGreater).toEqual(`${+(p.y.toBigInt() > p.y.negate().toBigInt())}`);
      const p2 = BLS12Point.decompress(p.compress());

      expect(p).toEqual(p2);
    });

    it('converts to and from static compressed point', () => {
      const p = new BLS12Point(new BLS12Fq(0n), new BLS12Fq(2n), false);
      const compressedFirstByte = p.compress()[0].toString(2);
      // 1: is_compressed (expect true)
      const isCompressed = compressedFirstByte[0];
      expect(isCompressed).toEqual('1');
      // 2: is_infinity (expect false)
      const isInf = compressedFirstByte[1];
      expect(isInf).toEqual('0');
      // 3: is_greater (whether y > (p - 1)/ 2, expect false)
      const isGreater = compressedFirstByte[2];
      expect(isGreater).toEqual('0');
      const p2 = BLS12Point.decompress(p.compress());

      expect(p).toEqual(p2);
    });

    it('fails with invalid compression encoding', () => {
      const p = BLS12Point.random();
      const compressed = p.compress();
      let test = Buffer.from(compressed);
      // 1: flip is_compressed
      test[0] ^= 0b1000_0000;
      expect(() => BLS12Point.decompress(test)).toThrow('Invalid compressed G1 point');
      // reset
      test = Buffer.from(compressed);
      // 2: flip is_infinity
      test[0] ^= 0b0100_0000;
      expect(() => BLS12Point.decompress(test)).toThrow('Non-empty compressed G1 point');
    });

    it('fails with invalid point', () => {
      // Choose x such that x^3 + 4 = a quadratic non residue
      // (=> x is not a valid x-coord)
      let x;
      while (!x) {
        const candidate = BLS12Fq.random();
        const res = candidate.pow(3n).add(new BLS12Fq(4n));
        if (!res.sqrt() && !candidate.isZero()) {
          x = candidate;
        }
      }
      const compressed = x.toBuffer();
      // Add the mask with compressed = 1, infinite = 0, sort = 1
      compressed[0] |= 0b1010_0000;
      expect(() => BLS12Point.decompress(compressed)).toThrow('point is not on the BLS12-381 curve');
      expect(() => BLS12Point.fromXAndSign(x, true)).toThrow('point is not on the BLS12-381 curve');
    });
  });

  it('compressed point with greater sign matches Noir', () => {
    const p = new BLS12Point(
      new BLS12Fq(0x0f2f5f62cc6c3ab4c1ac1abcb9da9677e12796a76064f68c0d4f659f25a046a6d42616100269935afcb1b98c85d5e93en),
      new BLS12Fq(0x0f0f2d3e3f3b48eae5fb8b8b1efb31c70b9e60e8fb551976c560b98e9554ab95ce3a9f24892593bdff45e837976d7857n),
      false,
    );
    expect(p.toXAndSign()[1]).toBe(false);

    const compressed = p.compress().toString('hex');
    expect(compressed).toMatchInlineSnapshot(
      `"af2f5f62cc6c3ab4c1ac1abcb9da9677e12796a76064f68c0d4f659f25a046a6d42616100269935afcb1b98c85d5e93e"`,
    );

    const byteArrayString = `[${compressed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching_public_inputs.nr',
      'expected_compressed_point_greater',
      byteArrayString,
    );
  });

  it('compressed point with not greater sign matches Noir', () => {
    const p = new BLS12Point(
      new BLS12Fq(0x0f2f5f62cc6c3ab4c1ac1abcb9da9677e12796a76064f68c0d4f659f25a046a6d42616100269935afcb1b98c85d5e93en),
      new BLS12Fq(0x0af1e4abfa449daf65201c2b24507b1058d8ea9bf82ff948a1d01912615c4a8e507160da282e6c41bab917c868923254n),
      false,
    );
    expect(p.toXAndSign()[1]).toBe(true);

    const compressed = p.compress().toString('hex');
    expect(compressed).toMatchInlineSnapshot(
      `"8f2f5f62cc6c3ab4c1ac1abcb9da9677e12796a76064f68c0d4f659f25a046a6d42616100269935afcb1b98c85d5e93e"`,
    );

    const byteArrayString = `[${compressed.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/blob/src/blob_batching_public_inputs.nr',
      'expected_compressed_point_not_greater',
      byteArrayString,
    );
  });

  describe('Serialization', () => {
    it('serializes to and from buffer', () => {
      const p = BLS12Point.random();
      const p2 = BLS12Point.fromBuffer(p.toBuffer());

      expect(p).toEqual(p2);
    });

    it('serializes to and from string', () => {
      const p = BLS12Point.random();
      const p2 = BLS12Point.fromString(p.toString());

      expect(p).toEqual(p2);
    });

    it('serializes to and from fields', () => {
      const p = BLS12Point.random();
      const p2 = BLS12Point.fromBLS12FqFields(p.toBLS12FqFields());

      expect(p).toEqual(p2);
    });

    it('serializes to and from noble/curves projective point', () => {
      const p = BLS12Point.random();
      const p2 = BLS12Point.fromNobleProjectivePoint(p.toNobleProjectivePoint());

      expect(p).toEqual(p2);
    });

    it('serializes from and to JSON', () => {
      const p = BLS12Point.random();
      const p2 = jsonParseWithSchema(jsonStringify(p), BLS12Point.schema);
      expect(p).toEqual(p2);
      expect(p2).toBeInstanceOf(BLS12Point);
    });
  });

  describe('Arithmetic', () => {
    describe('Addition', () => {
      it('Identity', () => {
        const p = BLS12Point.random();
        const p2 = p.add(BLS12Point.ZERO);

        expect(p).toEqual(p2);
      });

      it('Inverse', () => {
        const p = BLS12Point.random();
        const p2 = p.add(p.negate());

        expect(BLS12Point.ZERO).toEqual(p2);
      });
    });

    describe('Subtraction', () => {
      it('Identity', () => {
        const p = BLS12Point.random();
        const p2 = p.sub(BLS12Point.ZERO);

        expect(p).toEqual(p2);
      });

      it('Inverse', () => {
        const p = BLS12Point.random();
        const p2 = p.sub(p);

        expect(BLS12Point.ZERO).toEqual(p2);
      });

      it('Performs subtraction correctly', () => {
        const p = BLS12Point.random();
        const q = BLS12Point.random();
        const p2 = p.sub(q);
        const p3 = p.add(q.negate());

        expect(p3).toEqual(p2);
      });
    });

    describe('Multiplication', () => {
      it('Identity', () => {
        const p = BLS12Point.random();
        const p2 = p.mul(BLS12Fr.ONE);
        const p2Unsafe = p.mulUnsafe(BLS12Fr.ONE);

        expect(p).toEqual(p2);
        expect(p2Unsafe).toEqual(p2);
      });

      it('Zero', () => {
        const p = BLS12Point.random();
        const p2 = p.mul(BLS12Fr.ZERO);
        const p2Unsafe = p.mulUnsafe(BLS12Fr.ZERO);

        expect(BLS12Point.ZERO).toEqual(p2);
        expect(p2Unsafe).toEqual(p2);
      });

      it('Inverse', () => {
        const a = BLS12Fr.random();
        const ag = BLS12Point.ONE.mul(a);
        const minusag = BLS12Point.ONE.mul(a.negate());
        const minusagUnsafe = BLS12Point.ONE.mulUnsafe(a.negate());
        expect(ag.negate()).toEqual(minusag);
        expect(minusagUnsafe).toEqual(minusag);

        const p2 = ag.add(minusag);
        expect(BLS12Point.ZERO).toEqual(p2);
      });

      it('Performs multiplication correctly', () => {
        const p = BLS12Point.random();
        const a = new BLS12Fr(3);
        const p2 = p.mul(a);
        const p2Unsafe = p.mulUnsafe(a);
        const expected = p.add(p).add(p);

        expect(expected).toEqual(p2);
        expect(p2Unsafe).toEqual(p2);
      });

      it('Low Boundary', () => {
        // (p - 1) * G = - G
        const p = BLS12Point.ONE.mul(BLS12Fr.MAX_FIELD_VALUE);
        const pUnsafe = BLS12Point.ONE.mulUnsafe(BLS12Fr.MAX_FIELD_VALUE);
        const p2 = BLS12Point.ZERO.sub(BLS12Point.ONE);

        expect(p).toEqual(p2);
        expect(pUnsafe).toEqual(p2);
      });

      it('High Boundary', () => {
        // b * ( - G ) = ( - b ) * G
        const p = BLS12Point.ONE.mul(BLS12Fr.MAX_FIELD_VALUE);
        const b = BLS12Fr.random();
        const p2 = p.mul(b);
        const p2Unsafe = p.mulUnsafe(b);
        const expected = BLS12Point.ONE.mul(b.negate());

        expect(expected).toEqual(p2);
        expect(p2Unsafe).toEqual(p2);
      });
    });
    describe('Multiply and Add', () => {
      it('Performs simple multiplication and addition correctly', () => {
        const p = BLS12Point.random();
        const a = BLS12Fr.random();
        const q = BLS12Point.random();
        const b = BLS12Fr.random();
        const p2 = p.mulAndAddUnsafe(a, b, q);
        const expected = p.mul(a).add(q.mul(b));

        expect(expected).toEqual(p2);
      });

      it('Performs multiplication and addition correctly', () => {
        // aP + -aQ = a(P - Q), for P, Q in group
        const p = BLS12Point.ONE.mul(BLS12Fr.random());
        const a = BLS12Fr.random();
        const q = BLS12Point.ONE.mul(BLS12Fr.random());
        const p2 = p.mulAndAddUnsafe(a, a.negate(), q);
        const expected = p.sub(q).mul(a);

        expect(expected).toEqual(p2);
      });
    });
  });
});
