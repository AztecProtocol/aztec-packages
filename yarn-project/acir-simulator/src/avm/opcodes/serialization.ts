import { BufferCursor } from "../buffer_cursor.js";
import { Add, Sub } from "./arithmetic.js"; // FIX: Dependency cycle
import { Instruction } from "./instruction.js";

export enum OperandType {
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
}

export type OperandPair = [(c: any) => any, OperandType];

function readBigInt128BE(this: Buffer): bigint {
  const totalBytes = 16;
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret <<= 8n;
    ret |= BigInt(this.readUint8(i));
  }
  return ret;
}

function writeBigInt128BE(this: Buffer, value: bigint): void {
  const totalBytes = 16;
  for (let offset = totalBytes - 1; offset >= 0; --offset) {
    this.writeUint8(Number(value & 0xffn), offset);
    value >>= 8n;
  }
}

const OPERAND_SPEC: Map<OperandType, [number, () => any, (value: any) => any]> = new Map([
  [OperandType.UINT8, [1, Buffer.prototype.readUint8, Buffer.prototype.writeUint8]],
  [OperandType.UINT16, [2, Buffer.prototype.readUint16BE, Buffer.prototype.writeUint16BE]],
  [OperandType.UINT32, [4, Buffer.prototype.readUint32BE, Buffer.prototype.writeUint32BE]],
  [OperandType.UINT64, [8, Buffer.prototype.readBigInt64BE, Buffer.prototype.writeBigInt64BE]],
  [OperandType.UINT128, [16, readBigInt128BE, writeBigInt128BE]],
]);

export function deserialize(cursor: BufferCursor, operands: OperandPair[]): any[] {
  const argValues = [];

  for (const op of operands) {
    const [_opGetter, opType] = op;
    const [sizeBytes, reader, _writer] = OPERAND_SPEC.get(opType)!;
    argValues.push(reader.call(cursor.bufferAtPosition()));
    cursor.advance(sizeBytes);
  }

  return argValues;
}

export function serialize(operands: OperandPair[], cls: any): Buffer {
  const chunks: Buffer[] = [];

  for (const op of operands) {
    const [opGetter, opType] = op;
    const [sizeBytes, _reader, writer] = OPERAND_SPEC.get(opType)!;
    const buf = Buffer.alloc(sizeBytes);
    writer.call(buf, opGetter(cls));
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

/**
 * All AVM opcodes. (Keep in sync with cpp counterpart code AvmMini_opcode.hpp).
 * Source: https://yp-aztec.netlify.app/docs/public-vm/instruction-set
 */
export enum Opcode {
  ADD = 0x00,
  SUB = 0x01,
  MUL = 0x02,
  DIV = 0x03,
  EQ = 0x04,
  LT = 0x05,
  LTE = 0x06,
  AND = 0x07,
  OR = 0x08,
  XOR = 0x09,
  NOT = 0x0a,
  SHL = 0x0b,
  SHR = 0x0c,
  CAST = 0x0d,
  ADDRESS = 0x0e,
  STORAGEADDRESS = 0x0f,
  ORIGIN = 0x10,
  SENDER = 0x11,
  PORTAL = 0x12,
  FEEPERL1GAS = 0x13,
  FEEPERL2GAS = 0x14,
  FEEPERDAGAS = 0x15,
  CONTRACTCALLDEPTH = 0x16,
  CHAINID = 0x17,
  VERSION = 0x18,
  BLOCKNUMBER = 0x19,
  TIMESTAMP = 0x1a,
  COINBASE = 0x1b,
  BLOCKL1GASLIMIT = 0x1c,
  BLOCKL2GASLIMIT = 0x1d,
  BLOCKDAGASLIMIT = 0x1e,
  CALLDATACOPY = 0x1f,
  L1GASLEFT = 0x20,
  L2GASLEFT = 0x21,
  DAGASLEFT = 0x22,
  JUMP = 0x23,
  JUMPI = 0x24,
  INTERNALCALL = 0x25,
  INTERNALRETURN = 0x26,
  SET = 0x27,
  MOV = 0x28,
  CMOV = 0x29,
  BLOCKHEADERBYNUMBER = 0x2a,
  SLOAD = 0x2b, // Public Storage
  SSTORE = 0x2c, // Public Storage
  READL1TOL2MSG = 0x2d, // Messages
  SENDL2TOL1MSG = 0x2e, // Messages
  EMITNOTEHASH = 0x2f, // Notes & Nullifiers
  EMITNULLIFIER = 0x30, // Notes & Nullifiers
  EMITUNENCRYPTEDLOG = 0x31,
  CALL = 0x32,
  STATICCALL = 0x33,
  RETURN = 0x34,
  REVERT = 0x35,
  KECCAK = 0x36,
  POSEIDON = 0x37,
  // Add new opcodes before this
  TOTAL_OPCODES_NUMBER,
}

export interface DeserializableInstruction {
  deserialize(buf: BufferCursor): Instruction;
}

export type InstructionSet = Map<Opcode, DeserializableInstruction>;
const INSTRUCTION_SET: InstructionSet = new Map<Opcode, DeserializableInstruction>([
  // new Array<[Opcode, InstructionConstructorAndMembers]>(
    // Compute
    // Compute - Arithmetic
    [Add.opcode, Add],
    [Sub.opcode, Sub],
    // [Opcode.SUB, Sub],
    // [Opcode.MUL, Mul],
    // [Opcode.DIV, Div],
    // //// Compute - Comparators
    // //[Opcode.EQ, Eq],
    // //[Opcode.LT, Lt],
    // //[Opcode.LTE, Lte],
    // //// Compute - Bitwise
    // [Opcode.AND, And],
    // [Opcode.OR, Or],
    // [Opcode.XOR, Xor],
    // [Opcode.NOT, Not],
    // [Opcode.SHL, Shl],
    // [Opcode.SHR, Shr],
    // //// Compute - Type Conversions
    // [Opcode.CAST, Cast],

    // //// Execution Environment
    // //[Opcode.ADDRESS, Address],
    // //[Opcode.STORAGEADDRESS, Storageaddress],
    // //[Opcode.ORIGIN, Origin],
    // //[Opcode.SENDER, Sender],
    // //[Opcode.PORTAL, Portal],
    // //[Opcode.FEEPERL1GAS, Feeperl1gas],
    // //[Opcode.FEEPERL2GAS, Feeperl2gas],
    // //[Opcode.FEEPERDAGAS, Feeperdagas],
    // //[Opcode.CONTRACTCALLDEPTH, Contractcalldepth],
    // //// Execution Environment - Globals
    // //[Opcode.CHAINID, Chainid],
    // //[Opcode.VERSION, Version],
    // //[Opcode.BLOCKNUMBER, Blocknumber],
    // //[Opcode.TIMESTAMP, Timestamp],
    // //[Opcode.COINBASE, Coinbase],
    // //[Opcode.BLOCKL1GASLIMIT, Blockl1gaslimit],
    // //[Opcode.BLOCKL2GASLIMIT, Blockl2gaslimit],
    // //[Opcode.BLOCKDAGASLIMIT, Blockdagaslimit],
    // // Execution Environment - Calldata
    // [Opcode.CALLDATACOPY, CalldataCopy],

    // //// Machine State
    // // Machine State - Gas
    // //[Opcode.L1GASLEFT, L1gasleft],
    // //[Opcode.L2GASLEFT, L2gasleft],
    // //[Opcode.DAGASLEFT, Dagasleft],
    // //// Machine State - Internal Control Flow
    // [Opcode.JUMP, Jump],
    // [Opcode.JUMPI, JumpI],
    // [Opcode.INTERNALCALL, InternalCall],
    // [Opcode.INTERNALRETURN, InternalReturn],
    // //// Machine State - Memory
    // [Opcode.SET, Set],
    // [Opcode.MOV, Mov],
    // [Opcode.CMOV, CMov],

    // //// World State
    // //[Opcode.BLOCKHEADERBYNUMBER, Blockheaderbynumber],
    // [Opcode.SLOAD, SLoad], // Public Storage
    // [Opcode.SSTORE, SStore], // Public Storage
    // //[Opcode.READL1TOL2MSG, Readl1tol2msg], // Messages
    // //[Opcode.SENDL2TOL1MSG, Sendl2tol1msg], // Messages
    // //[Opcode.EMITNOTEHASH, Emitnotehash], // Notes & Nullifiers
    // //[Opcode.EMITNULLIFIER, Emitnullifier], // Notes & Nullifiers

    // //// Accrued Substate
    // //[Opcode.EMITUNENCRYPTEDLOG, Emitunencryptedlog],

    // //// Control Flow - Contract Calls
    // // [Opcode.CALL, Call],
    // //[Opcode.STATICCALL, Staticcall],
    // [Opcode.RETURN, Return],
    // //[Opcode.REVERT, Revert],

    // //// Gadgets
    // //[Opcode.KECCAK, Keccak],
    // //[Opcode.POSEIDON, Poseidon],
]//),
);

/**
 * Encode an instruction (opcode & arguments) to bytecode.
 * @param opcode - the opcode to encode
 * @param args - the arguments to encode
 * @returns the bytecode for this one instruction
 */
// export function encodeToBytecode(opcode: Opcode, args: number[]): Buffer {
//   const instructionType = INSTRUCTION_SET.get(opcode);
//   if (instructionType === undefined) {
//     throw new Error(`Opcode 0x${opcode.toString(16)} not implemented`);
//   }

//   const numberOfOperands = instructionType.numberOfOperands;
//   if (args.length !== numberOfOperands) {
//     throw new Error(
//       `Opcode 0x${opcode.toString(16)} expects ${numberOfOperands} arguments, but ${args.length} were provided`,
//     );
//   }

//   const bytecode = Buffer.alloc(AVM_OPCODE_BYTE_LENGTH + numberOfOperands * AVM_OPERAND_BYTE_LENGTH);

//   let bytePtr = 0;
//   bytecode.writeUInt8(opcode as number, bytePtr);
//   bytePtr += AVM_OPCODE_BYTE_LENGTH;
//   for (let i = 0; i < args.length; i++) {
//     bytecode.writeUInt32BE(args[i], bytePtr);
//     bytePtr += AVM_OPERAND_BYTE_LENGTH;
//   }
//   return bytecode;
// }

/**
 * Convert a buffer of bytecode into an array of instructions
 * @param bytecode - Buffer of bytecode
 * @returns Bytecode decoded into an ordered array of Instructions
 */
export function decodeBytecode(bytecode: Buffer, instructionSet: InstructionSet = INSTRUCTION_SET): Instruction[] {
  const instructions: Instruction[] = [];
  const cursor = new BufferCursor(bytecode);

  while (bytecode.length > 0) {
    const opcode: Opcode = cursor.readUint8();
    const instructionDeserializerOrUndef = instructionSet.get(opcode);
    if (instructionDeserializerOrUndef === undefined) {
      throw new Error(`Opcode 0x${opcode.toString(16)} not implemented`);
    }

    const instructionDeserializer: DeserializableInstruction = instructionDeserializerOrUndef;
    const i: Instruction = instructionDeserializer.deserialize(cursor);
    instructions.push(i);
  }

  return instructions;
}
