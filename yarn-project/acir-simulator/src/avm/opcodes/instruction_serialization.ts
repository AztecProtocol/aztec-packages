import { BufferCursor } from "../buffer_cursor.js";

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