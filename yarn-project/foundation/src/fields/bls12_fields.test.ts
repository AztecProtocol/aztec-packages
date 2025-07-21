import { randomBigInt } from '../crypto/index.js';
import { BLS12Fq, BLS12Fr } from './bls12_fields.js';
import { Fr } from './fields.js';

function testFn(Field: any, name: string) {
  describe(`${name} Serialization`, () => {
    // Test case for Field.fromBuffer
    it('fromBuffer should serialize and deserialize correctly', () => {
      const original = Field.random();
      const buffer = original.toBuffer();
      const deserialized = Field.fromBuffer(buffer);

      // Check if the deserialized instance is equal to the original
      expect(deserialized).toEqual(original);
    });

    // Test case for Field.fromNoirBigNum
    it('fromNoirBigNum should serialize and deserialize correctly', () => {
      const original = Field.random();
      const bignum = original.toNoirBigNum();
      const deserialized = Field.fromNoirBigNum(bignum);

      // Check if the deserialized instance is equal to the original
      expect(deserialized).toEqual(original);
    });

    // Test case for Field.fromString
    it('fromString should serialize and deserialize correctly', () => {
      const original = Field.random();
      const hexString = original.toString();
      const deserialized = Field.fromString(hexString);

      // Check if the deserialized instance is equal to the original
      expect(deserialized).toEqual(original);

      // Note odd number of digits
      const arbitraryNumericString = '123';
      const arbitraryNumericStringPrepended = '0x123';
      const expectedBigIntFromHex = 291n;

      const anotherString = '1000a000';
      const anotherStringPrepended = '0x1000a000';

      const expectedValueOfAnotherHexString = 268476416n;

      expect(Field.fromString(arbitraryNumericString).toBigInt()).toEqual(BigInt(arbitraryNumericString));
      expect(Field.fromString(arbitraryNumericStringPrepended).toBigInt()).toEqual(expectedBigIntFromHex);

      expect(() => Field.fromString(anotherString)).toThrow(`Tried to create a BLS12${name} from an invalid string`);
      expect(Field.fromString(anotherStringPrepended).toBigInt()).toEqual(expectedValueOfAnotherHexString);

      const nonHexEncodedString = '0x12xx34xx45';
      expect(() => Field.fromHexString(nonHexEncodedString)).toThrow('Invalid hex-encoded string');
    });

    // Test case for Field.fromHexString
    it('fromHexString should serialize and deserialize correctly', () => {
      const original = Field.random();
      const hexString = original.toString();
      const deserialized = Field.fromHexString(hexString);

      // Check if the deserialized instance is equal to the original**
      expect(deserialized).toEqual(original);

      // Note odd number of digits
      const arbitraryNumericString = '123';
      const arbitraryNumericStringPrepended = '0x123';
      const expectedBigIntFromHex = 291n;

      const anotherString = 'deadbeef';
      const anotherStringPrepended = '0xdeadbeef';

      const expectedValueOfAnotherHexString = 3735928559n;

      expect(Field.fromHexString(arbitraryNumericString).toBigInt()).toEqual(expectedBigIntFromHex);
      expect(Field.fromHexString(arbitraryNumericStringPrepended).toBigInt()).toEqual(expectedBigIntFromHex);

      expect(Field.fromHexString(anotherString).toBigInt()).toEqual(expectedValueOfAnotherHexString);
      expect(Field.fromHexString(anotherStringPrepended).toBigInt()).toEqual(expectedValueOfAnotherHexString);

      const nonHexEncodedString = '12xx34xx45';

      expect(() => Field.fromHexString(nonHexEncodedString).toBigInt()).toThrow();
    });

    if (name == 'Fr') {
      // Test case for Field.fromBN254Fr
      it('fromBN254Fr and toBN254Fr should convert correctly', () => {
        const original = Fr.random();
        const bls = Field.fromBN254Fr(original);
        const bn = bls.toBN254Fr();
        // Check if the deserialized instance is equal to the original
        expect(bn).toEqual(original);
      });

      // Test case for Field.fromBN254Fr
      it('rejects fields too large for BN254', () => {
        const bls = Field.MAX_FIELD_VALUE;
        expect(() => bls.toBN254Fr()).toThrow('too large');
        const zero = new Field(Fr.MODULUS);
        expect(() => zero.toBN254Fr()).toThrow('too large');
      });
    }
  });

  describe(`Arithmetic on ${name}`, () => {
    describe('Addition', () => {
      it('Low Boundary', () => {
        // 0 + -1 = -1
        const a = Field.ZERO;
        const b = Field.MAX_FIELD_VALUE;
        const expected = Field.MAX_FIELD_VALUE;

        const actual = a.add(b);

        expect(actual).toEqual(expected);
      });

      it('High Boundary', () => {
        // -1 + 1 = 0
        const a = Field.MAX_FIELD_VALUE;
        const b = new Field(1);
        const expected = Field.ZERO;

        const actual = a.add(b);

        expect(actual).toEqual(expected);
      });

      it('Performs addition correctly', () => {
        const a = new Field(2);
        const b = new Field(3);
        const expected = new Field(5);

        const actual = a.add(b);
        expect(actual).toEqual(expected);
      });
    });

    describe('Subtraction', () => {
      it('Low Boundary', () => {
        // 0 - 1 = -1
        const a = new Field(0);
        const b = new Field(1);
        const expected = Field.MAX_FIELD_VALUE;

        const actual = a.sub(b);

        expect(actual).toEqual(expected);
      });

      it('High Boundary', () => {
        // -1 - (-1) = 0
        const a = Field.MAX_FIELD_VALUE;
        const b = Field.MAX_FIELD_VALUE;

        const actual = a.sub(b);

        expect(actual).toEqual(Field.ZERO);
      });

      it('Performs subtraction correctly', () => {
        const a = new Field(10);
        const b = new Field(5);
        const expected = new Field(5);

        const actual = a.sub(b);
        expect(actual).toEqual(expected);
      });
    });

    describe('Multiplication', () => {
      it('Identity', () => {
        const a = Field.MAX_FIELD_VALUE;
        const b = new Field(1);
        const expected = Field.MAX_FIELD_VALUE;

        const actual = a.mul(b);

        expect(actual).toEqual(expected);
      });

      it('Performs multiplication correctly', () => {
        const a = new Field(2);
        const b = new Field(3);
        const expected = new Field(6);

        const actual = a.mul(b);
        expect(actual).toEqual(expected);
      });

      it('High Boundary', () => {
        const a = Field.MAX_FIELD_VALUE;
        const b = Field.random();
        const expected = b.negate();

        const actual = a.mul(b);
        expect(actual).toEqual(expected);
      });
    });

    describe('Division', () => {
      it('Should succeed when mod inverse is -ve', () => {
        const a = new Field(2);
        const b = new Field(3);

        const actual = a.div(b);
        expect(actual.mul(b)).toEqual(a);
      });

      it('Should succeed when mod inverse is +ve', () => {
        const a = new Field(10);
        const b = new Field(5);
        const expected = new Field(2);

        const actual = a.div(b);
        expect(actual.mul(b)).toEqual(a);
        expect(actual).toEqual(expected);
      });

      it('Should not allow a division by 0', () => {
        const a = new Field(10);
        const b = Field.ZERO;

        expect(() => a.div(b)).toThrow();
      });
    });

    describe('Square root', () => {
      it.each([
        [new Field(0), 0n],
        [new Field(4), 2n],
        [new Field(9), 3n],
        [new Field(16), 4n],
      ])('Should return the correct square root for %p', (input, expected) => {
        const actual = input.sqrt()!.toBigInt();

        // The square root can be either the expected value or the modulus - expected value
        const isValid = actual == expected || actual == Field.MODULUS - expected;

        expect(isValid).toBeTruthy();
      });

      it('Should return the correct square root for random value', () => {
        const a = Field.random();
        const squared = a.mul(a);

        const actual = squared.sqrt();
        expect(actual!.mul(actual!)).toEqual(squared);
      });
    });

    describe('Power', () => {
      it.each([
        [new Field(0), 0n, 1n],
        [new Field(2), 1n, 2n],
        [new Field(2), 2n, 4n],
        [new Field(10n), 8n, 100_000_000n],
      ])('Should return the correct power for %p', (input, pow, expected) => {
        const actual = input.pow(pow).toBigInt();

        // The square root can be either the expected value or the modulus - expected value
        const isValid = actual == expected || actual == Field.MODULUS - expected;

        expect(isValid).toBeTruthy();
      });

      it('Should return the correct power for random value', () => {
        const a = Field.random();
        const power = 11n;
        let expected = a;
        for (let i = 1; i < power; i++) {
          expected = expected.mul(a);
        }
        const actual = a.pow(power);
        expect(actual).toEqual(expected);
      });

      it('Performs power correctly', () => {
        // (a^b) * (a^c) = a^(b + c)
        const a = Field.random();
        const b = randomBigInt(10_000n);
        const c = randomBigInt(10_000n);
        const expected = a.pow(b + c);
        const actual = a.pow(b).mul(a.pow(c));

        expect(actual).toEqual(expected);
      });

      it('High Boundary', () => {
        // (-1) ^ (odd) = -1
        const a = Field.MAX_FIELD_VALUE;
        const b = randomBigInt(10_000n);
        const expected = b % 2n ? Field.MAX_FIELD_VALUE : Field.ONE;

        const actual = a.pow(b);

        expect(actual).toEqual(expected);
      });
    });
  });
}

testFn(BLS12Fr, 'Fr');
testFn(BLS12Fq, 'Fq');
