import { GrumpkinScalar } from './index.js';

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
