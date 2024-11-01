import { strict as assert } from 'assert';

import { Add, Call, EnvironmentVariable, GetEnvVar, StaticCall, Sub } from '../opcodes/index.js';
import { type BufferCursor } from './buffer_cursor.js';
import { type InstructionSet, decodeFromBytecode, encodeToBytecode } from './bytecode_serialization.js';
import { Opcode } from './instruction_serialization.js';

class InstA {
  constructor(private n: number) {}
  static readonly opcode: number = 1;

  // Expects opcode.
  public static deserialize(buf: BufferCursor): InstA {
    const opcode: number = buf.readUint8();
    assert(opcode == InstA.opcode);
    return new InstA(buf.readUint16BE());
  }

  // Includes opcode.
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

  // Expects opcode.
  public static deserialize(buf: BufferCursor): InstB {
    const opcode: number = buf.readUint8();
    assert(opcode == InstB.opcode);
    return new InstB(buf.readBigInt64BE());
  }

  // Includes opcode.
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
      [InstA.opcode, InstA.deserialize],
      [InstB.opcode, InstB.deserialize],
    ]);
    const a = new InstA(0x1234);
    const b = new InstB(0x5678n);
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

  it('Should deserialize real instructions', () => {
    const instructions = [
      new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
      new Sub(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.SUB_8, Sub.wireFormat8),
      new GetEnvVar(/*indirect=*/ 0, EnvironmentVariable.ADDRESS, /*dstOffset=*/ 1).as(
        Opcode.GETENVVAR_16,
        GetEnvVar.wireFormat16,
      ),
      new Call(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSize=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      ),
      new StaticCall(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSize=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      ),
    ];
    const bytecode = Buffer.concat(instructions.map(i => i.serialize()));

    const actual = decodeFromBytecode(bytecode);

    expect(actual).toEqual(instructions);
  });

  it('Should serialize real instructions', () => {
    const instructions = [
      new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
      new Sub(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.SUB_8, Sub.wireFormat8),
      new GetEnvVar(/*indirect=*/ 0, EnvironmentVariable.ADDRESS, /*dstOffset=*/ 1).as(
        Opcode.GETENVVAR_16,
        GetEnvVar.wireFormat16,
      ),
      new Call(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSize=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      ),
      new StaticCall(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSize=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      ),
    ];

    const actual = encodeToBytecode(instructions);

    const expected = Buffer.concat(instructions.map(i => i.serialize()));
    expect(actual).toEqual(expected);
  });
});
