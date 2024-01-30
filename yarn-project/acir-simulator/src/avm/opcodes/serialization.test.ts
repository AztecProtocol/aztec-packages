import { BufferCursor } from '../buffer_cursor.js';
import {
  DeserializableInstruction,
  InstructionSet,
  Opcode,
  OperandPair,
  OperandType,
  decodeBytecode,
  deserialize,
  serialize,
} from './serialization.js';

class InstA {
  constructor(private a: number, private b: number, private c: number, private d: bigint, private e: bigint) {}

  static readonly opcode: number = 1;
  static readonly wireFormat: OperandPair[] = [
    [(c: InstA) => c.a, OperandType.UINT8],
    [(c: InstA) => c.b, OperandType.UINT16],
    [(c: InstA) => c.c, OperandType.UINT32],
    [(c: InstA) => c.d, OperandType.UINT64],
    [(c: InstA) => c.e, OperandType.UINT128],
  ];

  public static deserialize(buf: BufferCursor): InstA {
    const args = deserialize(buf, InstA.wireFormat) as ConstructorParameters<typeof InstA>;
    return new InstA(...args);
  }

  public serialize(): Buffer {
    return serialize(InstA.wireFormat, this);
  }
}

class InstB {
  constructor(private a: number, private b: bigint) {}

  static readonly opcode: number = 2;
  static readonly wireFormat: OperandPair[] = [
    [(c: InstB) => c.a, OperandType.UINT8],
    [(c: InstB) => c.b, OperandType.UINT64],
  ];

  public static deserialize(buf: BufferCursor): InstB {
    const args = deserialize(buf, InstB.wireFormat) as ConstructorParameters<typeof InstB>;
    return new InstB(...args);
  }

  public serialize(): Buffer {
    return serialize(InstB.wireFormat, this);
  }
}

describe('Instruction Serialization', () => {
  it('Should serialize all types from OperandPair[]', () => {
    const instance = new InstA(0x12, 0x1234, 0x12345678, 0x1234567887654321n, 0x1234567887654321abcdef0000fedcban);
    const actual: Buffer = serialize(InstA.wireFormat, instance);

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

    const params = deserialize(new BufferCursor(buffer), InstA.wireFormat) as ConstructorParameters<typeof InstA>;

    const actual = new InstA(...params);
    const expected = new InstA(0x12, 0x1234, 0x12345678, 0x1234567887654321n, 0x1234567887654321abcdef0000fedcban);
    expect(actual).toEqual(expected);
  });
});

describe('Bytecode Serialization', () => {
  it('Should deserialize using instruction set', () => {
    const instructionSet: InstructionSet = new Map<Opcode, any>([
      [InstA.opcode, InstA.deserialize],
      [InstB.opcode, InstB.deserialize],
    ]);
    const a = new InstA(0, 1, 2, 3n, 4n);
    const b = new InstB(1, 2n);
    const bytecode = Buffer.concat([Buffer.of(InstA.opcode), a.serialize(), Buffer.of(InstB.opcode), b.serialize()]);

    const actual = decodeBytecode(bytecode, instructionSet);
    expect(actual).toEqual([a, b]);
  });
});
