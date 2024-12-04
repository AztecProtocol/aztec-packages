import { strict as assert } from 'assert';

import { AvmParsingError, InvalidOpcodeError, InvalidTagValueError } from '../errors.js';
import { Add, Call, EnvironmentVariable, GetEnvVar, StaticCall, Sub } from '../opcodes/index.js';
import { type BufferCursor } from './buffer_cursor.js';
import { type InstructionSet, decodeFromBytecode, encodeToBytecode } from './bytecode_serialization.js';
import { MAX_OPCODE_VALUE, Opcode } from './instruction_serialization.js';

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
      new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 1, EnvironmentVariable.ADDRESS).as(
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
      new GetEnvVar(/*indirect=*/ 0, /*dstOffset=*/ 1, EnvironmentVariable.ADDRESS).as(
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

  it('Should throw an InvalidOpcodeError while deserializing an out-of-range opcode value', () => {
    const decodeInvalid = () => {
      const wrongOpcode: number = MAX_OPCODE_VALUE + 1;
      const buf = Buffer.alloc(1);
      buf.writeUint8(wrongOpcode);
      decodeFromBytecode(buf);
    };

    expect(decodeInvalid).toThrow(InvalidOpcodeError);
  });

  it('Should throw an InvalidOpcodeError while deserializing an opcode value not in instruction set', () => {
    const decodeInvalid = () => {
      const instructionSet: InstructionSet = new Map<Opcode, any>([
        [InstA.opcode, InstA.deserialize],
        [InstB.opcode, InstB.deserialize],
      ]);
      const buf = Buffer.alloc(1);
      buf.writeUint8(Opcode.AND_8); // Valid opcode but not in supplied instruction set.
      decodeFromBytecode(buf, instructionSet);
    };

    expect(decodeInvalid).toThrow(InvalidOpcodeError);
  });

  it('Should throw an AvmParsingError while deserializing an incomplete instruction', () => {
    const decodeIncomplete = (truncated: Buffer) => {
      return () => decodeFromBytecode(truncated);
    };

    const instructions = [
      new Call(
        /*indirect=*/ 0x01,
        /*gasOffset=*/ 0x1234,
        /*addrOffset=*/ 0xa234,
        /*argsOffset=*/ 0xb234,
        /*argsSize=*/ 0xc234,
        /*successOffset=*/ 0xf234,
      ),
    ];

    const bytecode = encodeToBytecode(instructions);

    for (let i = 1; i < bytecode.length; i++) {
      const truncated = bytecode.subarray(0, bytecode.length - i);
      expect(decodeIncomplete(truncated)).toThrow(AvmParsingError);
    }
  });

  it('Should throw an InvalidTagValueError while deserializing a tag value out of range', () => {
    const decodeInvalidTag = (buf: Buffer) => {
      return () => decodeFromBytecode(buf);
    };

    const bufCast8 = Buffer.from([
      Opcode.CAST_8, // opcode
      0x01, // indirect
      0x10, // aOffset
      0x32, // dstOffset
      0x12, // dstTag (invalid tag)
    ]);

    const bufCast16 = Buffer.from([
      Opcode.CAST_16, // opcode
      0x00, // indirect
      ...Buffer.from('1234', 'hex'), // aOffset
      ...Buffer.from('3456', 'hex'), // dstOffset
      0x65, // dstTag (invalid tag)
    ]);

    const bufSet16 = Buffer.from([
      Opcode.SET_16, //opcode
      0x02, // indirect
      ...Buffer.from('3456', 'hex'), // dstOffset
      0x21, //tag (invalid)
      ...Buffer.from('2397', 'hex'), // value
    ]);

    for (const buf of [bufCast8, bufCast16, bufSet16]) {
      expect(decodeInvalidTag(buf)).toThrow(InvalidTagValueError);
    }
  });
});
