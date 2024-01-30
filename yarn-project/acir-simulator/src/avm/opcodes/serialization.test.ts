import { OperandPair, OperandType, deserialize, serialize } from './serialization.js';

class C {
  constructor(private a: number, private b: number, private c: number, private d: bigint, private e: bigint) {}
  static readonly operands: OperandPair[] = [
    [(c: C) => c.a, OperandType.UINT8],
    [(c: C) => c.b, OperandType.UINT16],
    [(c: C) => c.c, OperandType.UINT32],
    [(c: C) => c.d, OperandType.UINT64],
    [(c: C) => c.e, OperandType.UINT128],
  ];
}

describe('Serialization', () => {
  it('Should serialize all types from OperandPair[]', () => {
    const instance = new C(0x12, 0x1234, 0x12345678, 0x1234567887654321n, 0x1234567887654321abcdef0000fedcban);
    const actual: Buffer = serialize(C.operands, instance);

    expect(actual).toEqual(
      Buffer.from(
        [
          // a
          '12',
          // b
          '1234',
          // c
          '12345678',
          // d
          '1234567887654321',
          // e
          '1234567887654321ABCDEF0000FEDCBA',
        ].join(''),
        'hex',
      ),
    );
  });

  it('Should deserialize all types from OperandPair[]', () => {
    const buffer = Buffer.from(
      [
        // a
        '12',
        // b
        '1234',
        // c
        '12345678',
        // d
        '1234567887654321',
        // e
        '1234567887654321ABCDEF0000FEDCBA',
      ].join(''),
      'hex',
    );

    const params = deserialize(buffer, C.operands) as ConstructorParameters<typeof C>;

    const actual = new C(...params);
    const expected = new C(0x12, 0x1234, 0x12345678, 0x1234567887654321n, 0x1234567887654321abcdef0000fedcban);
    expect(actual).toEqual(expected);
  });
});
