import { Fr, GrumpkinScalar } from './fields.js';

describe('GrumpkinScalar Serialization', () => {
  // Test case for GrumpkinScalar.fromHighLow
  it('fromHighLow should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const high = original.hi;
    const low = original.lo;

    const deserialized = GrumpkinScalar.fromHighLow(high, low);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);
  });

  // Test case for GrumpkinScalar.fromBuffer
  it('fromBuffer should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const buffer = original.toBuffer();
    const deserialized = GrumpkinScalar.fromBuffer(buffer);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);
  });

  // Test case for GrumpkinScalar.fromString
  it('fromString should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const hexString = original.toString();
    const deserialized = GrumpkinScalar.fromString(hexString);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);

    // Note odd number of digits
    const arbitraryNumericString = '123';
    const arbitraryNumericStringPrepended = '0x123';
    const expectedBigIntFromHex = 291n;

    const anotherString = '1000a000';
    const anotherStringPrepended = '0x1000a000';

    const expectedValueOfAnotherHexString = 268476416n;

    expect(GrumpkinScalar.fromString(arbitraryNumericString).toBigInt()).toEqual(BigInt(arbitraryNumericString));
    expect(GrumpkinScalar.fromString(arbitraryNumericStringPrepended).toBigInt()).toEqual(expectedBigIntFromHex);

    expect(() => GrumpkinScalar.fromString(anotherString)).toThrow('Tried to create a Fq from an invalid string');
    expect(GrumpkinScalar.fromString(anotherStringPrepended).toBigInt()).toEqual(expectedValueOfAnotherHexString);

    const nonHexEncodedString = '0x12xx34xx45';
    expect(() => GrumpkinScalar.fromHexString(nonHexEncodedString)).toThrow('Invalid hex-encoded string');
  });

  // Test case for GrumpkinScalar.fromHexString
  it('fromHexString should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const hexString = original.toString();
    const deserialized = GrumpkinScalar.fromHexString(hexString);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);

    // Note odd number of digits
    const arbitraryNumericString = '123';
    const arbitraryNumericStringPrepended = '0x123';
    const expectedBigIntFromHex = 291n;

    const anotherString = 'deadbeef';
    const anotherStringPrepended = '0xdeadbeef';

    const expectedValueOfAnotherHexString = 3735928559n;

    expect(GrumpkinScalar.fromHexString(arbitraryNumericString).toBigInt()).toEqual(expectedBigIntFromHex);
    expect(GrumpkinScalar.fromHexString(arbitraryNumericStringPrepended).toBigInt()).toEqual(expectedBigIntFromHex);

    expect(GrumpkinScalar.fromHexString(anotherString).toBigInt()).toEqual(expectedValueOfAnotherHexString);
    expect(GrumpkinScalar.fromHexString(anotherStringPrepended).toBigInt()).toEqual(expectedValueOfAnotherHexString);

    const nonHexEncodedString = '12xx34xx45';

    expect(() => GrumpkinScalar.fromHexString(nonHexEncodedString).toBigInt()).toThrow();
  });

  // Test case for GrumpkinScalar.toBuffer
  it('toBuffer should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const buffer = original.toBuffer();
    const deserialized = GrumpkinScalar.fromBuffer(buffer);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);
  });

  // Test case for GrumpkinScalar.toString
  it('toString should serialize and deserialize correctly', () => {
    const original = GrumpkinScalar.random();
    const hexString = original.toString();
    const deserialized = GrumpkinScalar.fromHexString(hexString);

    // Check if the deserialized instance is equal to the original
    expect(deserialized).toEqual(original);
  });
});

describe('Bn254 arithmetic', () => {
  describe('Addition', () => {
    it('Low Boundary', () => {
      // 0 + -1 = -1
      const a = Fr.ZERO;
      const b = Fr.MAX_FIELD_VALUE;
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      // -1 + 1 = 0
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(1);
      const expected = Fr.ZERO;

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });

    it('Performs addition correctly', () => {
      const a = new Fr(2);
      const b = new Fr(3);
      const expected = new Fr(5);

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Subtraction', () => {
    it('Low Boundary', () => {
      // 0 - 1 = -1
      const a = new Fr(0);
      const b = new Fr(1);
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.sub(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      // -1 - (-1) = 0
      const a = Fr.MAX_FIELD_VALUE;
      const b = Fr.MAX_FIELD_VALUE;

      const actual = a.sub(b);
      expect(actual).toEqual(Fr.ZERO);
    });

    it('Performs subtraction correctly', () => {
      const a = new Fr(10);
      const b = new Fr(5);
      const expected = new Fr(5);

      const actual = a.sub(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Multiplication', () => {
    it('Identity', () => {
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(1);
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });

    it('Performs multiplication correctly', () => {
      const a = new Fr(2);
      const b = new Fr(3);
      const expected = new Fr(6);

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(Fr.MODULUS / 2n);
      const expected = new Fr(10944121435919637611123202872628637544274182200208017171849102093287904247809n);

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Division', () => {
    it('Should succeed when mod inverse is -ve', () => {
      const a = new Fr(2);
      const b = new Fr(3);

      const actual = a.div(b);
      expect(actual.mul(b)).toEqual(a);
    });

    it('Should succeed when mod inverse is +ve', () => {
      const a = new Fr(10);
      const b = new Fr(5);
      const expected = new Fr(2);

      const actual = a.div(b);
      expect(actual.mul(b)).toEqual(a);
      expect(actual).toEqual(expected);
    });

    it('Should not allow a division by 0', () => {
      const a = new Fr(10);
      const b = Fr.ZERO;

      expect(() => a.div(b)).toThrow();
    });
  });

  describe('Square root', () => {
    it.each([
      [new Fr(0), 0n],
      [new Fr(4), 2n],
      [new Fr(9), 3n],
      [new Fr(16), 4n],
    ])('Should return the correct square root for %p', (input, expected) => {
      const actual = input.sqrt()!.toBigInt();

      // The square root can be either the expected value or the modulus - expected value
      const isValid = actual == expected || actual == Fr.MODULUS - expected;

      expect(isValid).toBeTruthy();
    });

    it('Should return the correct square root for random value', () => {
      const a = Fr.random();
      const squared = a.mul(a);

      const actual = squared.sqrt();
      expect(actual!.mul(actual!)).toEqual(squared);
    });
  });

  describe('Comparison', () => {
    it.each([
      [new Fr(5), new Fr(10), -1],
      [new Fr(10), new Fr(5), 1],
      [new Fr(5), new Fr(5), 0],
      [Fr.MAX_FIELD_VALUE, new Fr(Fr.MODULUS - 1n), 0],
      [new Fr(0), new Fr(Fr.MODULUS - 1n), -1],
      [new Fr(Fr.MODULUS - 1n), new Fr(0), 1],
      [Fr.ZERO, Fr.ZERO, 0],
      [Fr.zero(), Fr.ZERO, 0],
    ])('Should compare field elements correctly', (a, b, expected) => {
      expect(a.cmp(b)).toEqual(expected);
    });
  });
});
