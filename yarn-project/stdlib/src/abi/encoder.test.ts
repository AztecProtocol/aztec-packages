import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { schemas } from '../schemas/index.js';
import { type FunctionAbi, FunctionType } from './abi.js';
import { encodeArguments } from './encoder.js';

describe('abi/encoder', () => {
  it('serializes fields as fields', () => {
    const abi: FunctionAbi = {
      name: 'constructor',
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
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
      isOnlySelf: false,
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
      isOnlySelf: false,
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
    // As bigints padded with 0 for length 4. ("a" = 97, "b" = 98, "c" = 99, BlockNumber.ZERO)
    const expected = [new Fr(97), new Fr(98), new Fr(99), new Fr(0)];
    expect(encodeArguments(abi, [str])).toEqual(expected);
  });

  it.each(['AztecAddress', 'EthAddress'])('accepts address instance for %s structs', async (structType: string) => {
    const abi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
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
      isOnlySelf: false,
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

  describe('option struct inputs', () => {
    const optionStructAbi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'value',
          type: {
            kind: 'struct',
            path: 'std::option::Option',
            fields: [
              { name: '_is_some', type: { kind: 'boolean' } },
              {
                name: '_value',
                type: {
                  kind: 'struct',
                  path: 'Test::CustomStruct',
                  fields: [
                    { name: 'w', type: { kind: 'field' } },
                    { name: 'x', type: { kind: 'boolean' } },
                    { name: 'y', type: { kind: 'integer', sign: 'unsigned', width: 64 } },
                    { name: 'z', type: { kind: 'integer', sign: 'signed', width: 64 } },
                  ],
                },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    const someValue = { w: 1n, x: true, y: 2n, z: -3n };

    it('encodes a direct value as Some', () => {
      expect(encodeArguments(optionStructAbi, [someValue])).toEqual([
        new Fr(1n),
        new Fr(1n),
        new Fr(1n),
        new Fr(2n),
        new Fr((1n << 64n) - 3n),
      ]);
    });

    it.each([undefined, null])('encodes %p as None', value => {
      expect(encodeArguments(optionStructAbi, [value])).toEqual([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
    });

    it('encodes the lowered ABI shape for Some', () => {
      // eslint-disable-next-line camelcase
      expect(encodeArguments(optionStructAbi, [{ _is_some: true, _value: someValue }])).toEqual([
        new Fr(1n),
        new Fr(1n),
        new Fr(1n),
        new Fr(2n),
        new Fr((1n << 64n) - 3n),
      ]);
    });

    it('encodes the lowered ABI shape for None without requiring _value', () => {
      // eslint-disable-next-line camelcase
      expect(encodeArguments(optionStructAbi, [{ _is_some: false }])).toEqual([
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO,
      ]);
    });
  });

  it('throws when array is larger than declared fixed size', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'values',
          type: { kind: 'array', length: 2, type: { kind: 'field' } },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [[Fr.random(), Fr.random(), Fr.random()]])).toThrow(
      "Expected array of length 2 for 'values' but received length 3",
    );
  });

  it('throws when array is smaller than declared fixed size', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'values',
          type: { kind: 'array', length: 3, type: { kind: 'field' } },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [[Fr.random()]])).toThrow(
      "Expected array of length 3 for 'values' but received length 1",
    );
  });

  it('throws when too many arguments are provided', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'value',
          type: { kind: 'field' },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [Fr.random(), Fr.random()])).toThrow(
      "Function 'test' expects 1 argument(s) but received 2",
    );
  });

  it('throws when too few arguments are provided', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        { name: 'a', type: { kind: 'field' }, visibility: 'private' },
        { name: 'b', type: { kind: 'field' }, visibility: 'private' },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [Fr.random()])).toThrow("Function 'test' expects 2 argument(s) but received 1");
  });

  it('throws when string is longer than declared length', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'label',
          type: { kind: 'string', length: 3 },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, ['abcdef'])).toThrow(
      "Expected string of max length 3 for 'label' but received length 6",
    );
  });

  it('throws when unsigned integer overflows declared width', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'count',
          type: { kind: 'integer', sign: 'unsigned', width: 8 },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [256])).toThrow(
      "Value 256 does not fit in u8 for 'count' (valid range: 0 to 255)",
    );
    expect(() => encodeArguments(abi, [-1])).toThrow("Value -1 does not fit in u8 for 'count' (valid range: 0 to 255)");
    expect(encodeArguments(abi, [255])).toEqual([new Fr(255n)]);
    expect(encodeArguments(abi, [0])).toEqual([new Fr(0n)]);
  });

  it('throws when signed integer overflows declared width', () => {
    const abi: FunctionAbi = {
      name: 'test',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'value',
          type: { kind: 'integer', sign: 'signed', width: 8 },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(() => encodeArguments(abi, [128])).toThrow(
      "Value 128 does not fit in i8 for 'value' (valid range: -128 to 127)",
    );
    expect(() => encodeArguments(abi, [-129])).toThrow(
      "Value -129 does not fit in i8 for 'value' (valid range: -128 to 127)",
    );
    expect(encodeArguments(abi, [127])).toEqual([new Fr(127n)]);
    expect(encodeArguments(abi, [-128])).toEqual([new Fr(128n)]);
  });

  it('throws when passing string argument as field', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
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

    expect(() => encodeArguments(testFunctionAbi, args)).toThrow('Tried to create a Fr from an invalid string');
  });

  it('throws when passing string argument as integer', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
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

  it("encodes negative signed integers as two's complement", () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'test',
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isInitializer: false,
      isStatic: false,
      parameters: [
        {
          name: 'value',
          type: { kind: 'integer', sign: 'signed', width: 8 },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    expect(encodeArguments(testFunctionAbi, [0])).toEqual([new Fr(0n)]);
    expect(encodeArguments(testFunctionAbi, [-128])).toEqual([new Fr(128n)]);
    expect(encodeArguments(testFunctionAbi, [127])).toEqual([new Fr(127n)]);
    expect(encodeArguments(testFunctionAbi, [-1])).toEqual([new Fr(255n)]);

    // Also check strings are properly encoded
    expect(encodeArguments(testFunctionAbi, ['-1'])).toEqual([new Fr(255n)]);
  });

  it('throws when passing object argument as field', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
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

  describe('bounded vec of fields', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'test',
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isInitializer: false,
      isStatic: false,
      parameters: [
        {
          name: 'vec',
          type: {
            kind: 'struct',
            path: 'std::collections::bounded_vec::BoundedVec',
            fields: [
              {
                name: 'storage',
                type: {
                  kind: 'array',
                  length: 2,
                  type: { kind: 'field' },
                },
              },
              {
                name: 'len',
                type: {
                  kind: 'integer',
                  sign: 'unsigned',
                  width: 32,
                },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    it('encodes empty array as bounded vec', () => {
      const args = [[]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([Fr.ZERO, Fr.ZERO, new Fr(0n)]); // Two zeros for storage, one for length
    });

    it('encodes array with one element', () => {
      const args = [[42n]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([new Fr(42n), Fr.ZERO, new Fr(1n)]); // One value, one padding zero, length 1
    });

    it('encodes array at max length', () => {
      const args = [[123n, 456n]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([new Fr(123n), new Fr(456n), new Fr(2n)]); // Two values, length 2
    });

    it('throws when array length exceeds bounded vec max length', () => {
      const args = [[1n, 2n, 3n]]; // Array with length 3 when max is 2
      expect(() => encodeArguments(testFunctionAbi, args)).toThrow(
        "Error encoding param 'vec': expected an array of maximum length 2 and got 3 instead: [ 1, 2, 3 ]",
      );
    });
  });

  describe('bounded vec of complex structs', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'test',
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isInitializer: false,
      isStatic: false,
      parameters: [
        {
          name: 'vec',
          type: {
            kind: 'struct',
            path: 'std::collections::bounded_vec::BoundedVec',
            fields: [
              {
                name: 'storage',
                type: {
                  kind: 'array',
                  length: 2,
                  type: {
                    kind: 'struct',
                    path: 'my_crate::my_struct::MyStruct',
                    fields: [
                      {
                        name: 'a',
                        type: { kind: 'field' },
                      },
                      {
                        name: 'b',
                        type: { kind: 'field' },
                      },
                    ],
                  },
                },
              },
              {
                name: 'len',
                type: {
                  kind: 'integer',
                  sign: 'unsigned',
                  width: 32,
                },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    it('encodes empty array as bounded ve', () => {
      const args = [[]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]); // Four zeros for storage (2 structs * 2 fields), one for length
    });

    it('encodes array with one element', () => {
      const args = [[{ a: 42n, b: 43n }]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([new Fr(42n), new Fr(43n), Fr.ZERO, Fr.ZERO, new Fr(1n)]); // One struct (2 fields), one padding struct (2 zeros), length 1
    });

    it('encodes array at max length', () => {
      const args = [
        [
          { a: 123n, b: 124n },
          { a: 456n, b: 457n },
        ],
      ];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([new Fr(123n), new Fr(124n), new Fr(456n), new Fr(457n), new Fr(2n)]); // Two structs (4 fields total), length 2
    });

    it('throws when array length exceeds bounded vec max length', () => {
      const args = [
        [
          { a: 1n, b: 2n },
          { a: 3n, b: 4n },
          { a: 5n, b: 6n },
        ],
      ]; // Array with length 3 when max is 2
      expect(() => encodeArguments(testFunctionAbi, args)).toThrow(
        "Error encoding param 'vec': expected an array of maximum length 2 and got 3 instead: [ {a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6} ]",
      );
    });
  });

  describe('bounded vec of arrays', () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'test',
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isInitializer: false,
      isStatic: false,
      parameters: [
        {
          name: 'vec',
          type: {
            kind: 'struct',
            path: 'std::collections::bounded_vec::BoundedVec',
            fields: [
              {
                name: 'storage',
                type: {
                  kind: 'array',
                  length: 2,
                  type: {
                    kind: 'array',
                    length: 3,
                    type: { kind: 'field' },
                  },
                },
              },
              {
                name: 'len',
                type: {
                  kind: 'integer',
                  sign: 'unsigned',
                  width: 32,
                },
              },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };

    it('encodes empty array as bounded vec', () => {
      const args = [[]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO, // First array (3 fields)
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO, // Second array (3 fields)
        Fr.ZERO, // Length
      ]);
    });

    it('encodes array with one element', () => {
      const args = [[[1n, 2n, 3n]]];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([
        new Fr(1n),
        new Fr(2n),
        new Fr(3n), // First array
        Fr.ZERO,
        Fr.ZERO,
        Fr.ZERO, // Padding array
        new Fr(1n), // Length 1
      ]);
    });

    it('encodes array at max length', () => {
      const args = [
        [
          [1n, 2n, 3n],
          [4n, 5n, 6n],
        ],
      ];
      const result = encodeArguments(testFunctionAbi, args);
      expect(result).toEqual([
        new Fr(1n),
        new Fr(2n),
        new Fr(3n), // First array
        new Fr(4n),
        new Fr(5n),
        new Fr(6n), // Second array
        new Fr(2n), // Length 2
      ]);
    });

    it('throws when array length exceeds bounded vec max length', () => {
      const args = [
        [
          [1n, 2n, 3n],
          [4n, 5n, 6n],
          [7n, 8n, 9n],
        ],
      ];
      expect(() => encodeArguments(testFunctionAbi, args)).toThrow(
        "Error encoding param 'vec': expected an array of maximum length 2 and got 3 instead: [ [1, 2, 3], [4, 5, 6], [7, 8, 9] ]",
      );
    });
  });
});
