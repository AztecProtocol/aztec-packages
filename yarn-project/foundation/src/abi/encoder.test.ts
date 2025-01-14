import { AztecAddress } from '../aztec-address/index.js';
import { Fr } from '../fields/fields.js';
import { Point } from '../fields/point.js';
import { jsonParseWithSchema, jsonStringify } from '../json-rpc/convert.js';
import { schemas } from '../schemas/schemas.js';
import { type FunctionAbi, FunctionType } from './abi.js';
import { convertToU128Limbs, encodeArguments } from './encoder.js';

describe('abi/encoder', () => {
  it('serializes fields as fields', () => {
    const abi: FunctionAbi = {
      name: 'constructor',
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isInitializer: true,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'field',
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const field = Fr.random();
    expect(encodeArguments(abi, [field])).toEqual([field]);

    const serializedField = jsonParseWithSchema(jsonStringify(field), schemas.Fr);
    expect(encodeArguments(abi, [serializedField])).toEqual([field]);
  });

  it('serializes arrays of fields', () => {
    const abi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'array',
            length: 2,
            type: { kind: 'field' },
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const arr = [Fr.random(), Fr.random()];
    expect(encodeArguments(abi, [arr])).toEqual(arr);
  });

  it('serializes string', () => {
    const abi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'string',
            length: 4,
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const str = 'abc';
    // As bigints padded with 0 for length 4. ("a" = 97, "b" = 98, "c" = 99, 0)
    const expected = [new Fr(97), new Fr(98), new Fr(99), new Fr(0)];
    expect(encodeArguments(abi, [str])).toEqual(expected);
  });

  it.each(['AztecAddress', 'EthAddress'])('accepts address instance for %s structs', async (structType: string) => {
    const abi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'struct',
            path: `types::address::${structType}`,
            fields: [
              {
                name: 'inner',
                type: { kind: 'field' },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const address = await AztecAddress.random();
    expect(encodeArguments(abi, [address])).toEqual([address.toField()]);
    expect(encodeArguments(abi, [{ address }])).toEqual([address.toField()]);
    expect(encodeArguments(abi, [{ address: address.toField() }])).toEqual([address.toField()]);

    const completeAddressLike = { address, publicKey: await Point.random(), partialAddress: Fr.random() };
    expect(encodeArguments(abi, [completeAddressLike])).toEqual([address.toField()]);

    const serializedAddress = jsonParseWithSchema(jsonStringify(address), schemas.AztecAddress);
    expect(encodeArguments(abi, [serializedAddress])).toEqual([address.toField()]);
  });

  it('accepts a field for a wrapped field', () => {
    const abi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'contract_class',
          type: {
            kind: 'struct',
            path: `types::contract_class_id::ContractClassId`,
            fields: [
              {
                name: 'inner',
                type: { kind: 'field' },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const value = Fr.random();

    expect(encodeArguments(abi, [value])).toEqual([value]);
    expect(encodeArguments(abi, [{ inner: value }])).toEqual([value]);
  });

  it('throws when passing string argument as field', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'field',
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };
    const args = ['garbage'];

    expect(() => encodeArguments(testFunctionAbi, args)).toThrow('Invalid hex-encoded string: "garbage"');
  });

  it('throws when passing string argument as integer', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'isOwner',
          type: {
            sign: 'signed',
            width: 5,
            kind: 'integer',
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };
    const args = ['garbage'];
    expect(() => encodeArguments(testFunctionAbi, args)).toThrow(`Cannot convert garbage to a BigInt`);
  });

  it('throws when passing object argument as field', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'field',
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };
    const args = [
      {
        value: 'garbage',
      },
    ];

    expect(() => encodeArguments(testFunctionAbi, args)).toThrow(/Invalid hex-encoded string/);
  });

  describe('convertToU128Limbs', () => {
    it('converts 0 correctly', () => {
      const result = convertToU128Limbs(0);
      expect(result.lo).toBe(0n);
      expect(result.hi).toBe(0n);
    });

    it('converts maximum 128-bit value correctly', () => {
      const maxValue = 2n ** 128n - 1n;
      const result = convertToU128Limbs(maxValue);
      expect(result.lo).toBe(BigInt('0xFFFFFFFFFFFFFFFF'));
      expect(result.hi).toBe(BigInt('0xFFFFFFFFFFFFFFFF'));
    });

    it('converts value with only low bits set', () => {
      const value = BigInt('0xABCDEF0123456789');
      const result = convertToU128Limbs(value);
      expect(result.lo).toBe(BigInt('0xABCDEF0123456789'));
      expect(result.hi).toBe(0n);
    });

    it('converts value with both high and low bits set', () => {
      const hi = BigInt('0xFEDCBA9876543210');
      const lo = BigInt('0x1234567890ABCDEF');
      const value = (hi << 64n) | lo;
      const result = convertToU128Limbs(value);
      expect(result.lo).toBe(lo);
      expect(result.hi).toBe(hi);
    });

    it('converts number type inputs correctly', () => {
      const result = convertToU128Limbs(12345);
      expect(result.lo).toBe(12345n);
      expect(result.hi).toBe(0n);
    });

    it('handles edge cases near power of 2 boundaries', () => {
      // Test just below 2^64
      const nearMax64 = 2n ** 64n - 1n;
      const result1 = convertToU128Limbs(nearMax64);
      expect(result1.lo).toBe(BigInt('0xFFFFFFFFFFFFFFFF'));
      expect(result1.hi).toBe(0n);

      // Test just above 2^64
      const justAbove64 = 2n ** 64n + 1n;
      const result2 = convertToU128Limbs(justAbove64);
      expect(result2.lo).toBe(1n);
      expect(result2.hi).toBe(1n);
    });

    describe('error cases', () => {
      it('throws error for negative values', () => {
        expect(() => convertToU128Limbs(-1)).toThrow(
          'Value -1 is not within 128 bits and hence cannot be converted to U128 limbs.',
        );
      });

      it('throws error for values >= 2^128', () => {
        const tooLarge = 2n ** 128n;
        expect(() => convertToU128Limbs(tooLarge)).toThrow(
          `Value ${tooLarge} is not within 128 bits and hence cannot be converted to U128 limbs.`,
        );
      });

      it('throws error for maximum safe integer edge case', () => {
        const maxSafe = 2n ** 128n + 1n;
        expect(() => convertToU128Limbs(maxSafe)).toThrow(
          `Value ${maxSafe} is not within 128 bits and hence cannot be converted to U128 limbs.`,
        );
      });
    });
  });
});
