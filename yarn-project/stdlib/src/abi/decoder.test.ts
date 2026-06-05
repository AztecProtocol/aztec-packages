import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';

import { AztecAddress } from '../aztec-address/index.js';
import type { ABIParameterVisibility, FunctionArtifact } from './abi.js';
import { decodeFromAbi } from './decoder.js';
import { decodeFunctionSignature, decodeFunctionSignatureWithParameterNames } from './function_signature_decoder.js';

describe('abi/decoder', () => {
  // Copied from noir-contracts/contracts/test_contract/target/Test.json
  const abi = {
    name: 'testCodeGen',
    parameters: [
      { name: 'aField', type: { kind: 'field' }, visibility: 'private' },
      { name: 'aBool', type: { kind: 'boolean' }, visibility: 'private' },
      { name: 'aNumber', type: { kind: 'integer', sign: 'unsigned', width: 32 }, visibility: 'private' },
      { name: 'anArray', type: { kind: 'array', length: 2, type: { kind: 'field' } }, visibility: 'private' },
      {
        name: 'aStruct',
        type: {
          kind: 'struct',
          path: 'Test::DummyNote',
          fields: [
            { name: 'amount', type: { kind: 'field' } },
            { name: 'secretHash', type: { kind: 'field' } },
          ],
        },
        visibility: 'private' as ABIParameterVisibility,
      },
      {
        name: 'aDeepStruct',
        type: {
          kind: 'struct',
          path: 'Test::DeepStruct',
          fields: [
            { name: 'aField', type: { kind: 'field' } },
            { name: 'aBool', type: { kind: 'boolean' } },
            {
              name: 'aNote',
              type: {
                kind: 'struct',
                path: 'Test::DummyNote',
                fields: [
                  { name: 'amount', type: { kind: 'field' } },
                  { name: 'secretHash', type: { kind: 'field' } },
                ],
              },
            },
            {
              name: 'manyNotes',
              type: {
                kind: 'array',
                length: 3,
                type: {
                  kind: 'struct',
                  path: 'Test::DummyNote',
                  fields: [
                    { name: 'amount', type: { kind: 'field' } },
                    { name: 'secretHash', type: { kind: 'field' } },
                  ],
                },
              },
            },
          ],
        },
        visibility: 'private' as ABIParameterVisibility,
      },
    ],
  } as Pick<FunctionArtifact, 'name' | 'parameters'>;

  it('decodes function signature', () => {
    expect(decodeFunctionSignature(abi.name, abi.parameters)).toMatchInlineSnapshot(
      `"testCodeGen(Field,bool,u32,[Field;2],(Field,Field),(Field,bool,(Field,Field),[(Field,Field);3]))"`,
    );
  });

  it('decodes function signature with parameter names', () => {
    expect(decodeFunctionSignatureWithParameterNames(abi.name, abi.parameters)).toMatchInlineSnapshot(
      `"testCodeGen(aField: Field, aBool: bool, aNumber: u32, anArray: [Field;2], aStruct: (amount: Field, secretHash: Field), aDeepStruct: (aField: Field, aBool: bool, aNote: (amount: Field, secretHash: Field), manyNotes: [(amount: Field, secretHash: Field);3]))"`,
    );
  });
});

describe('decoder', () => {
  it('decodes an i8', () => {
    let decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 8,
        },
      ],
      [Fr.fromBuffer(Buffer.from('00000000000000000000000000000000000000000000000000000000000000ff', 'hex'))],
    );
    expect(decoded).toBe(-1n);

    decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 8,
        },
      ],
      [Fr.fromBuffer(Buffer.from('000000000000000000000000000000000000000000000000000000000000007f', 'hex'))],
    );
    expect(decoded).toBe(2n ** 7n - 1n);
  });

  it('decodes an i16', () => {
    let decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 16,
        },
      ],
      [Fr.fromBuffer(Buffer.from('000000000000000000000000000000000000000000000000000000000000ffff', 'hex'))],
    );
    expect(decoded).toBe(-1n);

    decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 16,
        },
      ],
      [Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000007fff', 'hex'))],
    );
    expect(decoded).toBe(2n ** 15n - 1n);
  });

  it('decodes an i32', () => {
    let decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 32,
        },
      ],
      [Fr.fromBuffer(Buffer.from('00000000000000000000000000000000000000000000000000000000ffffffff', 'hex'))],
    );
    expect(decoded).toBe(-1n);

    decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 32,
        },
      ],
      [Fr.fromBuffer(Buffer.from('000000000000000000000000000000000000000000000000000000007fffffff', 'hex'))],
    );
    expect(decoded).toBe(2n ** 31n - 1n);
  });

  it('decodes an i64', () => {
    let decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 64,
        },
      ],
      [Fr.fromBuffer(Buffer.from('000000000000000000000000000000000000000000000000ffffffffffffffff', 'hex'))],
    );
    expect(decoded).toBe(-1n);

    decoded = decodeFromAbi(
      [
        {
          kind: 'integer',
          sign: 'signed',
          width: 64,
        },
      ],
      [Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000007fffffffffffffff', 'hex'))],
    );
    expect(decoded).toBe(2n ** 63n - 1n);
  });

  it('decodes a tuple', () => {
    // ABI copied from noir-projects/noir-contracts/target/returning_tuple_contract-ReturningTuple.json
    const decoded = decodeFromAbi(
      [
        {
          kind: 'tuple',
          fields: [
            {
              kind: 'field',
            },
            {
              kind: 'integer',
              sign: 'unsigned',
              width: 128,
            },
            {
              kind: 'boolean',
            },
            {
              kind: 'string',
              length: 3,
            },
            {
              kind: 'struct',
              path: 'aztec::protocol_types::address::aztec_address::AztecAddress',
              fields: [
                {
                  name: 'inner',
                  type: {
                    kind: 'field',
                  },
                },
              ],
            },
            {
              kind: 'struct',
              path: 'std::embedded_curve_ops::EmbeddedCurvePoint',
              fields: [
                {
                  name: 'x',
                  type: {
                    kind: 'field',
                  },
                },
                {
                  name: 'y',
                  type: {
                    kind: 'field',
                  },
                },
              ],
            },
          ],
        },
      ],
      [
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')), // field
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000002', 'hex')), // u128
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')), // bool
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000078', 'hex')), // "x"
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000079', 'hex')), // "y"
        Fr.fromBuffer(Buffer.from('000000000000000000000000000000000000000000000000000000000000007a', 'hex')), // "z"
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')), // address
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')), // point.x
        Fr.fromBuffer(Buffer.from('0000000000000000000000000000000000000000000000000000000000000002', 'hex')), // point.y
      ],
    );

    expect(decoded).toEqual([1n, 2n, false, 'xyz', AztecAddress.fromBigInt(1n), { x: 1n, y: 2n }]);
  });

  it('decodes Option::Some as the wrapped value', () => {
    const decoded = decodeFromAbi(
      [
        {
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
                ],
              },
            },
          ],
        },
      ],
      [new Fr(1n), new Fr(7n), new Fr(1n)],
    );

    expect(decoded).toEqual({ w: 7n, x: true });
  });

  it('decodes Option::None as undefined', () => {
    const decoded = decodeFromAbi(
      [
        {
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
                ],
              },
            },
          ],
        },
      ],
      [Fr.ZERO, new Fr(7n), new Fr(1n)],
    );

    expect(decoded).toBeUndefined();
  });

  it('decodes EthAddress struct as EthAddress instance', () => {
    const field = new Fr(0xdeadbeefn);
    const decoded = decodeFromAbi(
      [
        {
          kind: 'struct',
          path: 'aztec::protocol_types::address::EthAddress',
          fields: [{ name: 'inner', type: { kind: 'field' } }],
        },
      ],
      [field],
    );

    expect(decoded).toBeInstanceOf(EthAddress);
    expect(decoded).toEqual(EthAddress.fromField(field));
  });

  it('decodes wrapped field struct as Fr', () => {
    const field = new Fr(42n);
    const decoded = decodeFromAbi(
      [
        {
          kind: 'struct',
          path: 'some::custom::WrappedType',
          fields: [{ name: 'inner', type: { kind: 'field' } }],
        },
      ],
      [field],
    );

    expect(decoded).toBeInstanceOf(Fr);
    expect(decoded).toEqual(field);
  });

  it('decodes EthAddress inside a larger struct', () => {
    const addressField = new Fr(0x1234n);
    const amountField = new Fr(100n);
    const decoded = decodeFromAbi(
      [
        {
          kind: 'struct',
          path: 'MyContract::MyEvent',
          fields: [
            {
              name: 'recipient',
              type: {
                kind: 'struct',
                path: 'aztec::protocol_types::address::EthAddress',
                fields: [{ name: 'inner', type: { kind: 'field' } }],
              },
            },
            { name: 'amount', type: { kind: 'field' } },
          ],
        },
      ],
      [addressField, amountField],
    );

    expect(decoded).toEqual({
      recipient: EthAddress.fromField(addressField),
      amount: 100n,
    });
  });
});
