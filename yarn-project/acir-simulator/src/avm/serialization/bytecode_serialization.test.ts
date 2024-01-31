import { BufferCursor } from './buffer_cursor.js';
import { InstructionSet, decodeFromBytecode, encodeToBytecode } from './bytecode_serialization.js';
import { Opcode } from './instruction_serialization.js';

class InstA {
  constructor(private n: number) {}
  static readonly opcode: number = 1;

  public static deserialize(buf: BufferCursor): InstA {
    return new InstA(buf.readUint16BE());
  }

  public serialize(): Buffer {
    const buf = Buffer.alloc(1 + 2);
    buf.writeUint8(InstA.opcode);
    buf.writeUint16BE(this.n, 1);
    return buf;
  }
}

class InstB {
  constructor(private n: bigint) {}
  static readonly opcode: number = 2;

  public static deserialize(buf: BufferCursor): InstB {
    return new InstB(buf.readBigInt64BE());
  }

  public serialize(): Buffer {
    const buf = Buffer.alloc(1 + 8);
    buf.writeUint8(InstB.opcode);
    buf.writeBigInt64BE(this.n, 1);
    return buf;
  }
}

describe('Bytecode Serialization', () => {
  it('Should deserialize using instruction set', () => {
    const instructionSet: InstructionSet = new Map<Opcode, any>([
      [InstA.opcode, InstA],
      [InstB.opcode, InstB],
    ]);
    const a = new InstA(1234);
    const b = new InstB(5678n);
    const bytecode = Buffer.concat([a.serialize(), b.serialize()]);

    const actual = decodeFromBytecode(bytecode, instructionSet);

    expect(actual).toEqual([a, b]);
  });

  it('Should serialize using instruction.serialize()', () => {
    const a = new InstA(1234);
    const b = new InstB(5678n);

    const actual = encodeToBytecode([a, b]);

    const expected = Buffer.concat([a.serialize(), b.serialize()]);
    expect(actual).toEqual(expected);
  });
});
