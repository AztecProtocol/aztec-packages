import { strict as assert } from 'assert';

import { BufferCursor } from './buffer_cursor.js';

/**
 * All AVM opcodes. (Keep in sync with cpp counterpart code avm_opcode.hpp and rs in opcodes.rs).
 * Source: https://yp-aztec.netlify.app/docs/public-vm/instruction-set
 */
export enum Opcode {
  // Compute
  ADD_8,
  ADD_16,
  SUB_8,
  SUB_16,
  MUL_8,
  MUL_16,
  DIV_8,
  DIV_16,
  FDIV_8,
  FDIV_16,
  EQ_8,
  EQ_16,
  LT_8,
  LT_16,
  LTE_8,
  LTE_16,
  AND_8,
  AND_16,
  OR_8,
  OR_16,
  XOR_8,
  XOR_16,
  NOT_8,
  NOT_16,
  SHL_8,
  SHL_16,
  SHR_8,
  SHR_16,
  CAST_8,
  CAST_16,
  // Execution environment
  GETENVVAR_16,
  CALLDATACOPY,
  RETURNDATASIZE,
  RETURNDATACOPY,
  // Control flow
  JUMP_32,
  JUMPI_32,
  INTERNALCALL,
  INTERNALRETURN,
  // Memory
  SET_8,
  SET_16,
  SET_32,
  SET_64,
  SET_128,
  SET_FF,
  MOV_8,
  MOV_16,
  // World state
  SLOAD,
  SSTORE,
  NOTEHASHEXISTS,
  EMITNOTEHASH,
  NULLIFIEREXISTS,
  EMITNULLIFIER,
  L1TOL2MSGEXISTS,
  GETCONTRACTINSTANCE,
  EMITUNENCRYPTEDLOG,
  SENDL2TOL1MSG,
  // External calls
  CALL,
  STATICCALL,
  RETURN,
  REVERT_8,
  REVERT_16,
  // Misc
  DEBUGLOG,
  // Gadgets
  POSEIDON2,
  SHA256COMPRESSION,
  KECCAKF1600,
  ECADD,
  MSM,
  // Conversion
  TORADIXBE,
}

export const MAX_OPCODE_VALUE = Math.max(
  ...Object.values(Opcode)
    .map(k => +k)
    .filter(k => !isNaN(k)),
);

// Possible types for an instruction's operand in its wire format. (Keep in sync with CPP code.
// See vm/avm_trace/deserialization.cpp)
// Note that cpp code introduced an additional enum value TAG to express the instruction tag. In TS,
// this one is parsed as UINT8.
export enum OperandType {
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
  FF,
}

type OperandNativeType = number | bigint;
type OperandWriter = (value: any) => void;

// Specifies how to read and write each operand type.
const OPERAND_SPEC = new Map<OperandType, [number, (offset: number) => OperandNativeType, OperandWriter]>([
  [OperandType.UINT8, [1, Buffer.prototype.readUint8, Buffer.prototype.writeUint8]],
  [OperandType.UINT16, [2, Buffer.prototype.readUint16BE, Buffer.prototype.writeUint16BE]],
  [OperandType.UINT32, [4, Buffer.prototype.readUint32BE, Buffer.prototype.writeUint32BE]],
  [OperandType.UINT64, [8, Buffer.prototype.readBigInt64BE, Buffer.prototype.writeBigInt64BE]],
  [OperandType.UINT128, [16, readBigInt128BE, writeBigInt128BE]],
  [OperandType.FF, [32, readBigInt254BE, writeBigInt254BE]],
]);

function readBigInt254BE(this: Buffer, offset: number): bigint {
  const totalBytes = 32;
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret <<= 8n;
    ret |= BigInt(this.readUint8(i + offset));
  }
  return ret;
}

function writeBigInt254BE(this: Buffer, value: bigint): void {
  const totalBytes = 32;
  for (let offset = totalBytes - 1; offset >= 0; --offset) {
    this.writeUint8(Number(value & 0xffn), offset);
    value >>= 8n;
  }
}

function readBigInt128BE(this: Buffer, offset: number): bigint {
  const totalBytes = 16;
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret <<= 8n;
    ret |= BigInt(this.readUint8(i + offset));
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

/**
 * Reads an array of operands from a buffer.
 * @param cursor Buffer to read from. Might be longer than needed.
 * @param operands Specification of the operand types.
 * @returns An array as big as {@code operands}, with the converted TS values.
 */
export function deserialize(cursor: BufferCursor | Buffer, operands: OperandType[]): (number | bigint)[] {
  const argValues = [];
  if (Buffer.isBuffer(cursor)) {
    cursor = new BufferCursor(cursor);
  }

  for (const op of operands) {
    const opType = op;
    const [sizeBytes, reader, _writer] = OPERAND_SPEC.get(opType)!;
    argValues.push(reader.call(cursor.buffer(), cursor.position()));
    cursor.advance(sizeBytes);
  }

  return argValues;
}

/**
 * Serializes a class using the specified operand types.
 * More specifically, this serializes {@code [cls.constructor.opcode, ...Object.values(cls)]}.
 * Observe in particular that:
 *   (1) the first operand type specified must correspond to the opcode;
 *   (2) the rest of the operand types must be specified in the order returned by {@code Object.values()}.
 * @param operands Type specification for the values to be serialized.
 * @param cls The class to be serialized.
 * @returns
 */
export function serializeAs(operands: OperandType[], opcode: Opcode, cls: any): Buffer {
  const chunks: Buffer[] = [];

  const rawClassValues: any[] = [opcode, ...Object.values(cls)];
  assert(
    rawClassValues.length === operands.length,
    `Got ${rawClassValues.length} values but only ${operands.length} serialization operands are specified!`,
  );
  const classValues = rawClassValues as OperandNativeType[];

  for (let i = 0; i < operands.length; i++) {
    const opType = operands[i];
    const [sizeBytes, _reader, writer] = OPERAND_SPEC.get(opType)!;
    const buf = Buffer.alloc(sizeBytes);
    writer.call(buf, classValues[i]);
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}
