import { BufferCursor } from './buffer_cursor.js';
import { InstructionSet, decodeBytecode } from './bytecode_serialization.js';
import { Opcode } from './opcodes/instruction_serialization.js';

class InstA {
  constructor(private n: number) {}
  static readonly opcode: number = 1;
 
  public static deserialize(buf: BufferCursor): InstA {
    return new InstA(buf.readUint16BE());
  }

  public serialize(): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUint16BE(this.n);
    return buf;
  }
}

class InstB {
  constructor(private n: bigint) {}
  static readonly opcode: number = 2;

  public static deserialize(buf: BufferCursor): InstB {
    // just something simple!
    return new InstB(buf.readBigInt64BE());
  }

  public serialize(): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(this.n);
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
    const bytecode = Buffer.concat([Buffer.of(InstA.opcode), a.serialize(), Buffer.of(InstB.opcode), b.serialize()]);

    const actual = decodeBytecode(bytecode, instructionSet);
    expect(actual).toEqual([a, b]);
  });
});
